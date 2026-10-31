"""Independent references: joint statics and Castigliano/virtual-work flexibility.

No PyNite import, no JPN mixed/frame stiffness or recovery helpers. The spatial
chain reference is prismatic, isotropic in bending Iy=Iz; integration of the
quadratic unit-load energy polynomials is exact with two Gauss points.
"""
import copy
import numpy as np
from .test_mixed3d import beam_and_axial


def spatial_chain():
    p = beam_and_axial()
    coords = {'A': (0., 0., 0.), 'B': (2., 0., 0.), 'C': (2., 1.5, 0.), 'D': (2., 1.5, 1.),
              'E': (3.2, 1., .3), 'F': (1., 2.7, 2.), 'G': (.5, .7, .6)}
    p['nodes'] = [dict(id=n, x_m=x, y_m=y, z_m=z) for n, (x, y, z) in coords.items()]
    frame, axial = p['members']
    p['members'] = [{**copy.deepcopy(frame), 'id': f'F{i}', 'start': a, 'end': b} for i, (a, b) in enumerate([('A', 'B'), ('B', 'C'), ('C', 'D')])]
    p['members'] += [{**copy.deepcopy(axial), 'id': f'S{i}', 'start': 'D', 'end': end} for i, end in enumerate(['E', 'F', 'G'])]
    p['supports'] = [dict(node='A', restrained=[True] * 6)] + [dict(node=n, restrained=[True] * 3 + [False] * 3) for n in ['E', 'F', 'G']]
    p['sections'][0].update(iy_m4=2e-5, iz_m4=2e-5, j_m4=4e-5)
    p['nodal_loads'] = [dict(node='D', case='L', fx_n=300., fy_n=-200., fz_n=-700., mx_nm=50., my_nm=-30., mz_nm=40.)]
    return p


def chain_force_method(p, combo):
    points = np.array([[n[k] for k in ('x_m', 'y_m', 'z_m')] for n in p['nodes'][:4]])
    size = 18
    flex = np.zeros((size, size))
    mat, sec = p['materials'][0], p['sections'][0]
    assert sec['iy_m4'] == sec['iz_m4']
    ea, ei, gj = mat['e_pa'] * sec['area_m2'], mat['e_pa'] * sec['iy_m4'], mat['g_pa'] * sec['j_m4']
    for i in range(3):
        delta = points[i + 1] - points[i]; length = np.linalg.norm(delta); axis = delta / length
        for eta in [(1 - 1 / np.sqrt(3)) / 2, (1 + 1 / np.sqrt(3)) / 2]:
            location = points[i] + eta * delta
            force, moment = np.zeros((size, 3)), np.zeros((size, 3))
            for j in range(i + 1, 4):
                for k in range(6):
                    col = (j - 1) * 6 + k
                    if k < 3:
                        force[col, k] = 1
                        moment[col] = np.cross(points[j] - location, force[col])
                    else: moment[col, k - 3] = 1
            axial, torque = force @ axis, moment @ axis
            bending = moment - torque[:, None] * axis
            flex += length / 2 * (np.outer(axial, axial) / ea + np.outer(torque, torque) / gj + bending @ bending.T / ei)
    factors = next(c['factors'] for c in p['combinations'] if c['id'] == combo)
    external = np.zeros(size)
    ids = ['A', 'B', 'C', 'D']
    for load in p['nodal_loads']:
        idx = ids.index(load['node']) - 1
        assert idx >= 0
        external[6 * idx:6 * idx + 6] += factors.get(load['case'], 0) * np.array([load[k] for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')])
    braces = [m for m in p['members'] if m['kind'] == 'axial']
    xyz = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')]) for n in p['nodes']}
    q, compliance = np.zeros((size, 3)), np.zeros((3, 3))
    for i, m in enumerate(braces):
        delta = xyz[m['end']] - xyz[m['start']]; length = np.linalg.norm(delta)
        q[-6:-3, i] = delta / length
        compliance[i, i] = length / (m['e_pa'] * m['area_m2'])
    tension = np.linalg.solve(compliance + q.T @ flex @ q, -q.T @ flex @ external)
    effective = external + q @ tension
    u = np.r_[np.zeros(6), flex @ effective].reshape(4, 6)
    reaction = -effective.reshape(3, 6).sum(axis=0)
    for point, load in zip(points[1:], effective.reshape(3, 6)):
        reaction[3:] -= np.cross(point - points[0], load[:3])
    # Positive actions applied to the element by its end nodes. Statics only.
    end_actions = []
    for i in range(3):
        downstream = effective.reshape(3, 6)[i:]
        force = downstream[:, :3].sum(axis=0)
        m_i, m_j = downstream[:, 3:].sum(axis=0), downstream[:, 3:].sum(axis=0)
        for point, load in zip(points[i + 1:], downstream):
            m_i = m_i + np.cross(point - points[i], load[:3])
            m_j = m_j + np.cross(point - points[i + 1], load[:3])
        end_actions.append(np.r_[-force, -m_i, force, m_j])
    anchors = {m['end']: tension[i] * q[-6:-3, i] for i, m in enumerate(braces)}
    energy = .5 * (effective @ flex @ effective + tension @ compliance @ tension)
    return dict(u=u, tension=tension, reaction=reaction, anchors=anchors, end_actions=end_actions, energy=energy, external=external)


def axial_free_joint():
    p = beam_and_axial()
    xyz = {'A': (0., 0., 0.), 'B': (2., 0., 0.), 'C': (3., 1., 1.), 'D': (4., 2., 0.), 'E': (2., 2., 2.)}
    p['nodes'] = [dict(id=n, x_m=x, y_m=y, z_m=z) for n, (x, y, z) in xyz.items()]
    frame, bar = p['members']
    p['members'] = [frame] + [{**copy.deepcopy(bar), 'id': f'S{i}', 'start': 'C', 'end': n} for i, n in enumerate(['B', 'D', 'E'])]
    p['supports'] = [dict(node='A', restrained=[True] * 6)] + [dict(node=n, restrained=[True] * 3 + [False] * 3) for n in ['D', 'E']]
    p['nodal_loads'] = [dict(node='C', case='L', fx_n=300., fy_n=-200., fz_n=-700., mx_nm=0., my_nm=0., mz_nm=0.)]
    return p


def axial_joint_statics(p):
    xyz = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')]) for n in p['nodes']}
    bars = p['members'][1:]
    delta = np.array([xyz[m['end']] - xyz['C'] for m in bars]); lengths = np.linalg.norm(delta, axis=1)
    directions = delta / lengths[:, None]
    force = np.array([p['nodal_loads'][0][k] for k in ('fx_n', 'fy_n', 'fz_n')])
    tension = np.linalg.solve(directions.T, -force)
    f_b = -tension[0] * directions[0]
    e, g = p['materials'][0]['e_pa'], p['materials'][0]['g_pa']; s = p['sections'][0]; length = 2.
    u_b = np.array([f_b[0] * length / (e * s['area_m2']), f_b[1] * length**3 / (3 * e * s['iz_m4']), f_b[2] * length**3 / (3 * e * s['iy_m4']),
                    0., -f_b[2] * length**2 / (2 * e * s['iy_m4']), f_b[1] * length**2 / (2 * e * s['iz_m4'])])
    extensions = np.array([tension[i] * lengths[i] / (m['e_pa'] * m['area_m2']) for i, m in enumerate(bars)])
    endpoints = np.array([directions[0] @ u_b[:3], 0., 0.])
    u_c = np.linalg.solve(directions, endpoints - extensions)
    return dict(u_b=u_b, u_c=u_c, tension=tension, force_b=f_b,
                reaction=np.r_[-f_b, -np.cross(xyz['B'], f_b)], anchors={m['end']: tension[i] * directions[i] for i, m in enumerate(bars) if m['end'] != 'B'})
