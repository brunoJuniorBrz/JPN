"""PR #14 audit: true dependencies, independent statics and PyNiteFEA 3.2.1."""
import copy
import json
import subprocess
import sys
import numpy as np
import pytest
from jpn_structural.model import AnalysisError
from jpn_structural.truss3d import analyze_truss3d
from .test_truss3d import beam, tetra
from .truss3d_reference import tripod, tripod_analytic, pynite_truss


def compare_library(p):
    r, ref = analyze_truss3d(p), pynite_truss(p)
    for nid in ref['nodes']:
        for field, atol in [('translation_m', 1e-12), ('reaction_n', 1e-6)]:
            np.testing.assert_allclose(r['nodes'][nid][field], ref['nodes'][nid][field], rtol=1e-8, atol=atol)
    for mid, force in ref['members'].items():
        np.testing.assert_allclose(r['members'][mid]['axial_n'], force, rtol=1e-8, atol=1e-6)
    return r


@pytest.mark.parametrize('axis', range(3))
@pytest.mark.parametrize('sign', [-1, 1])
@pytest.mark.parametrize('reverse', [False, True])
def test_axial_xyz_and_signs_against_real_pynite(axis, sign, reverse):
    compare_library(beam(axis, sign, reverse))


@pytest.mark.parametrize('sign', [-1, 1])
@pytest.mark.parametrize('reverse', [False, True])
def test_oblique_bar_closed_form_and_transverse_support_reactions(sign, reverse):
    p = beam(0, sign, reverse)
    p['nodes'][1].update(x_m=1., y_m=2., z_m=3.)
    r = compare_library(p)
    length, force, ea = np.sqrt(14.), sign * 1000., 200e9 * .01
    assert r['nodes']['B']['translation_m'][0] == pytest.approx(force * length**3 / ea, rel=1e-12)
    assert r['members']['AB']['axial_n'] == pytest.approx(force * length, rel=1e-12)
    np.testing.assert_allclose(r['nodes']['A']['reaction_n'], -force * np.array([1, 2, 3]), rtol=1e-12)
    np.testing.assert_allclose(r['nodes']['B']['reaction_n'], force * np.array([0, 2, 3]), rtol=1e-12, atol=1e-9)


@pytest.mark.parametrize('sign', [-1, 1])
def test_tripod_closed_form_statics_and_energy(sign):
    p = tripod()
    for k in ('fx_n', 'fy_n', 'fz_n'):
        p['loads'][0][k] *= sign
    r, exact = compare_library(p), tripod_analytic(p)
    np.testing.assert_allclose(r['nodes']['TIP']['translation_m'], exact['u'], rtol=1e-12, atol=1e-18)
    assert any(m['axial_n'] > 0 for m in r['members'].values())
    assert any(m['axial_n'] < 0 for m in r['members'].values())
    for mid, force in exact['axial'].items():
        assert r['members'][mid]['axial_n'] == pytest.approx(force, rel=1e-12)
    for nid, force in exact['reactions'].items():
        np.testing.assert_allclose(r['nodes'][nid]['reaction_n'], force, rtol=1e-12, atol=1e-9)
    strain_energy = sum(m['axial_n'] * m['extension_m'] / 2 for m in r['members'].values())
    load = np.array([p['loads'][0][k] for k in ('fx_n', 'fy_n', 'fz_n')])
    assert strain_energy == pytest.approx(float(load @ exact['u']) / 2, rel=1e-12)
    external = {n['id']: np.array(r['nodes'][n['id']]['reaction_n']) for n in p['nodes']}
    external['TIP'] += load
    np.testing.assert_allclose(sum(external.values()), np.zeros(3), atol=1e-9)
    moment = sum((np.cross([n[k] for k in ('x_m', 'y_m', 'z_m')], external[n['id']]) for n in p['nodes']), np.zeros(3))
    np.testing.assert_allclose(moment, np.zeros(3), atol=1e-9)


def test_tetrahedron_and_rotated_translated_tripod_against_pynite():
    compare_library(tetra())
    p = tripod(); baseline = analyze_truss3d(p)
    axis = np.array([1., 2., 3.]); axis /= np.linalg.norm(axis)
    cross = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    rotation = np.eye(3) + np.sin(.61) * cross + (1 - np.cos(.61)) * cross @ cross
    for n in p['nodes']:
        xyz = rotation @ [n[k] for k in ('x_m', 'y_m', 'z_m')] + [1234, -987, 777]
        n.update(zip(('x_m', 'y_m', 'z_m'), xyz.tolist()))
    f = rotation @ [p['loads'][0][k] for k in ('fx_n', 'fy_n', 'fz_n')]
    p['loads'][0].update(zip(('fx_n', 'fy_n', 'fz_n'), f.tolist()))
    for m in p['members']:
        m['start'], m['end'] = m['end'], m['start']
    p['nodes'].reverse(); p['members'].reverse()
    r = compare_library(p)
    for nid in baseline['nodes']:
        for field in ('translation_m', 'reaction_n'):
            np.testing.assert_allclose(r['nodes'][nid][field], rotation @ baseline['nodes'][nid][field], rtol=1e-8, atol=1e-10)
    for mid in baseline['members']:
        assert r['members'][mid]['axial_n'] == pytest.approx(baseline['members'][mid]['axial_n'], rel=1e-9)


def test_diagonal_stiffness_scaling_does_not_break_a_well_conditioned_system():
    p = tripod()
    p['nodes'] = [dict(id=n, x_m=x, y_m=y, z_m=z) for n, (x, y, z) in {'B0': (-1, 0, 0), 'B1': (0, -1, 0), 'B2': (0, 0, -1), 'TIP': (0, 0, 0)}.items()]
    stiffness = [1e-7, 2e9, 1e16]
    for m, (e, area) in zip(p['members'], [(1e3, 1e-10), (200e9, .01), (1e13, 1000)]):
        m.update(e_pa=e, area_m2=area)
    p['loads'][0].update(fx_n=stiffness[0] * 1e-8, fy_n=stiffness[1] * 1e-8, fz_n=stiffness[2] * 1e-8)
    r = compare_library(p)
    np.testing.assert_allclose(r['nodes']['TIP']['translation_m'], [1e-8] * 3, rtol=1e-12)
    assert r['diagnostics']['scaled_condition'] == pytest.approx(1.)


@pytest.mark.parametrize('epsilon,code', [(1e-5, 'ILL_CONDITIONED'), (1e-7, 'UNSTABLE')])
def test_true_near_dependent_directions_remain_blocked(epsilon, code):
    p = tripod()
    positions = [(-1., -1., 0.), (-1., -1., 1.), (-1., -1. + epsilon, 0.), (0., 0., 0.)]
    for n, xyz in zip(p['nodes'], positions):
        n.update(zip(('x_m', 'y_m', 'z_m'), xyz))
    with pytest.raises(AnalysisError) as exc:
        analyze_truss3d(p)
    assert exc.value.code == code


@pytest.mark.parametrize('mutation,code', [
    ('coincident', 'INVALID_GEOMETRY'), ('orphan', 'DISCONNECTED_MODEL'), ('duplicate', 'DUPLICATE_ID'),
    ('overlap', 'INVALID_GEOMETRY'), ('interior', 'UNRESOLVED_CONTACT'), ('crossing', 'UNRESOLVED_CONTACT'),
    ('support_duplicate', 'INVALID_REFERENCE'), ('support_pending', 'INVALID_INPUT'), ('load_infinite', 'INVALID_INPUT'),
    ('bad_case', 'INVALID_INPUT'), ('free_transverse', 'UNSTABLE'), ('coplanar', 'UNSTABLE'), ('rigid_rotation', 'UNSTABLE'),
])
def test_adversarial_geometry_and_boundary_conditions(mutation, code):
    p = beam()
    if mutation == 'coincident': p['nodes'].append({**p['nodes'][0], 'id': 'OTHER'})
    if mutation == 'orphan': p['nodes'].append(dict(id='OTHER', x_m=5, y_m=6, z_m=7))
    if mutation == 'duplicate': p['members'].append(copy.deepcopy(p['members'][0]))
    if mutation == 'overlap': p['members'].append({**p['members'][0], 'id': 'COPY', 'start': 'B', 'end': 'A'})
    if mutation == 'interior': p['nodes'].append(dict(id='MID', x_m=1, y_m=0, z_m=0))
    if mutation == 'crossing':
        p['nodes'] += [dict(id='C', x_m=1, y_m=-1, z_m=0), dict(id='D', x_m=1, y_m=1, z_m=0)]
        p['members'].append({**p['members'][0], 'id': 'CD', 'start': 'C', 'end': 'D'})
    if mutation == 'support_duplicate': p['supports'].append(copy.deepcopy(p['supports'][0]))
    if mutation == 'support_pending': p['supports'][0]['restrained'][0] = None
    if mutation == 'load_infinite': p['loads'][0]['fx_n'] = float('inf')
    if mutation == 'bad_case': p['case']['source'] = ''
    if mutation == 'free_transverse': p['supports'].pop()
    if mutation == 'coplanar':
        p = tripod(); p['nodes'][-1]['z_m'] = 0  # Coplanar axial bars have no transverse rigidity.
    if mutation == 'rigid_rotation':
        p = tetra(); p['supports'] = p['supports'][:1]
    with pytest.raises(AnalysisError) as exc:
        analyze_truss3d(p)
    assert exc.value.code == code


def test_cli_rejects_duplicate_keys_nonfinite_constants_and_large_input():
    command = [sys.executable, '-m', 'jpn_structural.truss3d']
    payloads = [b'{"units":"SI","units":"SI"}', json.dumps(beam()).replace('1000.0', 'NaN').encode(), b' ' * 500001]
    for payload in payloads:
        r = subprocess.run(command, input=payload, capture_output=True, timeout=10)
        assert r.returncode == 2
        out = json.loads(r.stdout)
        assert out['status'] == 'error' and 'nodes' not in out and 'members' not in out
