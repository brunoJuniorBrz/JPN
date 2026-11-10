"""Execute complete independent reference comparisons, never just import fixtures.

OpenSees runs in a separate interpreter supplied explicitly by the operator.
No OpenSees code/binary is shipped with the JPN engine or imported by its API.
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
sys.path.insert(0, str(ROOT / "engine"))
from jpn_structural.second_order_frame import analyze_second_order_frame
from jpn_structural.mixed3d import build_mixed_model,audit_elastic_model
from jpn_structural.model import AnalysisError
from tests.test_second_order_frame import request
from tests.second_order_cases import frame_case,CANTILEVER_PCR

# Fixed before CI: different geometric operators approach an equivalent
# small-strain beam-column as the mesh is refined. 0.2% is a comparison bound,
# NOT the physical acceptance gate (which remains 1e-8 and fails these cases).
LINEAR_RTOL, PDELTA_RTOL = 1e-7, 2e-3
ABS = dict(translation_m=1e-10, rotation_rad=1e-10,
           reaction_force_n=1e-5, reaction_moment_nm=1e-5)


def compare(native, reference, rtol):
    summary = {}
    if set(native) != set(reference):
        raise RuntimeError("Independent solver returned different node IDs")
    for key, atol in ABS.items():
        a = np.array([native[n][key] for n in native])
        b = np.array([reference[n][key] for n in native])
        difference = abs(a-b)
        scale = np.maximum(abs(a), abs(b))
        mask = difference > atol+rtol*scale
        violations = []
        for row, component in np.argwhere(mask)[:10]:
            violations.append(dict(node=list(native)[int(row)], component=int(component),
                                   pynite=float(a[row, component]), opensees=float(b[row, component]),
                                   absolute_error=float(difference[row, component])))
        summary[key] = dict(maximum_absolute_error=float(difference.max()), relative_tolerance=rtol,
                            absolute_tolerance=atol, compared_components=int(a.size),
                            bounds_met=not bool(mask.any()), violating_components=int(mask.sum()),
                            first_violations=violations)
    return summary


def independent(executable, model, nonlinear):
    payload = json.dumps(model, allow_nan=False, separators=(",", ":")).encode()
    completed = subprocess.run([str(executable), "-I", "-X", "utf8", str(Path(__file__).with_name("opensees_reference.py")),
                                *([] if nonlinear else ["--linear"])], input=payload, capture_output=True,
                               timeout=60, cwd=ROOT)
    if completed.returncode:
        raise RuntimeError("Independent execution failed: "+completed.stderr.decode(errors="replace")[:2000])
    result = json.loads(completed.stdout)
    if result["input_bytes_sha256"] != hashlib.sha256(payload).hexdigest() or result["analysis_return_code"] != 0:
        raise RuntimeError("Independent solver did not execute the exact comparison input")
    if result["version"] != "3.8.0":
        raise RuntimeError("The independent reference requires OpenSees 3.8.0")
    return result


def near_critical_study():
    """Unsafe RAW native behavior is observed, never accepted by the API."""
    rows = []
    for ratio in (.4, .6, .79, .95, 1.01):
        raw = frame_case("cantilever", 64, ratio*CANTILEVER_PCR)
        data, _, frames, supports, model, _ = build_mixed_model(raw)
        audit_elastic_model(model,data,frames,supports)
        observed = {}
        try:
            model.analyze_PDelta(log=False,check_stability=True,max_iter=30,sparse=True)
            tip = float(model.nodes["T0"].DX["C"])
            observed = dict(returned_finite=bool(np.isfinite(tip)),tip_x_m=tip,tip_to_length_ratio=abs(tip)/4)
        except Exception as error:
            observed = dict(returned_finite=False,exception=type(error).__name__)
        try:
            answer = analyze_second_order_frame(request(compression_ratio=ratio))
            rejection = answer["status"]
        except AnalysisError as error:
            rejection = error.code
        rows.append(dict(compression_ratio_of_cantilever_pcr=ratio,raw_native_observation=observed,
                         prototype_decision=rejection,productive_use_accepted=False))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("evidence.json"))
    args = parser.parse_args()
    # A (analytic independently tested at 0/5/20/40%, both signs), B/C/D below.
    grid = [("cantilever", .2, 2000.), ("cantilever", .2, -2000.),
            ("sway", 0., 2000.), ("sway", .1, 2000.), ("sway", .2, 2000.), ("sway", .4, 2000.),
            ("braced", .2, 2000.), ("spatial", .2, 2000.)]
    cases = []
    for kind, ratio, horizontal in grid:
        raw = request(kind, compression_ratio=ratio, horizontal_n=horizontal,
                      coarse=16 if kind in ("sway", "braced") else None)
        try:
            result = analyze_second_order_frame(raw)
        except AnalysisError as error:
            # Explicitly prescribed boundary case: portal lateral force also
            # changes column axial forces, so its weakest tangent mode reaches
            # the pilot margin before the isolated cantilever load scale.
            if kind != "sway" or ratio != .4 or error.code != "PDELTA_DOMAIN_MARGIN":
                raise
            cases.append(dict(geometry=kind,compression_per_column_n=ratio*CANTILEVER_PCR,lateral_x_n=horizontal,
                              independent_comparison_executed=False,native_rejection=error.code,
                              all_independent_bounds_met=False,production_enabled=False))
            print(f"{kind}: comparison NOT executed; prototype explicitly rejected {error.code}",flush=True)
            continue
        mesh = result["candidate"]["analysis_model"]
        # absolute() keeps the venv executable path on Linux; resolve() would
        # follow its symlink and silently lose the isolated site-packages.
        first = independent(args.opensees_python.absolute(), mesh, False)
        second = independent(args.opensees_python.absolute(), mesh, True)
        actual = result["candidate"]["combinations"]["C"]
        checks = dict(linear=compare(result["linear_baseline"]["combinations"]["C"]["nodes"], first["nodes"], LINEAR_RTOL),
                      pdelta=compare(actual["nodes"], second["nodes"], PDELTA_RTOL))
        # End actions in the SAME global basis; no local-axis copying from PyNite.
        aa = np.array([actual["members"][m["id"]]["end_actions_global"] for m in mesh["members"]])
        bb = np.array([second["member_end_actions_global"][m["id"]] for m in mesh["members"]])
        member_mask = abs(aa-bb) > 1e-5+PDELTA_RTOL*np.maximum(abs(aa), abs(bb))
        all_bounds_met = not bool(member_mask.any()) and all(
            c["bounds_met"] for phase in checks.values() for c in phase.values())
        if kind == "cantilever" and not all_bounds_met:
            raise RuntimeError("The proven complete cantilever reference regressed")
        # Other geometries intentionally expose discrepancies. They are NOT
        # converted into passing reference checks or ignored by a tolerance
        # change. The implementation must explicitly reject every candidate.
        if (result["status"] != "diagnostic-rejected" or result["production_enabled"] or
                result["physical_convergence_verified"] or result["fabrication_release"]):
            raise RuntimeError("Unverified second-order candidate was accepted")
        member_violations = []
        for row, component in np.argwhere(member_mask)[:10]:
            mid = mesh["members"][int(row)]["id"]
            parent = next(m for m in result["candidate"]["numerical_member_mapping"] if m["id"] == mid)
            member_violations.append(dict(member=mid, parent=parent, component=int(component),
                                          pynite=float(aa[row, component]), opensees=float(bb[row, component]),
                                          absolute_error=float(abs(aa[row, component]-bb[row, component]))))
        physical_ids = [n["id"] for n in raw["model"]["nodes"]]
        moments = {}
        for support in raw["model"]["supports"]:
            nid = support["node"]
            first_m = result["linear_baseline"]["combinations"]["C"]["nodes"][nid]["reaction_moment_nm"]
            second_m = actual["nodes"][nid]["reaction_moment_nm"]
            a, b = float(np.linalg.norm(first_m)), float(np.linalg.norm(second_m))
            moments[nid] = dict(linear_moment_nm=first_m,candidate_moment_nm=second_m,
                                norm_amplification_at_same_support=b/a if a > 1e-12 else None)
        strain_mismatch = max(abs(value["recovered_axial_strain_force_n"]-
                                   actual["native_trace"]["assembly_axial_n"][mid])
                              for mid,value in actual["members"].items())
        cases.append(dict(
            geometry=kind, compression_per_column_n=raw["model"]["nodal_loads"][0]["fz_n"]*-1,
            independent_comparison_executed=True,
            lateral_x_n=horizontal, units="SI", subdivisions=result["candidate"]["subdivisions"],
            compared_nodes=len(mesh["nodes"]), compared_members=len(mesh["members"]),
            all_independent_bounds_met=all_bounds_met,
            exact_input_bytes_sha256=second["input_bytes_sha256"], checks=checks,
            linear_physical_nodes={n: result["linear_baseline"]["combinations"]["C"]["nodes"][n] for n in physical_ids},
            pynite_physical_nodes={n: actual["nodes"][n] for n in physical_ids},
            opensees_physical_nodes={n: second["nodes"][n] for n in physical_ids},
            opensees_iterations_by_step=second["iterations_by_step"],
            native_steps={k: v for k, v in actual["native_trace"].items() if k != "assembly_axial_n"},
            maximum_assembly_recovery_axial_difference_n=float(strain_mismatch),
            support_moment_comparison=moments,
            full_dead_load_equilibrium=actual["equilibrium"], refinement=result["comparison"]["C"],
            prototype_status=result["status"], blockers=result["blockers"],
            member_end_comparison=dict(relative_tolerance=PDELTA_RTOL, absolute_tolerance=1e-5,
                maximum_absolute_difference=float(abs(aa-bb).max()),bounds_met=not bool(member_mask.any()),
                violating_components=int(member_mask.sum()),first_violations=member_violations)))
        print(f"{kind}: P={cases[-1]['compression_per_column_n']:.6g} N, H={horizontal:g} N: comparison executed; all bounds met={all_bounds_met}; productive use BLOCKED", flush=True)
    files = ["engine/jpn_structural/second_order_frame.py", "engine/jpn_structural/mixed3d.py",
             "engine/tests/second_order_cases.py", "engine/tests/test_second_order_frame.py",
             "validation/m43-p2/opensees_reference.py", "validation/m43-p2/reproduce.py"]
    evidence = dict(schema_version="jpn.m43-p2-independent-evidence/1", generated_at_utc=datetime.now(timezone.utc).isoformat(),
                    environment=dict(python=platform.python_version(), platform=platform.platform(), PyNiteFEA=version("PyNiteFEA")),
                    independent_solver=dict(name="OpenSees", version="3.8.0", interpreter_isolated=True),
                    interpretation="Executed diagnostics; discrepancies retained, not homologation or an accepted nonlinear engine",
                    comparisons_attempted=len(cases),comparisons_executed=sum(c["independent_comparison_executed"] for c in cases),
                    comparisons_with_all_bounds_met=sum(c["all_independent_bounds_met"] for c in cases),
                    source_sha256_lf={p: hashlib.sha256((ROOT/p).read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in files},
                    cases=cases, near_critical_study=near_critical_study(), normative_stability_verified=False, fabrication_release=False,
                    production_enabled=False, release_gate="NOT_READY_BLOCKED")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, allow_nan=False)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
