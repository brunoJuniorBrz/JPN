"""OpenSees portal oracle over the unchanged INT-3a geometries and sections.

The preload path is uniform vertical roof translation. Its dead nodal forces
are computed from equilibrium of the straight columns and rotated braces at
each preload. This makes the zero of tangent stiffness observable without
following an imperfect or postcritical equilibrium branch.
"""
import argparse
from importlib.util import spec_from_file_location, module_from_spec
import json
from math import dist
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
MESH = 8
RATIOS = (.40, .75)
H = 50.
CRITERIA = {
    "portal_displacement_relative": .01, "amplification_relative": .01,
    "brace_kg_relative": .01, "brace_force_relative": .01,
    "displacement_floor_m": 1e-8, "critical_bracket_relative": 1e-5,
    "equilibrium_relative": 1e-8,
}
spec = spec_from_file_location("int3a", ROOT.parent/"int-3a"/"benchmark.py")
fixture = module_from_spec(spec)
spec.loader.exec_module(fixture)


def loads(case, compression, perturbation):
    roof = case["loads"]
    shortening = 3.*compression/(fixture.E*fixture.FRAME[0])
    result = {key: [0., 0., -compression] for key in roof}
    for a,b in case["braces"].values():
        chord = [v-u for u,v in zip(case["nodes"][a],case["nodes"][b])]
        initial = dist(chord, (0.,0.,0.))
        chord[2] -= shortening
        length = dist(chord, (0.,0.,0.))
        normal = fixture.E*fixture.BRACE[0]*(length-initial)/initial
        for i, x in enumerate(chord):
            result[b][i] += normal*x/length
    for node, force in roof.items():
        result[node][0] += perturbation*force[0]/25e3
        result[node][1] += perturbation*force[1]/25e3
    return result


def native(case, compression, perturbation, matrix):
    import openseespy.opensees as ops

    if ops.version() != "3.8.0":
        raise ValueError("Pinned OpenSees 3.8.0 required")
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    tags = {n:i for i,n in enumerate(case["nodes"], 1)}
    for n, xyz in case["nodes"].items():
        ops.node(tags[n], *xyz)
    for n, flags in case["supports"].items():
        ops.fix(tags[n], *map(int, flags))
    ops.uniaxialMaterial("Elastic", 1, fixture.E)
    for i, (a,b) in enumerate(case["frames"].values(), 1):
        axis = (0.,0.,1.) if case["nodes"][a][1] != case["nodes"][b][1] else (0.,1.,0.)
        ops.geomTransf("Corotational", i, *axis)
        area, iy, iz, j = fixture.FRAME
        ops.element("elasticBeamColumn", i, tags[a], tags[b], area, fixture.E, fixture.G, j, iy, iz, i)
    braces = {n:len(case["frames"])+i for i,n in enumerate(case["braces"],1)}
    for n, (a,b) in case["braces"].items():
        ops.element("corotTruss", braces[n], tags[a], tags[b], fixture.BRACE[0], 1)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    forces = loads(case, compression, perturbation)
    for n, force in forces.items():
        ops.load(tags[n], *force, 0., 0., 0.)
    ops.constraints("Plain")
    ops.numberer("Plain")
    ops.system("FullGeneral")
    # Near the bifurcation the displacement correction is ill-conditioned.
    # For a tangent probe, check force equilibrium and the known straight pose.
    if matrix:
        ops.test("NormUnbalance", 1e-10*max(1e6,compression), 40)
    else:
        ops.test("NormDispIncr", 1e-11, 40)
    ops.algorithm("Newton")
    ops.integrator("LoadControl", .1)
    ops.analysis("Static")
    if ops.analyze(10):
        raise RuntimeError("OpenSees refused the portal load")
    ops.reactions()
    motion = {n:list(ops.nodeDisp(tag)[:3]) for n,tag in tags.items()}
    result = {
        "loads_n": forces, "translation_m": {n:motion[n] for n in forces},
        "reactions": {n:list(ops.nodeReaction(tags[n])) for n in case["roots"]},
        "braces": {},
    }
    for n, (a,b) in case["braces"].items():
        normal = ops.eleResponse(braces[n], "axialForce")[0]
        current = [v+dv-u-du for u,v,du,dv in zip(case["nodes"][a],case["nodes"][b],motion[a],motion[b])]
        length = dist(current,(0.,0.,0.))
        unit = [x/length for x in current]
        result["braces"][n] = {"force_n":normal, "length_m":length, "direction":unit,
            "kg_block_n_m":[[normal/length*(float(i==j)-unit[i]*unit[j]) for j in range(3)] for i in range(3)]}
    if matrix:
        for n,(x,y,z) in case["nodes"].items():
            expected = (0.,0.,-z*compression/(fixture.E*fixture.FRAME[0]))
            if dist(motion[n],expected) > 1e-6:
                raise RuntimeError("Tangent calibration departed from the straight equilibrium path")
        ops.wipeAnalysis()
        ops.constraints("Plain")
        ops.numberer("Plain")
        ops.system("FullGeneral")
        ops.algorithm("Linear")
        ops.integrator("GimmeMCK", 0., 0., 1., 0.)
        ops.analysis("Transient")
        if ops.analyze(1, 0.):
            raise RuntimeError("OpenSees refused tangent extraction")
        result["tangent"] = list(ops.printA("-ret"))
    return result


def child(interpreter, case, compression, perturbation=0., matrix=False):
    cmd = [str(interpreter.absolute()), "-I", str(Path(__file__).absolute()), "--native"]
    done = subprocess.run(cmd, input=json.dumps([case,compression,perturbation,matrix]),
                          capture_output=True, text=True, timeout=30)
    if done.returncode:
        raise RuntimeError(done.stderr[-1800:])
    return json.loads(done.stdout)


def oracle(interpreter, spatial, mesh):
    import numpy as np
    from scipy.linalg import eigvalsh
    from scipy.optimize import brentq

    case = fixture.geometry(spatial, mesh)
    initial = child(interpreter, case, 0., matrix=True)
    dofs = int(len(initial["tangent"])**.5)
    k0 = np.array(initial["tangent"]).reshape(dofs,dofs)
    scale = np.sqrt(np.diag(k0))
    metric = np.outer(scale,scale)
    baseline = k0/metric

    def margin(compression):
        state = child(interpreter, case, compression, matrix=True)
        tangent = np.array(state["tangent"]).reshape(dofs,dofs)/metric
        return float(eigvalsh(tangent,baseline,subset_by_index=(0,0))[0])

    upper = 1e6
    while margin(upper) > 0.:
        upper *= 1.5
        if upper > 6.4e7:
            raise RuntimeError("No critical bracket in declared load domain")
    critical = brentq(margin, 0., upper, rtol=CRITERIA["critical_bracket_relative"])
    unstressed = child(interpreter, case, 0., H)
    norm = lambda v: max(np.linalg.norm(np.asarray(x)[:2]) for x in v.values())
    rows = []
    for ratio in RATIOS:
        compression = ratio*critical
        preload = child(interpreter, case, compression)
        solved = child(interpreter, case, compression, H)
        increment = {n:np.subtract(v,preload["translation_m"][n]).tolist() for n,v in solved["translation_m"].items()}
        rows.append(dict(critical_ratio=ratio,compression_per_column_n=compression,
                         tangent_margin=margin(compression),preload=preload,result=solved,
                         incremental_translation_m=increment,
                         amplification=float(norm(increment)/norm(unstressed["translation_m"]))))
    return dict(mesh=mesh, critical_compression_per_column_n=critical,
                unloaded_probe=unstressed,cases=rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", type=int, choices=(8,16), default=MESH)
    parser.add_argument("--native", action="store_true")
    parser.add_argument("--opensees-python", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT/"oracle.json")
    args = parser.parse_args()
    if args.native:
        print(json.dumps(native(*json.load(sys.stdin)), allow_nan=False))
        return
    report = json.loads((ROOT/"oracle.json").read_text(encoding="utf-8"))
    if not report["spring_truss"]["passed"]:
        raise ValueError("The spring + truss oracle gate must pass first")
    report["portal_criteria"] = CRITERIA
    if (args.mesh != MESH and "portals" in report
            and all(row["mesh"] == MESH for row in report["portals"].values())):
        report["portals_mesh_8"] = report["portals"]
    report["portals"] = {name:oracle(args.opensees_python, spatial, args.mesh)
                         for name,spatial in (("planar",False),("spatial",True))}
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    for case in report["portals"].values():
        print(case["critical_compression_per_column_n"], [row["amplification"] for row in case["cases"]])


if __name__ == "__main__":
    main()
