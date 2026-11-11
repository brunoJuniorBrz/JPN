"""Independent, private OpenSees 3.8 planar reference; no JPN/PyNite import.

Original input coordinates/forces remain XZ. Planar theta is about global -Y.
Uses public OpenSees commands, not a redistribution/port of solver sources.
"""
import hashlib
import json
import sys
import openseespy.opensees as ops


def solve(data, transformation):
    y = data["nodes"][0]["y_m"]
    if any(n["y_m"] != y for n in data["nodes"]):
        raise ValueError("Reference cannot project spatial geometry")
    if any(l[k] != 0 for l in data["nodal_loads"] for k in ("fy_n", "mx_nm", "mz_nm")):
        raise ValueError("Reference cannot drop spatial actions")
    if any(m["kind"] != "frame" or m["rotation_deg"] != 0 or any(m["release_start"]+m["release_end"]) for m in data["members"]):
        raise ValueError("Reference requires declared unrolled rigid-ended frames")
    if len(data["combinations"]) != 1:
        raise ValueError("One combination per independent process")
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)
    ids = {n["id"]: i+1 for i, n in enumerate(data["nodes"])}
    for node in data["nodes"]:
        ops.node(ids[node["id"]], node["x_m"], node["z_m"])
    for s in data["supports"]:
        ops.fix(ids[s["node"]], *[int(s["restrained"][i]) for i in (0, 2, 4)])
    mats = {m["id"]: m for m in data["materials"]}
    secs = {s["id"]: s for s in data["sections"]}
    ops.geomTransf(transformation, 1)
    for tag, m in enumerate(data["members"], 1):
        sec, mat = secs[m["section"]], mats[m["material"]]
        ops.element("elasticBeamColumn", tag, ids[m["start"]], ids[m["end"]],
                    sec["area_m2"], mat["e_pa"], sec["iy_m4"], 1)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    factors = data["combinations"][0]["factors"]
    loads = {name: [0., 0., 0.] for name in ids}
    for load in data["nodal_loads"]:
        values = [load["fx_n"], load["fz_n"], -load["my_nm"]]
        for i, value in enumerate(values):
            loads[load["node"]][i] += factors.get(load["case"], 0)*value
    for name, load in loads.items():
        ops.load(ids[name], *load)
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
        if code != 0:
            raise RuntimeError("Independent OpenSees did not converge: "+str(code))
        iterations.append(ops.testIter())
    ops.reactions()
    nodes = {}
    for name, tag in ids.items():
        u, v, t = ops.nodeDisp(tag)
        rx, rz, rm = ops.nodeReaction(tag)
        nodes[name] = dict(translation_m=[u, 0., v], rotation_rad=[0., -t, 0.],
                           reaction_force_n=[rx, 0., rz], reaction_moment_nm=[0., -rm, 0.])
    members = {}
    for tag, m in enumerate(data["members"], 1):
        f = ops.eleForce(tag)
        members[m["id"]] = [f[0], 0., f[1], 0., -f[2], 0., f[3], 0., f[4], 0., -f[5], 0.]
    return dict(solver="OpenSees", version=ops.version(), transformation=transformation,
                analysis_return_code=code, iterations_by_step=iterations, nodes=nodes,
                member_end_actions_global=members)


if __name__ == "__main__":
    raw = sys.stdin.buffer.read()
    transformation = sys.argv[1] if len(sys.argv) == 2 else "Corotational"
    if transformation not in ("Linear", "PDelta", "Corotational"):
        raise ValueError("Explicit transformation required")
    result = solve(json.loads(raw), transformation)
    result["input_bytes_sha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, allow_nan=False))
