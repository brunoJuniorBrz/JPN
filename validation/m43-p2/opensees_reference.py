"""Independent OpenSees 3.8 reference CLI. Internal validation use only.

This is not imported by JPN or deployed. Install OpenSeesPy only in a private
validation environment, subject to its license. Input is the exact SI frame
mesh JSON; no PyNite/JPN implementation or results are imported here.
"""
import hashlib
import json
import math
import sys

import openseespy.opensees as ops


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def solve(data, nonlinear=True):
    if any(m["kind"] != "frame" or m["rotation_deg"] or
           any(m["release_start"]+m["release_end"]) for m in data["members"]):
        raise ValueError("Independent reference is rigid-ended frame-only, zero section roll")
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    ids = {n["id"]: i+1 for i, n in enumerate(data["nodes"])}
    xyz = {n["id"]: [n[k] for k in ("x_m", "y_m", "z_m")] for n in data["nodes"]}
    for name, v in xyz.items():
        ops.node(ids[name], *v)
    for support in data["supports"]:
        ops.fix(ids[support["node"]], *map(int, support["restrained"]))
    mats = {m["id"]: m for m in data["materials"]}
    secs = {s["id"]: s for s in data["sections"]}
    for tag, m in enumerate(data["members"], 1):
        dx = [xyz[m["end"]][j]-xyz[m["start"]][j] for j in range(3)]
        length = math.sqrt(sum(x*x for x in dx))
        axis = [x/length for x in dx]
        # Known physical reference axes: local y has global +Y projection,
        # except a member parallel to global Y, whose local z is global +Z.
        z = [0., 0., 1.] if abs(axis[1]) > 1-1e-12 else cross(axis, [0., 1., 0.])
        ops.geomTransf("PDelta" if nonlinear else "Linear", tag, *z)
        mat, sec = mats[m["material"]], secs[m["section"]]
        ops.element("elasticBeamColumn", tag, ids[m["start"]], ids[m["end"]],
                    sec["area_m2"], mat["e_pa"], mat["g_pa"], sec["j_m4"],
                    sec["iy_m4"], sec["iz_m4"], tag)
    output = {}
    # Each subprocess runs one explicitly supplied combination to avoid
    # reusing a committed displaced state for a different combination.
    if len(data["combinations"]) != 1:
        raise ValueError("Independent reference accepts one combination per process")
    combo = data["combinations"][0]
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    totals = {name: [0.]*6 for name in ids}
    for load in data["nodal_loads"]:
        f = combo["factors"].get(load["case"], 0.)
        for j, key in enumerate(("fx_n", "fy_n", "fz_n", "mx_nm", "my_nm", "mz_nm")):
            totals[load["node"]][j] += f*load[key]
    for name, force in totals.items():
        ops.load(ids[name], *force)
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
            raise ValueError(f"OpenSees did not converge: code {code}")
        iterations.append(ops.testIter())
    ops.reactions()
    for name, tag in ids.items():
        output[name] = dict(translation_m=list(ops.nodeDisp(tag))[:3],
                            rotation_rad=list(ops.nodeDisp(tag))[3:],
                            reaction_force_n=list(ops.nodeReaction(tag))[:3],
                            reaction_moment_nm=list(ops.nodeReaction(tag))[3:])
    return dict(solver="OpenSees", version=ops.version(),
                transformation="PDelta" if nonlinear else "Linear",
                analysis_return_code=code, load_steps=10, iterations_by_step=iterations,
                convergence_test="NormDispIncr 1e-12, max 50 iterations per step", nodes=output,
                member_end_actions_global={m["id"]: list(ops.eleForce(i))
                                           for i, m in enumerate(data["members"], 1)})


if __name__ == "__main__":
    raw = sys.stdin.buffer.read()
    result = solve(json.loads(raw), nonlinear="--linear" not in sys.argv)
    result["input_bytes_sha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, allow_nan=False))
