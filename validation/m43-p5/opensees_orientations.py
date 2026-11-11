"""Private OpenSees 3.8.0 reference with actual Newton-increment SO(3) history.

No JPN/PyNite numerical imports. Native CorotCrdTransf3d::update composes
Exp(delta spin) on the LEFT at EVERY update, not just committed load steps.
Its quaternionProduct uses a reversed cross product. See pinned source in
README.md. A 17-digit native convergence trace supplies the actual increments.
Missing/truncated traces or inconsistent DOF sums are fatal, never guessed.
"""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import tempfile

SOURCE = Path(__file__).parents[1]/"m43-p4/opensees_reference.py"
spec = importlib.util.spec_from_file_location("independent_p4_reference", SOURCE)
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)
ops = ref.ops


def spin(v):
    angle = math.sqrt(sum(x*x for x in v))
    scale = math.sin(angle/2)/angle if angle else .5
    return [math.cos(angle/2), *[scale*x for x in v]]


def product(a, b):
    w, x, y, z = a
    v, i, j, k = b
    result = [w*v-x*i-y*j-z*k, w*i+v*x+y*k-z*j, w*j+v*y+z*i-x*k, w*k+v*z+x*j-y*i]
    norm = math.sqrt(sum(x*x for x in result))
    return [x/norm for x in result]


def matrix(q):
    w, x, y, z = q
    return [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
            [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
            [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]


def equilibrium(data, nodes):
    loads = {n["id"]: [0.]*6 for n in data["nodes"]}
    for load in data["nodal_loads"]:
        factor = data["combinations"][0]["factors"].get(load["case"], 0.)
        for k, key in enumerate(("fx_n", "fy_n", "fz_n", "mx_nm", "my_nm", "mz_nm")):
            loads[load["node"]][k] += factor*load[key]
    supports = {s["node"]: s["restrained"] for s in data["supports"]}
    origin = [data["nodes"][0][k] for k in ("x_m", "y_m", "z_m")]
    # Same component-wise, applied-load normalization as the unchanged P4
    # equilibrium audit. Record a native failure instead of hiding roundoff.
    total, scale, free = [0.]*6, [1.]*6, 0.
    for n in data["nodes"]:
        name = n["id"]
        a = nodes[name]
        reaction = a["reaction_force_n"]+a["reaction_moment_nm"]
        fixed = supports.get(name, [False]*6)
        free = max([free]+[abs(v) for k, v in enumerate(reaction) if not fixed[k]])
        physical = [loads[name][k]+(reaction[k] if fixed[k] else 0.) for k in range(6)]
        position = [n[key]+a["translation_m"][k]-origin[k] for k, key in enumerate(("x_m", "y_m", "z_m"))]
        lever = ref.cross(position, physical[:3])
        applied_lever = ref.cross(position, loads[name][:3])
        values = physical[:3]+[physical[k+3]+lever[k] for k in range(3)]
        for k in range(6):
            total[k] += values[k]
            scale[k] += abs(loads[name][k])+(abs(applied_lever[k-3]) if k >= 3 else 0.)
    relative = max(abs(v)/scale[k] for k, v in enumerate(total))
    return dict(force_residual_n=total[:3], moment_residual_nm=total[3:], maximum_relative_residual=relative,
                maximum_free_dof_reaction_imbalance=free, accepted=relative <= 1e-8)


def solve(source, subdivisions):
    if ops.version() != "3.8.0":
        raise RuntimeError("Pinned native reference version required")
    data, mapping = ref.private_refinement(source, subdivisions)
    # P5 studies ALSO keep their independent meshes within application counts.
    if len(data["nodes"]) > 150 or len(data["members"]) > 320:
        raise ValueError("P5 reference mesh budget exceeded")
    original_test = ops.test
    with tempfile.TemporaryDirectory(prefix="jpn-p5-native-") as directory:
        path = Path(directory)/"newton.log"

        def traced_test(kind, tolerance, iterations):
            original_test(kind, tolerance, iterations, 4)
            # wipe() resets the stream. Configure AFTER the reference builds it.
            ops.logFile(str(path), "-noEcho")
            ops.setPrecision(17)

        ops.test = traced_test
        try:
            result = ref.solve_spatial(data, "Corotational")
        finally:
            ops.test = original_test
            ops.logFile(os.devnull, "-noEcho")
        trace = path.read_bytes()
        increments = [list(map(float, line.split("deltaX:", 1)[1].split()))
                      for line in trace.decode().splitlines() if line.lstrip().startswith("deltaX:")]
        ids = {n["id"]: i+1 for i, n in enumerate(data["nodes"])}
        dofs = {name: ops.nodeDOFs(tag) for name, tag in ids.items()}
        active = sorted(d for values in dofs.values() for d in values if d >= 0)
        if active != list(range(len(active))) or len(increments) != sum(result["iterations_by_step"]):
            raise RuntimeError("Native trace/RCM equation mapping incomplete")
        if not all(len(v) == len(active) and all(map(math.isfinite, v)) for v in increments):
            raise RuntimeError("Native increment vector incomplete/nonfinite")
        maximum_sum_error = 0.
        for name, indices in dofs.items():
            delta = [[vector[d] if d >= 0 else 0. for d in indices] for vector in increments]
            physical = [1., 0., 0., 0.]
            for vector in delta:
                physical = product(spin(vector[3:]), physical)
            answer = result["nodes"][name]
            error = max(abs(sum(v[i] for v in delta)-value) for i, value in enumerate(answer["translation_m"]+answer["rotation_rad"]))
            maximum_sum_error = max(maximum_sum_error, error)
            if error > 2e-12:
                raise RuntimeError("Trace increments do not reconstruct native nodeDisp")
            answer["orientation_matrix"] = matrix(physical)
            raw = spin(answer["rotation_rad"])
            difference = product(physical, [raw[0], *[-x for x in raw[1:]]])
            answer["native_additive_rotation_bias_rad"] = 2*math.atan2(math.sqrt(sum(x*x for x in difference[1:])), abs(difference[0]))
        energies = {}
        for tag, member in enumerate(data["members"], 1):
            deformation = list(ops.eleResponse(tag, "basicDeformations"))
            force = list(ops.eleResponse(tag, "basicForce"))
            if len(deformation) != 6 or len(force) != 6:
                raise RuntimeError("Native elastic basic energy unavailable")
            energies[member["id"]] = .5*sum(a*b for a, b in zip(deformation, force))
        result.update(numerical_member_mapping=mapping, strain_energy_j=sum(energies.values()),
                      reference_node_count=len(data["nodes"]), reference_member_count=len(data["members"]),
                      subdivisions=subdivisions, trace_sha256=hashlib.sha256(trace).hexdigest(),
                      trace_increment_count=len(increments), maximum_trace_sum_error=maximum_sum_error,
                      rotation_measure="Physical SO(3) matrices reconstructed from every 17-digit native Newton spin; additive DOFs retained only as diagnostics")
        result["physical_support_equilibrium"] = equilibrium(data, result["nodes"])
        return result


if __name__ == "__main__":
    raw = sys.stdin.buffer.read()
    result = solve(json.loads(raw), int(sys.argv[1]))
    result["input_bytes_sha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, allow_nan=False))
