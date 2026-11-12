"""Independent continuous, extensible, unshearable elastic rod reference.

Private validation ONLY: a declared unbranched cantilever, dead nodal forces,
rigid joints and isotropic prismatic materials. No JPN/PyNite imports. This is
not a replacement application engine. Warping, shear, Wagner and resistant
capacity are absent. Integrates equilibrium and material curvature directly,
without P4 energy, its AD, finite elements or OpenSees transformations.
"""
import json
from pathlib import Path
import sys

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import root
from scipy.spatial.transform import Rotation


def segment(position, orientation, moment, force, length, basis, ea, stiffness, tolerance):
    def derivative(_, y):
        frame = y[3:12].reshape(3, 3)
        local_moment = frame.T@y[12:15]
        curvature = local_moment/stiffness
        x, yk, z = curvature
        skew = np.array([[0., -z, yk], [z, 0., -x], [-yk, x, 0.]])
        axial = force@frame[:, 0]
        tangent = frame[:, 0]*(1+axial/ea)
        return np.r_[tangent, (frame@skew).ravel(), -np.cross(tangent, force),
                     .5*(axial*axial/ea+np.sum(local_moment*local_moment/stiffness))]

    result = solve_ivp(derivative, [0., length], np.r_[position, (orientation@basis).ravel(), moment, 0.],
                       rtol=tolerance, atol=tolerance/100, method="DOP853")
    if not result.success or not np.isfinite(result.y).all():
        raise RuntimeError("Continuous rod integration failed")
    y = result.y[:, -1]
    physical = y[3:12].reshape(3, 3)@basis.T
    if np.max(abs(physical.T@physical-np.eye(3))) > 2e-10:
        raise RuntimeError("Continuous rod orientation drift")
    return y[:3], physical, y[12:15], float(y[15])


def solve(model, tolerance=2e-12):
    allowed = {"schema_version", "units", "theory", "project", "nodes", "members", "materials", "sections",
               "supports", "cases", "nodal_loads", "combinations"}
    if set(model)-allowed:
        raise ValueError("Unrecognized model fields/loads outside the private reference domain")
    supports = model["supports"]
    if len(supports) != 1 or supports[0]["restrained"] != [True]*6:
        raise ValueError("One explicitly fixed cantilever root required")
    if len(model["combinations"]) != 1 or model.get("member_loads") or model.get("self_weight"):
        raise ValueError("Only one dead nodal force combination supported")
    points = {n["id"]: np.array([n[k] for k in ("x_m", "y_m", "z_m")]) for n in model["nodes"]}
    start = supports[0]["node"]
    chain, ordered = [start], []
    while len(ordered) < len(model["members"]):
        choices = [m for m in model["members"] if m["start"] == chain[-1]]
        if len(choices) != 1 or choices[0]["end"] in chain:
            raise ValueError("Only an explicitly oriented unbranched chain is supported")
        ordered.append(choices[0])
        chain.append(choices[0]["end"])
    if set(chain) != set(points):
        raise ValueError("Chain has disconnected or undeclared nodes")
    mats, secs = [{v["id"]: v for v in model[key]} for key in ("materials", "sections")]
    factors = model["combinations"][0]["factors"]
    loads = {n: np.zeros(3) for n in points}
    for load in model["nodal_loads"]:
        if any(load[k] for k in ("mx_nm", "my_nm", "mz_nm")):
            raise ValueError("Applied spatial moments outside this reference domain")
        loads[load["node"]] += factors.get(load["case"], 0)*np.array([load[k] for k in ("fx_n", "fy_n", "fz_n")])
    properties = []
    for member in ordered:
        if member["kind"] != "frame" or member["rotation_deg"] or any(member["release_start"]+member["release_end"]):
            raise ValueError("Rigid unrolled prismatic frame required")
        mat, sec = mats[member["material"]], secs[member["section"]]
        chord = points[member["end"]]-points[member["start"]]
        length = np.linalg.norm(chord)
        axis = chord/length
        ez = np.array([0., 0., 1.]) if abs(axis[1]) > 1-1e-12 else np.cross(axis, [0., 1., 0.])
        ez /= np.linalg.norm(ez)
        ey = np.cross(ez, axis)
        properties.append((length, np.array([axis, ey, ez]).T, mat["e_pa"]*sec["area_m2"],
                           np.array([mat["g_pa"]*sec["j_m4"], mat["e_pa"]*sec["iy_m4"], mat["e_pa"]*sec["iz_m4"]])))

    def integrate(initial_moment, output=False):
        position, orientation, moment = points[start].copy(), np.eye(3), initial_moment.copy()
        nodes = {start: dict(translation_m=[0.]*3, orientation_matrix=np.eye(3).tolist())}
        ends, energy = [], 0.
        for i, member in enumerate(ordered):
            force = sum((loads[n] for n in chain[i+1:]), start=np.zeros(3))
            start_moment = moment.copy()
            position, orientation, moment, u = segment(position, orientation, moment, force, *properties[i], tolerance)
            energy += u
            nodes[chain[i+1]] = dict(translation_m=(position-points[chain[i+1]]).tolist(), orientation_matrix=orientation.tolist())
            ends.append(np.r_[-force, -start_moment, force, moment].tolist())
        return (moment, nodes, ends, energy) if output else moment

    guess = sum((np.cross(points[n]-points[start], loads[n]) for n in chain), start=np.zeros(3))
    solution = root(integrate, guess, tol=1e-10)
    residual, nodes, ends, energy = integrate(solution.x, True)
    if np.max(abs(residual)) > 1e-8:
        raise RuntimeError("Continuous rod terminal moment equilibrium failed")
    for name, answer in nodes.items():
        answer["reaction_force_n"] = (-sum(loads.values(), start=np.zeros(3))).tolist() if name == start else [0.]*3
        answer["reaction_moment_nm"] = (-solution.x).tolist() if name == start else [0.]*3
    # Recover all six resultants on the deformed geometry, independently.
    force_sum, moment_sum = np.zeros(3), np.zeros(3)
    for name, answer in nodes.items():
        f = loads[name]+answer["reaction_force_n"]
        force_sum += f
        moment_sum += np.cross(points[name]+answer["translation_m"]-points[start], f)+answer["reaction_moment_nm"]
    if max(np.max(abs(force_sum)), np.max(abs(moment_sum))) > 1e-7:
        raise RuntimeError("Continuous rod deformed six-resultant equilibrium failed")
    return dict(nodes=nodes, physical_end_actions=ends, strain_energy_j=energy, integration_relative_tolerance=tolerance,
                terminal_moment_residual_nm=residual.tolist(), force_residual_n=force_sum.tolist(), moment_residual_nm=moment_sum.tolist(),
                root_success=bool(solution.success), production_enabled=False)


if __name__ == "__main__":
    print(json.dumps(solve(json.loads(sys.stdin.buffer.read())), allow_nan=False))
