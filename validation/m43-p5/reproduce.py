"""Reproducible P5 physical audit. A green campaign is NOT four verified cases.

Each case retains strict failures and literal release blocks. The previously
demonstrated cantilever must pass both independent operators. Other cases may
remain rejected; losing a demonstrated result or worsening a baseline is fatal.
"""
import argparse
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

import numpy as np
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/"engine"))
from jpn_structural.frame3d_model import input_hash
from kirchhoff_chain import solve as rod_solve
from physical_comparison import CRITERIA, compare, compare_orientation, richardson, richardson_orientation

FIELDS = ("translation_m", "reaction_force_n", "reaction_moment_nm", "physical_end_actions", "strain_energy_j")
SAFETY = dict(production_enabled=False, computed_structural_approval=False, fabrication_release=False,
              spatial_domain_verified=False, normative_stability_verified=False, release_gate="NOT_READY_BLOCKED")


def sha(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def physical_matrix(node):
    w, x, y, z = node["orientation_quaternion"]
    return Rotation.from_quat([x, y, z, w]).as_matrix()


def measures(mesh, model):
    row = mesh["combinations"]["C"]
    ends = []
    for parent in model["members"]:
        children = [m for m in mesh["numerical_member_mapping"] if m["parent_member"] == parent["id"]]
        ends.append(row["members"][children[0]["id"]]["end_actions_global"][:6]+
                    row["members"][children[-1]["id"]]["end_actions_global"][6:])
    return {**{k: np.array([row["nodes"][n["id"]][k] for n in model["nodes"]]) for k in FIELDS[:3]},
            "physical_end_actions": np.array(ends), "strain_energy_j": np.array(row["strain_energy_j"])}


def reference_measures(reference, model):
    if "physical_end_actions" in reference:
        ends = reference["physical_end_actions"]
    else:
        ends = []
        for parent in model["members"]:
            children = [m for m in reference["numerical_member_mapping"] if m["parent_member"] == parent["id"]]
            ends.append(reference["member_end_actions_global"][children[0]["id"]][:6]+
                        reference["member_end_actions_global"][children[-1]["id"]][6:])
    return {**{k: np.array([reference["nodes"][n["id"]][k] for n in model["nodes"]]) for k in FIELDS[:3]},
            "physical_end_actions": np.array(ends), "strain_energy_j": np.array(reference["strain_energy_j"])}


def worker(request):
    payload = json.dumps(request, separators=(",", ":"), allow_nan=False).encode()
    if len(payload) > 500000:
        raise AssertionError("Worker input budget exceeded")
    started = time.perf_counter()
    try:
        done = subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT/"engine/local_mixed_worker.py"), "--p4-frame"],
                              input=payload, capture_output=True, timeout=20, cwd=ROOT,
                              env={**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"})
    except subprocess.TimeoutExpired:
        return None, dict(status="TIMEOUT", limit_seconds=20, elapsed_seconds=time.perf_counter()-started)
    if len(done.stdout) > 2000000 or len(done.stderr) > 16000:
        raise AssertionError("Worker output budget exceeded")
    answer = json.loads(done.stdout)
    if done.returncode or answer.get("status") != "diagnostic":
        return None, dict(status="REFUSED", response=answer, elapsed_seconds=time.perf_counter()-started)
    execution = answer["execution"]
    if execution["memory_limit_bytes"] != 768*1024*1024 or execution["local_only"] is not True:
        raise AssertionError("Native memory guard missing")
    result = answer["diagnostic"]
    if any(result[k] != v for k, v in SAFETY.items()):
        raise AssertionError("Experimental release block changed")
    if result["input_sha256"] != input_hash(request):
        raise AssertionError("Worker request binding mismatch")
    for mesh in (result["coarse"], result["candidate"]):
        if mesh["node_count"] > 150 or mesh["member_count"] > 320:
            raise AssertionError("Application geometry budget changed")
    return result, dict(status="diagnostic", elapsed_seconds=time.perf_counter()-started, **execution)


def native(executable, model, subdivisions):
    raw = json.dumps(model, separators=(",", ":"), allow_nan=False).encode()
    # POSIX venv executables are symlinks. Resolving their target bypasses
    # pyvenv.cfg and silently selects the system interpreter without OpenSees.
    done = subprocess.run([str(executable.absolute()), "-I", "-X", "utf8", str(Path(__file__).with_name("opensees_orientations.py")), str(subdivisions)],
                          input=raw, capture_output=True, timeout=60, cwd=ROOT)
    if done.returncode:
        raise RuntimeError("Independent native reference failure: "+done.stderr.decode(errors="replace")[:2000])
    result = json.loads(done.stdout)
    if result["version"] != "3.8.0" or result["input_bytes_sha256"] != hashlib.sha256(raw).hexdigest() or result["analysis_return_code"] != 0:
        raise AssertionError("Independent input/version/solution mismatch")
    return result


def independent_comparison(result, model, references, method):
    arrays = [reference_measures(ref, model) for ref in references]
    if method == "native-order-two-estimate":
        estimates = {k: richardson([a[k] for a in arrays]) for k in FIELDS}
        rotations = {n["id"]: richardson_orientation([r["nodes"][n["id"]]["orientation_matrix"] for r in references]) for n in model["nodes"]}
    else:
        estimates = {k: (arrays[-1][k], abs(arrays[-1][k]-arrays[0][k])) for k in FIELDS}
        rotations = {}
        for n in model["nodes"]:
            a, b = [Rotation.from_matrix(r["nodes"][n["id"]]["orientation_matrix"]) for r in references]
            rotations[n["id"]] = (b.as_matrix(), float((b*a.inv()).magnitude()))
    measured = measures(result["candidate"], model)
    checks = {k: compare(measured[k], estimates[k][0], k, estimates[k][1]) for k in FIELDS}
    nodes = result["candidate"]["combinations"]["C"]["nodes"]
    orientation_checks = {n["id"]: compare_orientation(physical_matrix(nodes[n["id"]]), *rotations[n["id"]]) for n in model["nodes"]}
    return dict(method=method, all_bounds_met=all(c["bounds_met"] for c in checks.values()) and all(c["bounds_met"] for c in orientation_checks.values()),
                checks=checks, orientations=orientation_checks,
                candidate={k: a.tolist() for k, a in measured.items()},
                reference={k: a.tolist() for k, (a, _) in estimates.items()},
                uncertainty={k: u.tolist() for k, (_, u) in estimates.items()},
                physical_nodes={n["id"]: dict(candidate_orientation=physical_matrix(nodes[n["id"]]).tolist(),
                                             reference_orientation=rotations[n["id"]][0].tolist(), reference_uncertainty_rad=rotations[n["id"]][1]) for n in model["nodes"]})


def run(args):
    folder = Path(__file__).parent
    baseline = json.loads((folder/"p4-baseline.json").read_text())
    for path, expected in baseline["source_sha256_lf"].items():
        if sha(ROOT/path) != expected:
            raise AssertionError("P4 algorithm/contract altered: "+path)
    cases = []
    cache = ROOT/".tools/m43-p5-campaign"
    cache.mkdir(parents=True, exist_ok=True)
    for old, coarse, levels in zip(baseline["cases"], (7, 2, 2, 4), ((16, 32, 64), (8, 16, 32), (4, 8, 16), (8, 16, 32))):
        name, request = old["case"], deepcopy(old["request"])
        model = request["model"]
        before, before_execution = worker(request)
        if before is None:
            raise AssertionError("Original P4 reproduction no longer executes: "+name)
        request["numerics"].update(coarse_subdivisions=coarse, fine_subdivisions=2*coarse)
        after, execution = worker(request)
        if after is not None:
            (cache/(name+"-worker.json")).write_text(json.dumps(after, allow_nan=False), encoding="utf-8")
        actual = after or before
        refs = [native(args.opensees_python, model, n) for n in levels]
        for n, ref in zip(levels, refs):
            (cache/f"{name}-native-{n}.json").write_text(json.dumps(ref, allow_nan=False), encoding="utf-8")
        b = independent_comparison(before, model, refs, "native-order-two-estimate")
        a = independent_comparison(actual, model, refs, "native-order-two-estimate")
        rods = None
        if name in ("cantilever", "torsion"):
            rods = [rod_solve(model, tol) for tol in (2e-10, 2e-12)]
            rod_before = independent_comparison(before, model, rods, "continuous-kirchhoff-chain")
            rod_after = independent_comparison(actual, model, rods, "continuous-kirchhoff-chain")
        else:
            rod_before = rod_after = None
        # Same physical input/properties/supports. Only numerical subdivisions vary.
        if actual["candidate"]["analysis_model"]["materials"] != model["materials"] or actual["candidate"]["analysis_model"]["sections"] != model["sections"]:
            raise AssertionError("Physical properties changed during refinement")
        for key in FIELDS:
            if a["checks"][key]["maximum_absolute_error"] > max(CRITERIA["absolute"][key], 1.02*b["checks"][key]["maximum_absolute_error"]):
                raise AssertionError("P5 refinement worsened physical baseline: "+name+":"+key)
        native_equilibrium_verified = all(ref["physical_support_equilibrium"]["accepted"] for ref in refs)
        accepted = (after is not None and actual["physical_convergence_verified"] and a["all_bounds_met"] and
                    native_equilibrium_verified and (rod_after is None or rod_after["all_bounds_met"]))
        if name == "cantilever" and not accepted:
            raise AssertionError("Previously demonstrated strict cantilever comparison regressed")
        row = actual["candidate"]["combinations"]["C"]
        reference_records = []
        for ref in refs:
            reference_records.append({k: ref[k] for k in ("subdivisions", "reference_node_count", "reference_member_count", "strain_energy_j", "trace_sha256", "trace_increment_count", "maximum_trace_sum_error", "input_bytes_sha256", "iterations_by_step", "physical_support_equilibrium")})
            reference_records[-1]["physical_nodes"] = {n["id"]: ref["nodes"][n["id"]] for n in model["nodes"]}
            reference_records[-1]["physical_measures"] = {k: v.tolist() for k, v in reference_measures(ref, model).items()}
        cases.append(dict(case=name, physical_comparison_verified=bool(accepted), requested_numerics=request["numerics"],
                          evaluated_input_sha256=actual["input_sha256"], attempted_input_sha256=input_hash(request),
                          before_execution=before_execution, execution=execution,
                          evaluated_subdivisions=[actual["coarse"]["subdivisions"], actual["candidate"]["subdivisions"]],
                          evaluated_counts=dict(nodes=actual["candidate"]["node_count"], members=actual["candidate"]["member_count"]),
                          before=b, after=a, continuous_before=rod_before, continuous_after=rod_after, continuous_references=rods,
                          native_references=reference_records, refinement=actual["comparison"]["C"],
                          native_equilibrium_verified=native_equilibrium_verified,
                          refinement_verified=actual["physical_convergence_verified"], equilibrium=row["equilibrium"],
                          stability=row["stability"], newton_steps=row["newton_steps"], blockers=actual["blockers"], **SAFETY))
        print(f"{name}: strict physical comparison {'PASS (experimental only)' if accepted else 'FAIL / BLOCKED'}; worker={execution['status']}", flush=True)
    source_paths = [p for p in folder.glob("*.py")]+[folder/"criteria.json", folder/"p4-baseline.json",
                   ROOT/"src/domain/spatial-orientation.ts", ROOT/"engine/tests/test_p5_validation.py"]
    report = dict(schema_version="jpn.m43-p5-campaign/1", base_commit=baseline["source_commit"],
                  environment=dict(python=platform.python_version(), platform=platform.platform()),
                  preserved_p4_sources=baseline["source_sha256_lf"], source_sha256_lf={p.relative_to(ROOT).as_posix(): sha(p) for p in source_paths},
                  criteria=CRITERIA, cases=cases, accepted_cases=[c["case"] for c in cases if c["physical_comparison_verified"]],
                  pending_cases=[c["case"] for c in cases if not c["physical_comparison_verified"]],
                  reference_caveat="Native order-two estimates and /15 remainder are conditional asymptotic estimates, not certified error bounds; independent continuous rods corroborate only the two supported unbranched chains.",
                  **SAFETY)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args())
