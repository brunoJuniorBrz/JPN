"""Independent FORCE METHOD, no PyNite or frame stiffness assembly.

Prismatic isotropic bending Iy=Iz for the polygonal open-chain reference.
Castigliano/virtual work: integral NN/EA + TT/GJ + Mb.Mb/EI. Two-point
Gauss integration is exact for these quadratic polynomials. Six redundants
enforce zero movement at the second fixed support. MIT 2.080J, Lecture 8
(energy methods) supplies the independent theoretical reference.
"""
import numpy as np


def force_method(data, combo):
    points = np.array([[n[k] for k in ('x_m', 'y_m', 'z_m')] for n in data['nodes']])
    size = 6 * (len(points) - 1)
    flexibility = np.zeros((size, size))
    material, section = data['materials'][0], data['sections'][0]
    assert section['iy_m4'] == section['iz_m4']
    ea = material['e_pa'] * section['area_m2']; ei = material['e_pa'] * section['iy_m4']; gj = material['g_pa'] * section['j_m4']
    for i in range(len(points) - 1):
        delta = points[i + 1] - points[i]; length = np.linalg.norm(delta); axis = delta / length
        for eta in ((1 - 1 / np.sqrt(3)) / 2, (1 + 1 / np.sqrt(3)) / 2):
            location = points[i] + eta * delta
            force = np.zeros((size, 3)); moment = np.zeros((size, 3))
            for j in range(i + 1, len(points)):
                for k in range(6):
                    column = (j - 1) * 6 + k
                    if k < 3:
                        force[column, k] = 1
                        moment[column] = np.cross(points[j] - location, force[column])
                    else:
                        moment[column, k - 3] = 1
            axial = force @ axis; torque = moment @ axis
            bending = moment - torque[:, None] * axis
            flexibility += length / 2 * (np.outer(axial, axial) / ea + np.outer(torque, torque) / gj + bending @ bending.T / ei)
    external = np.zeros(size)
    ids = [n['id'] for n in data['nodes']]
    factors = next(c['factors'] for c in data['combinations'] if c['id'] == combo)
    for load in data['nodal_loads']:
        j = ids.index(load['node']); assert j > 0
        external[(j - 1) * 6:j * 6] += factors.get(load['case'], 0) * np.array([load[k] for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')])
    right_reaction = np.linalg.solve(flexibility[-6:, -6:], -(flexibility @ external)[-6:])
    all_forces = external.copy(); all_forces[-6:] += right_reaction
    displacements = np.r_[np.zeros(6), flexibility @ all_forces].reshape(-1, 6)
    left_force = -all_forces.reshape(-1, 6)[:, :3].sum(axis=0)
    left_moment = np.zeros(3)
    for point, action in zip(points[1:], all_forces.reshape(-1, 6)):
        left_moment -= action[3:] + np.cross(point - points[0], action[:3])
    return displacements, np.r_[left_force, left_moment], right_reaction
