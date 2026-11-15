"""Gated PyNite released-brace experiment, isolated from the mixed solver.

Run with the JPN validation venv and the separate OpenSees venv from CI:
python validation/int-3a/benchmark.py --opensees-python <interpreter>
"""
import argparse
from importlib.metadata import version
import json
from math import dist
from pathlib import Path
import subprocess

E, G = 200e9, 200e9 / 2.6
FRAME = (.02, 8e-5, 8e-5, 6e-5)
BRACE = (.003, 3e-6, 3e-6, 4e-6)
MESH = (4, 8)
LOAD = "C"
TRANSLATIONS = ("DX", "DY", "DZ")
REACTIONS = ("RxnFX", "RxnFY", "RxnFZ", "RxnMX", "RxnMY", "RxnMZ")
ALWAYS_FREE = (False,) * 6
CRITERIA = {
    "relative_component": .01,
    "absolute_floor": {"translations": 1e-6, "forces": 1., "moments": 1., "amplification": 1e-4},
    "brace_kg_relative_operator_error": 1e-8,
    "mesh_relative_component": .005,
    "all_declared_releases_must_be_representable": True,
    "reference_braces_must_be_compressed": True,
    "both_cases_required": True,
}
RELEASES = {
    "both_ends_spherical": (False, False, False, True, True, True) * 2,
    # Sensitivity control: release bending at both ends and torsion at one
    # end. This removes the singular rigid twist of the released subblock.
    "one_end_torsion_release": (False, False, False, False, True, True)
    + (False, False, False, True, True, True),
}
FLAGS = {
    "computedStructuralApproval": False,
    "fabricationRelease": False,
    "releaseGate": "NOT_READY_BLOCKED",
}


def geometry(spatial, mesh):
    base = {"A": (0., 0., 0.), "B": (4., 0., 0.)}
    if spatial:
        base.update(C=(4., 3., 0.), D=(0., 3., 0.))
    top = {name.lower(): (x, y, 3.) for name, (x, y, _) in base.items()}
    nodes = {**base, **top}
    supports = {name: (True,) * 6 for name in base}
    if not spatial:
        supports.update({name: (False, True, False, True, False, True) for name in top})
    roof = list(top)
    edges = list(zip(base, top)) + list(zip(roof, roof[1:]))
    if spatial:
        edges.append((roof[-1], roof[0]))
    frames = {}
    for i, (start, end) in enumerate(edges):
        chain = [start]
        for k in range(1, mesh):
            key = f"F{i}-N{k}"
            nodes[key] = tuple(a+(b-a)*k/mesh for a,b in zip(nodes[start], nodes[end]))
            chain.append(key)
            if not spatial:
                supports[key] = supports["a"]
        chain.append(end)
        for k, (a, b) in enumerate(zip(chain, chain[1:])):
            frames[f"F{i}-{k}"] = (a, b)
    braces = {"X": ("A", "b")}
    if spatial:
        braces["Y"] = ("B", "c")
    loads = {name: (0., 0., -110e3) for name in top}
    loads["b"] = (-25e3, 0., -110e3)
    if spatial:
        loads["c"] = (-8e3, -20e3, -110e3)
    return dict(nodes=nodes, supports=supports, frames=frames, braces=braces, loads=loads, roots=list(base))


def amplification(values, linear):
    peak = max(dist((0., 0.), v[:2]) for v in values.values())
    linear_peak = max(dist((0., 0.), v[:2]) for v in linear.values())
    return peak / linear_peak


def pynite(case, release):
    import numpy as np
    from Pynite import Analysis, FEModel3D

    model = FEModel3D()
    model.add_material("M", E, G, .3, 0.)
    model.add_section("frame", *FRAME)
    model.add_section("brace", *BRACE)
    for name, xyz in case["nodes"].items():
        model.add_node(name, *xyz)
    for name, axis in case["supports"].items():
        model.def_support(name, *axis)
    for group, section in (("frames", "frame"), ("braces", "brace")):
        for name, (a, b) in case[group].items():
            model.add_member(name, a, b, "M", section)
            if group == "braces":
                model.def_releases(name, *release)
    for node, force in case["loads"].items():
        for axis, value in zip(("FX", "FY", "FZ"), force):
            if value:
                model.add_node_load(node, axis, value, LOAD)
    model.add_load_combo(LOAD, {LOAD: 1.})

    # Compare the two-node geometric tangent directly to N/L * (I - xx^T).
    Analysis._prepare_model(model)
    operator, ranks = {}, {}
    translation = [0, 1, 2, 6, 7, 8]
    released = np.flatnonzero(release)
    for name, (a, b) in case["braces"].items():
        segment = next(iter(model.members[name].sub_members.values()))
        matrix = segment._ke_unc()[np.ix_(released, released)]
        ranks[name] = dict(rank=int(np.linalg.matrix_rank(matrix)), size=len(released))
        length = dist(case["nodes"][a], case["nodes"][b])
        x = (np.array(case["nodes"][b])-case["nodes"][a])/length
        stress_force = -10e3
        transverse = stress_force/length * (np.eye(3)-np.outer(x, x))
        expected = np.block([[transverse, -transverse], [-transverse, transverse]])
        try:
            actual = segment.Kg(stress_force)[np.ix_(translation, translation)]
        except np.linalg.LinAlgError:
            operator[name] = None
        else:
            operator[name] = dict(
                relative_error=float(np.linalg.norm(actual-expected, 2)/np.linalg.norm(expected, 2)),
                axial_projection_n_m=float(x @ actual[:3, :3] @ x),
                expected_axial_projection_n_m=0.,
            )
    details = dict(released_elastic_subblock=ranks, geometric_tangent=operator)

    def vector(attributes, names):
        return {n: [float(getattr(model.nodes[n], key)[LOAD]) for key in attributes] for n in names}

    try:
        model.analyze_PDelta(check_stability=True, max_iter=30, sparse=True)
        second = vector(TRANSLATIONS, case["loads"])
        reactions = vector(REACTIONS, case["roots"])
        brace_forces = {n: -float(model.members[n].axial(0., LOAD)) for n in case["braces"]}
        model.analyze_linear(check_stability=True, sparse=True)
        linear = vector(TRANSLATIONS, case["loads"])
    except (ValueError, np.linalg.LinAlgError) as exc:
        return dict(status="refused", error=type(exc).__name__, message=str(exc), **details)
    return dict(status="completed", translations=second, reactions=reactions,
                brace_forces=brace_forces, amplification=amplification(second, linear), **details)


def opensees(case, nonlinear):
    import openseespy.opensees as ops

    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    tags = {name: i for i, name in enumerate(case["nodes"], 1)}
    for name, xyz in case["nodes"].items():
        ops.node(tags[name], *xyz)
    for name, axes in case["supports"].items():
        ops.fix(tags[name], *map(int, axes))
    ops.uniaxialMaterial("Elastic", 1, E)
    for i, (a, b) in enumerate(case["frames"].values(), 1):
        # Local z candidate is perpendicular to all global X/Z elements.
        axis = (0., 0., 1.) if case["nodes"][a][1] != case["nodes"][b][1] else (0., 1., 0.)
        ops.geomTransf("PDelta" if nonlinear else "Linear", i, *axis)
        area, iy, iz, j = FRAME
        ops.element("elasticBeamColumn", i, tags[a], tags[b], area, E, G, j, iy, iz, i)
    brace_ids = {n: len(case["frames"]) + j for j, n in enumerate(case["braces"], 1)}
    for n, (a,b) in case["braces"].items():
        ops.element("corotTruss" if nonlinear else "Truss", brace_ids[n], tags[a], tags[b], BRACE[0], 1)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for n, f in case["loads"].items():
        ops.load(tags[n], *f, 0., 0., 0.)
    ops.constraints("Plain")
    ops.numberer("RCM")
    ops.system("BandGeneral")
    ops.test("NormDispIncr", 1e-12, 30)
    ops.algorithm("Newton")
    ops.integrator("LoadControl", .1)
    ops.analysis("Static")
    if ops.analyze(10) != 0:
        raise RuntimeError("Independent OpenSees solution did not converge")
    ops.reactions()
    return dict(
        translations={n: list(ops.nodeDisp(tags[n])[:3]) for n in case["loads"]},
        reactions={n: list(ops.nodeReaction(tags[n])) for n in case["roots"]},
        brace_forces={n: ops.eleResponse(i, "axialForce")[0] for n, i in brace_ids.items()},
    )


def reference(case):
    import openseespy.opensees as ops

    assert ops.version() == "3.8.0"
    linear = opensees(case, False)
    second = opensees(case, True)
    return dict(version=ops.version(), status="completed", **second,
                amplification=amplification(second["translations"], linear["translations"]))


def compare(candidate, reference, relative):
    metrics = {}

    def field(name, pairs, floor):
        errors, utilization = [], []
        for a,b in pairs:
            errors.append(abs(a-b))
            utilization.append(abs(a-b)/max(floor, relative*abs(b)))
        metrics[name] = dict(max_absolute_error=max(errors), max_bound_utilization=max(utilization))

    floors = CRITERIA["absolute_floor"]
    field("translations_m", ((a,b) for key, v in candidate["translations"].items()
                            for a,b in zip(v, reference["translations"][key])), floors["translations"])
    for name, indices, floor in (("reaction_force_n", range(3), floors["forces"]),
                                 ("reaction_moment_nm", range(3,6), floors["moments"])):
        field(name, ((v[i], reference["reactions"][key][i]) for key,v in candidate["reactions"].items()
                     for i in indices), floor)
    field("brace_force_n", ((v, reference["brace_forces"][n]) for n,v in candidate["brace_forces"].items()),
          floors["forces"])
    field("amplification", [(candidate["amplification"], reference["amplification"])], floors["amplification"])
    return dict(passed=all(v["max_bound_utilization"] <= 1. for v in metrics.values()), metrics=metrics)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("benchmark.json"))
    parser.add_argument("--reference", action="store_true")
    args = parser.parse_args()
    if args.reference:
        import sys
        print(json.dumps(reference(json.load(sys.stdin)), allow_nan=False))
        return
    if not args.opensees_python:
        parser.error("--opensees-python is required")
    assert version("PyNiteFEA") == "3.2.1"
    cases = {}
    for name, spatial in (("planar_portal", False), ("spatial_portal", True)):
        runs = []
        for mesh in MESH:
            case = geometry(spatial, mesh)
            answer = subprocess.run(
                [str(args.opensees_python.absolute()), "-I", str(Path(__file__).absolute()), "--reference"],
                input=json.dumps(case), capture_output=True, text=True, check=True, timeout=60,
            )
            ref = json.loads(answer.stdout)
            candidates = {}
            for label, release in RELEASES.items():
                result = pynite(case, release)
                if result["status"] == "completed":
                    result["comparison_to_opensees"] = compare(result, ref, CRITERIA["relative_component"])
                candidates[label] = result
            runs.append(dict(frame_subdivisions=mesh, opensees=ref, pynite=candidates))
        coarse, fine = runs
        ref_convergence = compare(coarse["opensees"], fine["opensees"], CRITERIA["mesh_relative_component"])
        ref_compression = all(n < 0. for r in runs for n in r["opensees"]["brace_forces"].values())
        required = fine["pynite"]["both_ends_spherical"]
        kg_ok = all(k is not None and k["relative_error"] <= CRITERIA["brace_kg_relative_operator_error"]
                    for k in required["geometric_tangent"].values())
        passed = ref_convergence["passed"] and ref_compression and kg_ok and required.get("comparison_to_opensees", {}).get("passed", False)
        cases[name] = dict(passed=passed, reference_mesh_change=ref_convergence, reference_compression=ref_compression,
                           required_brace_kg_passed=kg_ok, runs=runs)
        print(name, "PASS" if passed else "FAIL", flush=True)
    result = dict(schema_version="jpn.int-3a-benchmark/1", units="SI", pynitefea=version("PyNiteFEA"),
                  criteria=CRITERIA, releases=RELEASES, cases=cases,
                  passed=all(c["passed"] for c in cases.values()), **FLAGS)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
