"""Private independent OpenSees Corotational reference, no JPN/PyNite imports."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
from copy import deepcopy
import openseespy.opensees as ops


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def private_refinement(source, subdivisions):
    """Reference-only computational mesh; never sent to JPN or deployed.

    Application limits remain 150/320. A finer private reference is an
    independently generated numerical study, not an enlarged application.
    """
    out = deepcopy(source)
    out["members"] = []
    points = {n["id"]: [n[k] for k in ("x_m", "y_m", "z_m")] for n in source["nodes"]}
    mapping = []
    for member in source["members"]:
        chain = [member["start"]]
        for j in range(1, subdivisions):
            nid = "PRIVATE-N"+str(len(out["nodes"]))
            if nid in points: raise ValueError("Private ID collision")
            xyz = [points[member["start"]][k]+(points[member["end"]][k]-points[member["start"]][k])*j/subdivisions for k in range(3)]
            out["nodes"].append(dict(id=nid, x_m=xyz[0], y_m=xyz[1], z_m=xyz[2]))
            chain.append(nid)
        chain.append(member["end"])
        for j in range(subdivisions):
            item = deepcopy(member)
            item.update(id="PRIVATE-M"+str(len(mapping)), start=chain[j], end=chain[j+1])
            out["members"].append(item)
            mapping.append(dict(id=item["id"], parent_member=member["id"], start_fraction=j/subdivisions, end_fraction=(j+1)/subdivisions))
    return out, mapping


def solve_spatial(data, transformation):
    if any(m["kind"] != "frame" or m["rotation_deg"] or any(m["release_start"]+m["release_end"]) for m in data["members"]):
        raise ValueError("Unrolled rigid frames required")
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    ids = {n["id"]: i+1 for i, n in enumerate(data["nodes"])}
    xyz = {n["id"]: [n[k] for k in ("x_m", "y_m", "z_m")] for n in data["nodes"]}
    for name, point in xyz.items(): ops.node(ids[name], *point)
    for support in data["supports"]: ops.fix(ids[support["node"]], *map(int, support["restrained"]))
    mats = {r["id"]: r for r in data["materials"]}
    secs = {r["id"]: r for r in data["sections"]}
    for tag, member in enumerate(data["members"], 1):
        d = [xyz[member["end"]][k]-xyz[member["start"]][k] for k in range(3)]
        length = math.sqrt(sum(v*v for v in d))
        axis = [v/length for v in d]
        z = [0., 0., 1.] if abs(axis[1]) > 1-1e-12 else cross(axis, [0., 1., 0.])
        ops.geomTransf(transformation, tag, *z)
        mat, sec = mats[member["material"]], secs[member["section"]]
        ops.element("elasticBeamColumn", tag, ids[member["start"]], ids[member["end"]], sec["area_m2"], mat["e_pa"],
                    mat["g_pa"], sec["j_m4"], sec["iy_m4"], sec["iz_m4"], tag)
    if len(data["combinations"]) != 1: raise ValueError("One independent combination per process")
    factors = data["combinations"][0]["factors"]
    loads = {name: [0.]*6 for name in ids}
    for load in data["nodal_loads"]:
        for i, key in enumerate(("fx_n", "fy_n", "fz_n", "mx_nm", "my_nm", "mz_nm")):
            loads[load["node"]][i] += factors.get(load["case"], 0)*load[key]
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for name, load in loads.items(): ops.load(ids[name], *load)
    ops.constraints("Plain")
    ops.numberer("RCM")
    ops.system("BandGeneral")
    ops.test("NormDispIncr", 1e-12, 50)
    ops.algorithm("Newton")
    ops.integrator("LoadControl", .1)
    ops.analysis("Static")
    iterations = []
    for _ in range(10):
        code = ops.analyze(1)
        if code: raise RuntimeError("OpenSees did not converge: "+str(code))
        iterations.append(ops.testIter())
    ops.reactions()
    nodes = {name: dict(translation_m=list(ops.nodeDisp(tag))[:3], rotation_rad=list(ops.nodeDisp(tag))[3:],
                        reaction_force_n=list(ops.nodeReaction(tag))[:3], reaction_moment_nm=list(ops.nodeReaction(tag))[3:])
             for name, tag in ids.items()}
    return dict(solver="OpenSees", version=ops.version(), transformation=transformation, analysis_return_code=code,
                iterations_by_step=iterations, nodes=nodes,
                member_end_actions_global={m["id"]: list(ops.eleForce(i)) for i, m in enumerate(data["members"], 1)})


if __name__ == "__main__":
    raw = sys.stdin.buffer.read()
    data = json.loads(raw)
    dimension = int(sys.argv[1])
    transformation = sys.argv[2] if len(sys.argv) > 2 else "Corotational"
    subdivisions = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    if not 1 <= subdivisions <= 192: raise ValueError("Explicit bounded private reference study required")
    data, mapping = private_refinement(data, subdivisions)
    if transformation not in ("Corotational", "Linear"): raise ValueError("Transformation not allowed")
    if dimension == 2:
        spec = importlib.util.spec_from_file_location("p3_independent", Path(__file__).parents[1]/"m43-p3/opensees_planar.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        result = module.solve(data, transformation)
    elif dimension == 3:
        result = solve_spatial(data, transformation)
    else: raise ValueError("Explicit dimension required")
    # The elastic basic constitutive law permits U=1/2 v_basic.q_basic even
    # though total external work is NOT 1/2 P.u in a nonlinear trajectory.
    energies = {}
    for tag, member in enumerate(data["members"], 1):
        deformation = list(ops.eleResponse(tag, "basicDeformation" if dimension == 2 else "basicDeformations"))
        force = list(ops.eleResponse(tag, "basicForce"))
        if not deformation or len(force) != len(deformation): raise RuntimeError("Basic energy response unavailable")
        energies[member["id"]] = dict(basic_deformation=deformation, basic_force=force,
                                      strain_energy_j=.5*sum(a*b for a, b in zip(deformation, force)))
    result.update(input_bytes_sha256=hashlib.sha256(raw).hexdigest(), dimensionality=dimension,
                  private_reference_subdivisions=subdivisions, numerical_member_mapping=mapping,
                  reference_node_count=len(data["nodes"]), reference_member_count=len(data["members"]),
                  invocation_sha256=hashlib.sha256(raw+b"\0"+f"{dimension}:{transformation}:{subdivisions}".encode()).hexdigest(),
                  element_energy=energies, strain_energy_j=sum(e["strain_energy_j"] for e in energies.values()),
                  original_geometry=data["nodes"], deformed_geometry={n["id"]: [n[k]+result["nodes"][n["id"]]["translation_m"][i]
                    for i, k in enumerate(("x_m", "y_m", "z_m"))] for n in data["nodes"]},
                  rotation_measure="OpenSees nodal rotational DOFs; do not assume exact total exponential coordinates for noncommuting paths")
    print(json.dumps(result, allow_nan=False))
