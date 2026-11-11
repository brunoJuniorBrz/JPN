"""Executed P4 study, independent references and explicit remaining failures.

P3 numerical quality is mandatory. P4 fixed component bounds are evaluated
without edits; spatial failures stay in the evidence and numerical drift is
separately guarded by the committed diagnostic baseline.
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
from tests.p4_cases import request
from tests.test_corotational_planar import rehash
from jpn_structural.p4_frame import analyze_p4_frame, run_mesh
from jpn_structural.model import AnalysisError
from planar_study import study, physical_ends
from stability_study import study as spatial_stability_study
from jpn_structural.spatial_corotational import element_response as spatial_element

CRITERIA = json.loads(Path(__file__).with_name("criteria.json").read_text())
FIELDS = dict(translation_m=1e-10, rotation_rad=1e-10, reaction_force_n=1e-5, reaction_moment_nm=1e-5,
              physical_end_actions=1e-5, strain_energy_j=1e-8)


def compare(a, b, key, rtol, uncertainty=0.):
    a, b = np.asarray(a), np.asarray(b)
    difference = abs(a-b)
    uncertainty = np.broadcast_to(uncertainty, difference.shape)
    if not all(np.isfinite(x).all() for x in (a,b,uncertainty)) or np.any(uncertainty < 0):
        raise AssertionError("Nonfinite/invalid independent reference or uncertainty")
    allowed = FIELDS[key]+rtol*np.maximum(abs(a), abs(b))
    mask = difference+uncertainty > allowed
    index = np.unravel_index(int(np.argmax(difference/allowed)), difference.shape)
    return dict(maximum_absolute_error=float(difference.max()), maximum_reference_uncertainty=float(uncertainty.max()),
                maximum_bound_utilization=float(((difference+uncertainty)/allowed).max()),
                compared_components=int(a.size), violating_components=int(mask.sum()), bounds_met=not bool(mask.any()),
                relative_tolerance=rtol, absolute_tolerance=FIELDS[key], worst_component=list(map(int, index)),
                candidate_at_worst=float(a[index]), reference_at_worst=float(b[index]),
                uncertainty_at_worst=float(uncertainty[index]))


def independent(executable, model, dimension, subdivisions):
    raw = json.dumps(model, separators=(",", ":"), allow_nan=False).encode()
    invocation = f"{dimension}:Corotational:{subdivisions}"
    done = subprocess.run([str(executable.absolute()), "-I", "-X", "utf8", str(Path(__file__).with_name("opensees_reference.py")),
                           str(dimension), "Corotational", str(subdivisions)], input=raw, capture_output=True, timeout=60, cwd=ROOT)
    if done.returncode: raise RuntimeError("Independent OpenSees failure: "+done.stderr.decode(errors="replace")[:2000])
    r = json.loads(done.stdout)
    if r["version"] != "3.8.0" or r["input_bytes_sha256"] != hashlib.sha256(raw).hexdigest() or r["analysis_return_code"] != 0:
        raise AssertionError("Independent input/version/solution mismatch")
    if r["invocation_sha256"] != hashlib.sha256(raw+b"\0"+invocation.encode()).hexdigest(): raise AssertionError("Reference invocation mismatch")
    # nodeReaction in a FREE DOF is an algebraic imbalance, not an invented
    # physical support. Preserve it separately and sum physical supports only.
    loads = {n["id"]: np.zeros(6) for n in model["nodes"]}
    factors = model["combinations"][0]["factors"]
    for load in model["nodal_loads"]:
        loads[load["node"]] += factors.get(load["case"], 0)*np.array([load[k] for k in ("fx_n","fy_n","fz_n","mx_nm","my_nm","mz_nm")])
    supports = {s["node"]: s["restrained"] for s in model["supports"]}
    origin = np.array([model["nodes"][0][k] for k in ("x_m","y_m","z_m")])
    fsum, msum, free_max = np.zeros(3), np.zeros(3), 0.
    for n in model["nodes"]:
        answer = r["nodes"][n["id"]]
        reaction = np.array(answer["reaction_force_n"]+answer["reaction_moment_nm"])
        fixed = supports.get(n["id"], [False]*6)
        free_max = max(free_max, max([abs(reaction[i]) for i in range(6) if not fixed[i]] or [0.]))
        physical = np.array([reaction[i] if fixed[i] else 0. for i in range(6)])+loads[n["id"]]
        position = np.array([n[k] for k in ("x_m","y_m","z_m")])+answer["translation_m"]-origin
        fsum += physical[:3]
        msum += np.cross(position, physical[:3])+physical[3:]
    r["physical_support_equilibrium"] = dict(force_residual_n=fsum.tolist(),moment_residual_nm=msum.tolist(),
                                               maximum_free_physical_node_reaction_imbalance=float(free_max),
                                               note="Raw independent residuals retained; not a declaration of reference stability or normative verification")
    return r


def ref_ends(ref, parents):
    out = []
    for parent in parents:
        children = [m for m in ref["numerical_member_mapping"] if m["parent_member"] == parent]
        out.append(ref["member_end_actions_global"][children[0]["id"]][:6]+
                   ref["member_end_actions_global"][children[-1]["id"]][6:])
    return np.array(out)


def check_p3_regression(current_path):
    baseline = json.loads((ROOT/"validation/m43-p3/evidence.json").read_text())
    actual = json.loads(current_path.read_text())
    old, new = baseline["equivalent_corotational_comparisons"], actual["equivalent_corotational_comparisons"]
    if len(old) != len(new): raise AssertionError("P3 comparisons removed")
    for a, b in zip(old, new):
        if (a["geometry"], a["compression_ratio_of_reference_column"], a["lateral_x_n"]) != (b["geometry"], b["compression_ratio_of_reference_column"], b["lateral_x_n"]):
            raise AssertionError("P3 cases changed")
        if a["physical_convergence_verified"] and not b["physical_convergence_verified"]: raise AssertionError("P3 accepted refinement deteriorated")
        for key, value in a["refinement"].items():
            if b["refinement"][key] > max(1e-8, 1.02*value): raise AssertionError("P3 refinement quality deteriorated")
        if not all(c["bounds_met"] for c in b["checks"].values()): raise AssertionError("P3 independent comparison failed")
    return dict(comparisons=len(new), accepted_refinements_preserved=5, quality_bounds_met=True)


def extract(ref, model):
    ids = [n["id"] for n in model["nodes"]]
    return {**{field: np.array([ref["nodes"][n][field] for n in ids]) for field in list(FIELDS)[:4]},
            "physical_end_actions": ref_ends(ref, [m["id"] for m in model["members"]]),
            "strain_energy_j": np.array(ref["strain_energy_j"])}


def actual_measures(result, model):
    mesh = result["candidate"]
    row = mesh["combinations"]["C"]
    ends = physical_ends(mesh)
    return {**{field: np.array([row["nodes"][n["id"]][field] for n in model["nodes"]]) for field in list(FIELDS)[:4]},
            "physical_end_actions": np.array([ends[m["id"]] for m in model["members"]]),
            "strain_energy_j": np.array(row["strain_energy_j"])}


def check_safety(result):
    for flag in ("production_enabled", "normative_stability_verified", "computed_structural_approval", "fabrication_release"):
        if result[flag] is not False: raise AssertionError("Experimental engineering release enabled")
    if result["release_gate"] != "NOT_READY_BLOCKED": raise AssertionError("Release gate changed")
    if result["spatial_domain_verified"] is not False: raise AssertionError("Spatial domain silently promoted")


def independent_instability_observation(executable):
    observations = []
    for ratio in (.95, 1.01):
        raw = request("cantilever", ratio=ratio, horizontal=0., coarse=2)
        model = raw["model"]
        model["sections"][0].update(iy_m4=6e-5, iz_m4=2e-5)
        model["nodal_loads"][-1]["fy_n"] = 1.  # Explicit small lateral action, not an invented imperfection.
        rehash(raw)
        observation = {}
        try:
            ref = independent(executable, model, 3, 16)
            observation = dict(independent_execution_completed=True, input_sha256=ref["invocation_sha256"],
                               physical_tip=ref["nodes"]["T0"], iterations=ref["iterations_by_step"],
                               finite_vector_is_not_stability_verification=True)
        except RuntimeError as error:
            observation = dict(independent_execution_completed=False, failure=str(error)[:300])
        try:
            analyze_p4_frame(raw)
        except AnalysisError as error:
            if error.code not in ("COROTATIONAL_DOMAIN_MARGIN", "COROTATIONAL_INSTABILITY", "P4_MOVEMENT_LIMIT"):
                raise
            observation["prototype_refusal"] = error.code
        else: raise AssertionError("Near-critical/out-of-plane prototype was not refused")
        observations.append(dict(compression_ratio_of_declared_weak_axis_euler=ratio, **observation, accepted_comparison=False, production_enabled=False))
    return observations


def verified_spatial_limits(executable):
    rows = []
    for name, ratio, horizontal in (("axial", .1, 0.), ("biaxial-linear-limit", 0., .02)):
        raw = request("cantilever", ratio=ratio, horizontal=horizontal, coarse=1)
        result = analyze_p4_frame(raw)
        reference = independent(executable, raw["model"], 3, 2)
        measured, expected = actual_measures(result, raw["model"]), extract(reference, raw["model"])
        checks = {key: compare(measured[key], expected[key], key, 1e-7) for key in FIELDS}
        if not all(c["bounds_met"] for c in checks.values()): raise AssertionError("Verified spatial limit regressed: "+repr(checks))
        check_safety(result)
        rows.append(dict(scope=name, checks=checks, all_bounds_met=True, input_sha256=reference["invocation_sha256"],
                         nonlinear_spatial_domain_verified=False, production_enabled=False))
    # Constitutive kernel benchmark only. General spatial applied nodal moments
    # remain rejected by the API: a constant 3D spatial couple is not generally
    # conjugate to an additive rotation-vector potential. Pure twist is a
    # commutative one-axis subgroup, validated here without enabling that API.
    raw = request("cantilever", ratio=0., horizontal=0., coarse=1)
    model = raw["model"]
    compression, torque = 20000., 200.
    model["nodal_loads"][0]["fz_n"] = -compression
    model["nodal_loads"][-1]["mz_nm"] = torque
    reference = independent(executable, model, 3, 1)
    mat, sec = model["materials"][0], model["sections"][0]
    x = np.array([[0., 0., 0.], [0., 0., 4.]])
    ea, gj = mat["e_pa"]*sec["area_m2"], mat["g_pa"]*sec["j_m4"]
    q = np.zeros(12)
    q[8], q[11] = -compression*4/ea, torque*4/gj
    kernel = spatial_element(x, q, ea, mat["e_pa"]*sec["iy_m4"], mat["e_pa"]*sec["iz_m4"], gj,
                             np.array([[0., 0., 1.], [0., 1., 0.], [-1., 0., 0.]]))
    checks = dict(end_actions=compare(kernel["physical_end_actions"], reference["member_end_actions_global"]["PRIVATE-M0"], "physical_end_actions", 1e-7),
                  energy=compare(kernel["energy"], reference["strain_energy_j"], "strain_energy_j", 1e-7),
                  displacement=compare(q[6:9], reference["nodes"]["T0"]["translation_m"], "translation_m", 1e-7),
                  rotation=compare(q[9:12], reference["nodes"]["T0"]["rotation_rad"], "rotation_rad", 1e-7))
    if not all(c["bounds_met"] for c in checks.values()): raise AssertionError("Spatial axial/twist kernel failed: "+repr(checks))
    rows.append(dict(scope="element constitutive axial plus Saint-Venant pure twist; not a general applied-moment API",
                     checks=checks, all_bounds_met=True, input_sha256=reference["invocation_sha256"],
                     nonlinear_spatial_domain_verified=False, production_enabled=False))
    return rows


def scaling_study():
    answers = []
    for factor in (.1, 1., 10.):
        raw = request("sway", dimension=2, ratio=.2, horizontal=2000., coarse=6)
        model = raw["model"]
        for node in model["nodes"]:
            for k in ("x_m", "y_m", "z_m"): node[k] *= factor
        for section in model["sections"]:
            section["area_m2"] *= factor**2
            for k in ("iy_m4", "iz_m4", "j_m4"): section[k] *= factor**4
        for load in model["nodal_loads"]:
            for key in ("fx_n", "fy_n", "fz_n"): load[key] *= factor**2
        rehash(raw)
        result = analyze_p4_frame(raw)
        answer = result["candidate"]["combinations"]["C"]["nodes"]["T0"]
        answers.append(dict(geometric_similarity_scale=factor, units="SI unchanged; physically similar model, not unit reinterpretation",
                            normalized_translation=(np.array(answer["translation_m"])/factor).tolist(),
                            rotation=answer["rotation_rad"], refinement=result["comparison"]["C"],
                            physical_convergence_verified=result["physical_convergence_verified"]))
    for answer in answers:
        if not answer["physical_convergence_verified"]: raise AssertionError("Similar-model refinement failed")
        np.testing.assert_allclose(answer["normalized_translation"], answers[1]["normalized_translation"], rtol=1e-7, atol=1e-10)
        np.testing.assert_allclose(answer["rotation"], answers[1]["rotation"], rtol=1e-7, atol=1e-10)
    return answers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path, required=True)
    parser.add_argument("--p3-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("evidence.json"))
    parser.add_argument("--record-baseline", action="store_true", help="Explicit first recording only; CI never uses this option")
    args = parser.parse_args()
    p3_quality = check_p3_regression(args.p3_evidence)
    verified_limits = verified_spatial_limits(args.opensees_python)
    print("Verified spatial axial/linear limits and constitutive pure twist: 3/3 PASS; general nonlinear spatial domain still BLOCKED", flush=True)
    stability = spatial_stability_study()
    for row in stability:
        expected = row["compression_ratio_of_declared_weak_axis_euler"] < 1
        if row["positive_definite"] != expected or row["eigenpair_relative_residual"] > 1e-8 or row["force_equilibrium_relative_residual"] > 1e-8:
            raise AssertionError("Spatial weak-axis stability study failed")
        if row["maximum_mode_translation_xyz"][1] < .99: raise AssertionError("Weak out-of-plane mode not identified")
    similarity = scaling_study()
    instability_observations = independent_instability_observation(args.opensees_python)
    arc_study = study(lambda data, n: run_mesh(data, n, 2))
    cases = []
    for ratio in (0., .1, .2, .4):
        raw = request("sway", dimension=2, ratio=ratio, horizontal=2000., coarse=6)
        result = analyze_p4_frame(raw)
        check_safety(result)
        if not result["physical_convergence_verified"]: raise AssertionError("P4 planar portal refinement failed")
        refs = [independent(args.opensees_python, raw["model"], 2, n) for n in (24, 48, 96)]
        arrays = [extract(r, raw["model"]) for r in refs]
        measured = actual_measures(result, raw["model"])
        checks = {}
        for key in FIELDS:
            estimate = (4*arrays[2][key]-arrays[1][key])/3
            previous = (4*arrays[1][key]-arrays[0][key])/3
            uncertainty = abs(estimate-previous)/15
            checks[key] = compare(measured[key], estimate, key, 1e-7, uncertainty)
        all_met = all(c["bounds_met"] for c in checks.values())
        if not all_met: raise AssertionError("Planar independent continuum estimate outside fixed bounds: "+repr(checks))
        answer = result["candidate"]["combinations"]["C"]
        cases.append(dict(case="planar-"+str(ratio), dimensionality=2, compression_scale=ratio, comparisons_executed=True,
                          all_bounds_met=all_met, checks=checks, refinement=result["comparison"]["C"],
                          physical_convergence_verified=result["physical_convergence_verified"],
                          reference_method="Richardson order-2 continuum estimate; three actual OpenSees meshes 24/48/96; uncertainty from difference of two estimates /15; not a raw single-solver value",
                          reference_invocations=[dict(subdivisions=r["private_reference_subdivisions"], input_sha256=r["input_bytes_sha256"], invocation_sha256=r["invocation_sha256"],
                                                       nodes=r["reference_node_count"], members=r["reference_member_count"],iterations=r["iterations_by_step"],
                                                       equilibrium=r["physical_support_equilibrium"]) for r in refs],
                          physical_nodes={n["id"]: answer["nodes"][n["id"]] for n in raw["model"]["nodes"]},
                          equilibrium=answer["equilibrium"], stability=answer["stability"], blockers=result["blockers"]))
        print(f"Planar {ratio:g}: independent estimate bounds PASS; mesh PASS; productive use BLOCKED", flush=True)
    for kind, ratio, horizontal, coarse in (("cantilever", .1, 1000., 2), ("sway", .1, 1000., 1),
                                            ("spatial", .2, 2000., 1), ("torsion", .05, 200., 1)):
        raw = request(kind, ratio=ratio, horizontal=horizontal, coarse=coarse)
        result = analyze_p4_frame(raw)
        check_safety(result)
        ref = independent(args.opensees_python, raw["model"], 3, 16)
        a, b = actual_measures(result, raw["model"]), extract(ref, raw["model"])
        checks = {key: compare(a[key], b[key], key, 1e-7 if key == "strain_energy_j" else .002) for key in FIELDS}
        all_met = all(c["bounds_met"] for c in checks.values())
        answer = result["candidate"]["combinations"]["C"]
        if "P4_SPATIAL_DOMAIN_NOT_VERIFIED" not in result["blockers"]: raise AssertionError("Spatial domain silently accepted")
        cases.append(dict(case="spatial-"+kind, dimensionality=3, comparisons_executed=True, all_bounds_met=all_met,
                          checks=checks, refinement=result["comparison"]["C"], physical_convergence_verified=result["physical_convergence_verified"],
                          reference_method="Executed OpenSees Corotational private mesh 16; mean-director triad and arc-enhanced P4 are distinct operators",
                          reference_invocations=[dict(subdivisions=16, input_sha256=ref["input_bytes_sha256"], invocation_sha256=ref["invocation_sha256"],
                                                       nodes=ref["reference_node_count"], members=ref["reference_member_count"], iterations=ref["iterations_by_step"],
                                                       equilibrium=ref["physical_support_equilibrium"],rotation_measure=ref["rotation_measure"])],
                          physical_nodes={n["id"]: answer["nodes"][n["id"]] for n in raw["model"]["nodes"]},
                          equilibrium=answer["equilibrium"], stability=answer["stability"], blockers=result["blockers"]))
        print(f"Spatial {kind}: comparison EXECUTED, all fixed bounds met={all_met}; mesh={result['physical_convergence_verified']}; spatial domain BLOCKED", flush=True)
    baseline_path = Path(__file__).with_name("diagnostic-baseline.json")
    metrics = {row["case"]: {**{k: c["maximum_absolute_error"] for k, c in row["checks"].items()},
                              **{"mesh:"+k: v for k, v in row["refinement"].items()}} for row in cases}
    if args.record_baseline:
        if baseline_path.exists(): raise RuntimeError("Baseline exists; do not overwrite it to hide a failure")
        baseline_path.write_text(json.dumps(dict(schema_version="jpn.m43-p4-diagnostic-baseline/1", interpretation="Diagnostic drift only; not physical acceptance", metrics=metrics), indent=2)+"\n")
    else:
        base = json.loads(baseline_path.read_text())["metrics"]
        if set(base) != set(metrics): raise AssertionError("P4 cases removed")
        for case, row in base.items():
            for key, expected in row.items():
                floor = 1e-8 if key.startswith("mesh:") else FIELDS[key]
                if not 0 <= metrics[case][key] <= max(floor, 1.02*expected): raise AssertionError(f"P4 diagnostic drift: {case} {key}")
    files = ["engine/jpn_structural/hermite_arc.py", "engine/jpn_structural/second_jet.py", "engine/jpn_structural/spatial_corotational.py",
             "engine/jpn_structural/p4_frame.py", "engine/tests/test_p4_mechanics.py", "engine/tests/test_p4_frame.py",
             "engine/tests/p4_cases.py", "validation/m43-p4/planar_study.py", "validation/m43-p4/diagnostic-baseline.json",
             "validation/m43-p4/reproduce.py", "validation/m43-p4/opensees_reference.py", "validation/m43-p4/stability_study.py", "validation/m43-p4/criteria.json"]
    evidence = dict(schema_version="jpn.m43-p4-evidence/1", generated_at_utc=datetime.now(timezone.utc).isoformat(),
                    environment=dict(python=platform.python_version(), platform=platform.platform(), PyNiteFEA=version("PyNiteFEA")),
                    criteria=CRITERIA,p3_regression=p3_quality, arc_refinement_study=arc_study, comparisons=cases,
                    verified_spatial_limits=verified_limits, spatial_stability_study=stability, physical_similarity_study=similarity,
                    independent_instability_observations=instability_observations,
                    source_sha256_lf={f: hashlib.sha256((ROOT/f).read_bytes().replace(b"\r\n",b"\n")).hexdigest() for f in files},
                    spatial_domain_verified=False, production_enabled=False, normative_stability_verified=False,
                    computed_structural_approval=False, fabrication_release=False, release_gate="NOT_READY_BLOCKED")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, allow_nan=False)+"\n", encoding="utf-8")


if __name__ == "__main__": main()
