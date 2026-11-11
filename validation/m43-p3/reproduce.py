"""Execute frozen P2 drift checks, complete linear and equivalent P3 references.

Failures raise and fail CI. Spatial P3 refusal is explicit, never a planar
projection or an assertion that the unchanged P2 discrepancies were solved.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/"engine"), str(Path(__file__).parent)]
from regression import check_regression
from jpn_structural.corotational_planar import analyze_corotational_planar
from jpn_structural.second_order_frame import refine_model
from jpn_structural.mixed3d import build_mixed_model, audit_elastic_model
from jpn_structural.model import AnalysisError
from tests.test_corotational_planar import request
from tests.test_second_order_frame import request as p2_request

CRITERIA = json.loads(Path(__file__).with_name("criteria.json").read_text())
RTOL = CRITERIA["equivalent_corotational_relative_tolerance"]
ABS = dict(translation_m=1e-10, rotation_rad=1e-10, reaction_force_n=1e-5, reaction_moment_nm=1e-5,
           member_end_actions_global=1e-5)


def independent(executable, mesh, transformation="Corotational", spatial=False):
    payload = json.dumps(mesh, separators=(",", ":"), allow_nan=False).encode()
    script = ROOT/"validation/m43-p2/opensees_reference.py" if spatial else Path(__file__).with_name("opensees_planar.py")
    arguments = ["--linear"] if spatial else [transformation]
    completed = subprocess.run([str(executable.absolute()), "-I", "-X", "utf8", str(script), *arguments],
                               input=payload, capture_output=True, timeout=60, cwd=ROOT)
    if completed.returncode:
        raise RuntimeError("Independent execution failed: "+completed.stderr.decode(errors="replace")[:2000])
    reference = json.loads(completed.stdout)
    if (reference["version"] != "3.8.0" or reference["analysis_return_code"] != 0 or
            reference["input_bytes_sha256"] != hashlib.sha256(payload).hexdigest()):
        raise RuntimeError("Independent comparison did not run the exact declared input/version")
    return reference


def check(a, b, key):
    a, b = np.asarray(a), np.asarray(b)
    difference = abs(a-b)
    allowed = ABS[key]+RTOL*np.maximum(abs(a), abs(b))
    mask = difference > allowed
    result = dict(compared_components=a.size, maximum_absolute_error=float(difference.max()),
                  maximum_bound_utilization=float((difference/allowed).max()),
                  relative_tolerance=RTOL, absolute_tolerance=ABS[key],
                  violating_components=int(mask.sum()), bounds_met=not bool(mask.any()))
    if mask.any():
        raise AssertionError(f"Independent {key} disagreement: {result}")
    return result


def checks(actual, ref, mesh):
    result = {}
    for key in ("translation_m", "rotation_rad", "reaction_force_n", "reaction_moment_nm"):
        result[key] = check([actual["nodes"][n["id"]][key] for n in mesh["nodes"]],
                            [ref["nodes"][n["id"]][key] for n in mesh["nodes"]], key)
    result["member_end_actions_global"] = check(
        [actual["members"][m["id"]]["end_actions_global"] for m in mesh["members"]],
        [ref["member_end_actions_global"][m["id"]] for m in mesh["members"]], "member_end_actions_global")
    return result


def linear_comparison(kind, ratio, executable):
    raw = p2_request(kind, compression_ratio=ratio, coarse=16 if kind in ("sway", "braced") else None)
    mesh, _ = refine_model(raw["model"], raw["numerics"]["fine_subdivisions"])
    _, _, frames, supports, model, _ = build_mixed_model(mesh)
    audit_elastic_model(model, mesh, frames, supports)
    model.analyze_linear(log=False, check_stability=True, sparse=True)
    nodes = {}
    for name, node in model.nodes.items():
        nodes[name] = {key: [float(getattr(node, k)["C"]) for k in columns] for key, columns in (
            ("translation_m", ("DX", "DY", "DZ")), ("rotation_rad", ("RX", "RY", "RZ")),
            ("reaction_force_n", ("RxnFX", "RxnFY", "RxnFZ")), ("reaction_moment_nm", ("RxnMX", "RxnMY", "RxnMZ")))}
    members = {name: dict(end_actions_global=next(iter(m.sub_members.values())).F("C").ravel().tolist())
               for name, m in model.members.items()}
    ref = independent(executable, mesh, "Linear", spatial=kind == "spatial")
    return dict(geometry=kind, compression_ratio_of_reference_column=ratio,
                exact_input_bytes_sha256=ref["input_bytes_sha256"], checks=checks(dict(nodes=nodes, members=members), ref, mesh))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path, required=True)
    parser.add_argument("--p2-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("evidence.json"))
    args = parser.parse_args()
    p2 = json.loads(args.p2_evidence.read_text(encoding="utf-8"))
    measured_baseline = check_regression(p2)
    linear = [linear_comparison(kind, ratio, args.opensees_python) for kind, ratio in (
        ("cantilever", .2), ("sway", 0.), ("sway", .1), ("sway", .2), ("braced", .2), ("spatial", .2))]
    print("Complete linear node/end-action comparisons: 6/6 passed, including spatial", flush=True)
    cases = []
    for kind, ratio, horizontal, coarse in (
            ("cantilever", 0., 2000., 32), ("cantilever", .05, 2000., 32),
            ("cantilever", .2, 2000., 32), ("cantilever", .2, -2000., 32),
            ("sway", 0., 2000., 24), ("sway", .1, 2000., 24), ("sway", .2, 2000., 24), ("sway", .4, 2000., 24),
            ("braced", .2, 2000., 18)):
        raw = request(kind, ratio=ratio, horizontal=horizontal, coarse=coarse)
        result = analyze_corotational_planar(raw)
        for flag in ("production_enabled", "normative_stability_verified", "computed_structural_approval", "fabrication_release"):
            if result[flag] is not False:
                raise AssertionError("Experimental safety flag enabled")
        fine = result["candidate"]
        mesh, actual = fine["analysis_model"], fine["combinations"]["C"]
        ref = independent(args.opensees_python, mesh)
        compared = checks(actual, ref, mesh)
        if not actual["equilibrium"]["accepted"]:
            raise AssertionError("Deformed physical equilibrium failed")
        if any(m["axial_n"] != m["geometric_axial_n"] for m in actual["members"].values()):
            raise AssertionError("Assembly and recovery use different states")
        cases.append(dict(geometry=kind, compression_ratio_of_reference_column=ratio, lateral_x_n=horizontal,
                          request_sha256=result["input_sha256"], exact_input_bytes_sha256=ref["input_bytes_sha256"],
                          independent_transformation=ref["transformation"], independent_iterations=ref["iterations_by_step"],
                          compared_nodes=len(mesh["nodes"]), compared_members=len(mesh["members"]),
                          checks=compared, physical_equilibrium=actual["equilibrium"], newton_steps=actual["newton_steps"],
                          refinement=result["comparison"]["C"], physical_convergence_verified=result["physical_convergence_verified"],
                          physical_nodes={n["id"]: actual["nodes"][n["id"]] for n in raw["model"]["nodes"]},
                          maximum_assembly_recovery_axial_difference_n=0., blockers=result["blockers"],
                          production_enabled=False, fabrication_release=False))
        print(f"{kind} load scale {ratio:g}, H={horizontal:g}: all independent bounds passed; mesh verified={result['physical_convergence_verified']}; production BLOCKED", flush=True)
    refusals = []
    for kind, ratio in (("spatial", .2), ("cantilever", .4), ("cantilever", .95), ("cantilever", 1.01)):
        try:
            analyze_corotational_planar(request(kind, ratio=ratio, coarse=32 if ratio==.4 else 8))
        except AnalysisError as error:
            if error.code not in ("COROTATIONAL_SPATIAL_PENDING", "COROTATIONAL_DOMAIN_MARGIN", "COROTATIONAL_INSTABILITY"):
                raise
            refusals.append(dict(geometry=kind, load_scale=ratio, rejection=error.code, independent_comparison_executed=False))
        else:
            raise AssertionError(f"Expected domain refusal was silently accepted: {kind} {ratio}")
    files = ["engine/jpn_structural/corotational_planar.py", "engine/tests/test_corotational_planar.py",
             "validation/m43-p3/reproduce.py", "validation/m43-p3/opensees_planar.py",
             "validation/m43-p3/regression.py", "validation/m43-p3/criteria.json", "validation/m43-p3/p2-baseline.json"]
    import inspect
    import Pynite.Analysis
    from Pynite.Member3D import Member3D
    installed = {Path(inspect.getfile(item)).name: hashlib.sha256(Path(inspect.getfile(item)).read_bytes()).hexdigest()
                 for item in (Pynite.Analysis, Member3D)}
    evidence = dict(schema_version="jpn.m43-p3-independent-evidence/1", generated_at_utc=datetime.now(timezone.utc).isoformat(),
                    environment=dict(python=platform.python_version(), platform=platform.platform(), PyNiteFEA=version("PyNiteFEA")),
                    installed_dependency_source_hashes=installed, criteria=CRITERIA,
                    source_sha256_lf={p: hashlib.sha256((ROOT/p).read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in files},
                    p2_regression=dict(cases=len(measured_baseline), metrics=sum(len(r) for r in measured_baseline.values()),
                                       bounds_met=True, physical_acceptance=False),
                    linear_comparisons=linear, equivalent_corotational_comparisons=cases, refusals=refusals,
                    spatial_correction_verified=False, production_enabled=False, normative_stability_verified=False,
                    computed_structural_approval=False, fabrication_release=False, release_gate="NOT_READY_BLOCKED")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, allow_nan=False)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
