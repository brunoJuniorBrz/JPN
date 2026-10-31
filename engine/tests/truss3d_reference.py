"""Independent 3D references: closed-form tripod and PyNite axial springs.

No imports from the JPN truss assembly or result recovery. Spring3D is exactly
bilateral EA/L; all PyNite rotations are inactive for these elements and fixed
only to remove unused library DOFs. No XYZ restraint is added to the input.
"""
from importlib.metadata import version
import math
import numpy as np
from Pynite import FEModel3D


def pynite_truss(data):
    assert version('PyNiteFEA') == '3.2.1'
    fe = FEModel3D()
    points = {n['id']: tuple(n[k] for k in ('x_m', 'y_m', 'z_m')) for n in data['nodes']}
    supports = {s['node']: s['restrained'] for s in data['supports']}
    for nid, xyz in points.items():
        fe.add_node(nid, *xyz)
        fe.def_support(nid, *supports.get(nid, [False] * 3), True, True, True)
    for m in data['members']:
        fe.add_spring(m['id'], m['start'], m['end'], m['e_pa'] * m['area_m2'] / math.dist(points[m['start']], points[m['end']]))
    for load in data['loads']:
        for direction, key in zip(('FX', 'FY', 'FZ'), ('fx_n', 'fy_n', 'fz_n')):
            fe.add_node_load(load['node'], direction, load[key], case='L')
    fe.add_load_combo('AUDIT', {'L': 1})
    fe.analyze_linear(sparse=True, check_stability=True)
    return dict(nodes={nid: dict(translation_m=[getattr(n, k)['AUDIT'] for k in ('DX', 'DY', 'DZ')],
                                reaction_n=[getattr(n, k)['AUDIT'] for k in ('RxnFX', 'RxnFY', 'RxnFZ')]) for nid, n in fe.nodes.items()},
                members={mid: -float(s.axial('AUDIT')) for mid, s in fe.springs.items()})


def tripod():
    radius, height = 1., 2.
    base = [(radius * math.cos(a), radius * math.sin(a), 0.) for a in (0, 2 * math.pi / 3, 4 * math.pi / 3)]
    return dict(schema_version='jpn.truss3d/1', units='SI', theory='linear-elastic-axial',
                project=dict(id='AUDIT', revision='1', source='Independent equilateral tripod fixture'),
                case=dict(id='L', source='Explicit force (900,-300,-600) N'),
                nodes=[dict(id=f'B{i}', x_m=p[0], y_m=p[1], z_m=p[2]) for i, p in enumerate(base)] + [dict(id='TIP', x_m=0., y_m=0., z_m=height)],
                members=[dict(id=f'M{i}', start=f'B{i}', end='TIP', e_pa=200e9, area_m2=.01, source='Synthetic E and A', revision='1') for i in range(3)],
                supports=[dict(node=f'B{i}', restrained=[True] * 3) for i in range(3)],
                loads=[dict(node='TIP', fx_n=900., fy_n=-300., fz_n=-600.)])


def tripod_analytic(data):
    # From symmetry: kx=ky=3 EA r²/(2L³), kz=3 EA h²/L³.
    # Equilibrium gives Ni=L/3 [Fz/h-2(Fx xi+Fy yi)/r²].
    radius, height = 1., 2.
    length = math.hypot(radius, height)
    ea = 200e9 * .01
    fx, fy, fz = (sum(l[k] for l in data['loads']) for k in ('fx_n', 'fy_n', 'fz_n'))
    u = np.array([2 * fx * length**3 / (3 * ea * radius**2), 2 * fy * length**3 / (3 * ea * radius**2), fz * length**3 / (3 * ea * height**2)])
    axial, reactions = {}, {}
    for i, anchor in enumerate(data['nodes'][:3]):
        n = length / 3 * (fz / height - 2 * (fx * anchor['x_m'] + fy * anchor['y_m']) / radius**2)
        axial[f'M{i}'] = n
        direction = np.array([-anchor['x_m'], -anchor['y_m'], height]) / length
        reactions[anchor['id']] = -n * direction
    return dict(u=u, axial=axial, reactions=reactions)
