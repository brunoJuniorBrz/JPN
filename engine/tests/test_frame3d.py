import copy
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
import pytest
from jpn_structural.frame3d import analyze_frame3d
from jpn_structural.frame3d_model import input_hash
from jpn_structural.model import AnalysisError
from .spatial_reference import force_method


def portal():
    return json.loads((Path(__file__).parents[1] / 'examples/spatial-portal.json').read_text(encoding='utf-8'))


def beam(axis=0, reverse=False):
    p = portal(); p['nodes'] = [dict(id='A', x_m=0, y_m=0, z_m=0), dict(id='B', x_m=0, y_m=0, z_m=0)]
    p['nodes'][1][('x_m', 'y_m', 'z_m')[axis]] = 2
    p['members'] = [p['members'][0]]; p['members'][0].update(start='B' if reverse else 'A', end='A' if reverse else 'B')
    p['supports'] = [p['supports'][0]]
    p['sections'][0].update(iy_m4=1e-5, iz_m4=4e-5, j_m4=2e-5)
    p['nodal_loads'][0].update(node='B', fx_n=0, fy_n=0, fz_n=0, mx_nm=0, my_nm=0, mz_nm=0)
    return p


def solved(p):
    return analyze_frame3d(p)['combinations']['TESTE-1']


@pytest.mark.parametrize('axis', range(3))
@pytest.mark.parametrize('reverse', (False, True))
@pytest.mark.parametrize('force', (1000., -1000., 1e-6))
def test_axial_xyz_and_reversal(axis, reverse, force):
    p = beam(axis, reverse); p['nodal_loads'][0][('fx_n', 'fy_n', 'fz_n')[axis]] = force
    r = solved(p)
    assert r['nodes']['B']['translation_m'][axis] == pytest.approx(force * 2 / (200e9 * .01), rel=1e-10, abs=1e-24)
    assert r['nodes']['A']['force_n'][axis] == pytest.approx(-force, rel=1e-10)
    assert r['members']['P1']['stations'][0]['n_n'] == pytest.approx(force, rel=1e-10)


@pytest.mark.parametrize('direction,inertia', [(1, 4e-5), (2, 1e-5)])
@pytest.mark.parametrize('rotation', (0, 90))
def test_bending_cantilever_strong_weak_and_roll(direction, inertia, rotation):
    p = beam(); p['members'][0]['rotation_deg'] = rotation
    p['nodal_loads'][0][('fx_n', 'fy_n', 'fz_n')[direction]] = 1000
    if rotation:
        inertia = 1e-5 if direction == 1 else 4e-5
    r = solved(p); delta = 1000 * 2**3 / (3 * 200e9 * inertia)
    assert r['nodes']['B']['translation_m'][direction] == pytest.approx(delta, rel=1e-10)
    assert r['nodes']['A']['force_n'][direction] == pytest.approx(-1000, rel=1e-10)
    assert np.linalg.norm(r['nodes']['A']['moment_nm']) == pytest.approx(2000, rel=1e-10)
    assert np.linalg.norm([r['members']['P1']['stations'][-1][k] for k in ('my_nm', 'mz_nm')]) < 1e-8


@pytest.mark.parametrize('axis', range(3))
def test_torsion_independent_formula(axis):
    p = beam(axis); p['nodal_loads'][0][('mx_nm', 'my_nm', 'mz_nm')[axis]] = 100
    r = solved(p)
    assert r['nodes']['B']['rotation_rad'][axis] == pytest.approx(100 * 2 / (p['materials'][0]['g_pa'] * 2e-5), rel=1e-10)
    assert r['nodes']['A']['moment_nm'][axis] == pytest.approx(-100, rel=1e-10)


def test_section_force_signs_follow_right_hand_cut_actions():
    p = beam(); p['nodal_loads'][0].update(fy_n=1000, fz_n=2000, mx_nm=100)
    s = solved(p)['members']['P1']['stations'][0]
    assert [s[k] for k in ('vy_n', 'vz_n', 't_nm', 'my_nm', 'mz_nm')] == pytest.approx([1000, 2000, 100, -4000, 2000])


def test_simply_supported_center_point_load_explicit_segmentation():
    p = beam(); p['nodes'][1]['x_m'] = 2; p['nodes'].append(dict(id='C', x_m=4, y_m=0, z_m=0))
    second = copy.deepcopy(p['members'][0]); second.update(id='V2', start='B', end='C'); p['members'].append(second)
    p['supports'] = [dict(node='A', restrained=[True, True, True, True, False, False]), dict(node='C', restrained=[False, True, True, False, False, False])]
    p['nodal_loads'][0]['fz_n'] = -1000
    r = solved(p)
    assert r['nodes']['B']['translation_m'][2] == pytest.approx(-1000 * 4**3 / (48 * 200e9 * 1e-5), rel=1e-10)
    assert r['nodes']['A']['force_n'][2] == pytest.approx(500, rel=1e-10)
    assert r['nodes']['C']['force_n'][2] == pytest.approx(500, rel=1e-10)
    assert abs(r['members']['P1']['stations'][-1]['my_nm']) == pytest.approx(1000, rel=1e-10)


@pytest.mark.parametrize('spatial', (False, True))
@pytest.mark.parametrize('load_sign', (-1, 1))
def test_portal_against_independent_force_method(spatial, load_sign):
    p = portal()
    if not spatial:
        p['nodes'].pop(3); p['nodes'][-1].update(y_m=0)
        p['members'].pop(2); p['members'][-1]['start'] = 'C'
        p['nodal_loads'][0]['node'] = 'C'
    for key in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm'):
        p['nodal_loads'][0][key] *= load_sign
    ref, left, right = force_method(p, 'TESTE-1'); r = solved(p)
    for i, node in enumerate(p['nodes']):
        actual = r['nodes'][node['id']]
        np.testing.assert_allclose(actual['translation_m'] + actual['rotation_rad'], ref[i], rtol=1e-8, atol=1e-11)
    for nid, expected in [('A', left), ('E', right)]:
        actual = r['nodes'][nid]
        np.testing.assert_allclose(actual['force_n'] + actual['moment_nm'], expected, rtol=1e-8, atol=1e-6)
    assert r['equilibrium']['relative_residual'] < 1e-10


def test_combinations_superposition_and_rotation_translation_invariance():
    p = portal(); p['cases'].append(dict(id='L', source='Carga sintética independente'))
    load = copy.deepcopy(p['nodal_loads'][0]); load.update(case='L', fx_n=-300, fz_n=500, my_nm=200); p['nodal_loads'].append(load)
    p['combinations'] = [dict(id='D', factors={'TESTE': 1}), dict(id='L', factors={'L': 1}), dict(id='MIX', factors={'TESTE': 1.3, 'L': -.7})]
    result = analyze_frame3d(p)
    for nid in result['combinations']['D']['nodes']:
        for quantity in ('translation_m', 'rotation_rad', 'force_n', 'moment_nm'):
            expected = 1.3 * np.array(result['combinations']['D']['nodes'][nid][quantity]) - .7 * np.array(result['combinations']['L']['nodes'][nid][quantity])
            np.testing.assert_allclose(result['combinations']['MIX']['nodes'][nid][quantity], expected, rtol=1e-9, atol=1e-7)
    # Isotropic bending: rotate entire physical model about Z, including forces,
    # couples, and reactions. No reuse of PyNite's member basis in reference.
    rotation = np.array([[0., -1, 0], [1, 0, 0], [0, 0, 1]])
    q = copy.deepcopy(p)
    for node in q['nodes']:
        point = rotation @ np.array([node[k] for k in ('x_m', 'y_m', 'z_m')]) + [13, -20, 7]
        node.update(zip(('x_m', 'y_m', 'z_m'), point.tolist()))
    for load in q['nodal_loads']:
        for keys in [('fx_n', 'fy_n', 'fz_n'), ('mx_nm', 'my_nm', 'mz_nm')]:
            vector = rotation @ np.array([load[k] for k in keys]); load.update(zip(keys, vector.tolist()))
    q['nodes'].reverse(); q['members'].reverse()
    rotated = analyze_frame3d(q)
    for nid, value in result['combinations']['MIX']['nodes'].items():
        for quantity in ('translation_m', 'rotation_rad', 'force_n', 'moment_nm'):
            np.testing.assert_allclose(rotated['combinations']['MIX']['nodes'][nid][quantity], rotation @ np.array(value[quantity]), rtol=1e-8, atol=1e-7)


def test_rotational_release_is_explicit_and_zero_end_moment():
    p = beam(); p['nodes'].append(dict(id='C', x_m=4, y_m=0, z_m=0))
    second = copy.deepcopy(p['members'][0]); second.update(id='V2', start='B', end='C'); p['members'].append(second)
    p['supports'].append(dict(node='C', restrained=[True] * 6)); p['members'][0]['release_end'][4] = True
    p['nodal_loads'][0].update(fz_n=-1000, my_nm=100)
    r = solved(p)
    assert abs(r['members']['P1']['end_actions_local'][10]) < 1e-8
    assert abs(r['members']['V2']['end_actions_local'][4]) > 1


@pytest.mark.parametrize('field', ('e_pa', 'g_pa', 'nu'))
def test_missing_material_property(field):
    p = portal(); del p['materials'][0][field]
    with pytest.raises(AnalysisError, match='campos'):
        analyze_frame3d(p)


@pytest.mark.parametrize('field', ('area_m2', 'iy_m4', 'iz_m4', 'j_m4'))
@pytest.mark.parametrize('value', (0, -1, float('nan'), float('inf'), None))
def test_invalid_section_properties(field, value):
    p = portal(); p['sections'][0][field] = value
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(p)
    assert exc.value.code == 'INVALID_INPUT'


@pytest.mark.parametrize('mutation,code', [
    ('duplicate', 'DUPLICATE_ID'), ('coincident', 'INVALID_GEOMETRY'), ('orphan', 'DISCONNECTED_MODEL'),
    ('reference', 'INVALID_REFERENCE'), ('zero', 'INVALID_REFERENCE'), ('no_combos', 'INCOMPLETE_MODEL'),
    ('bad_combo', 'INVALID_COMBINATION'), ('no_material', 'INCOMPLETE_MODEL'), ('no_support', 'UNSTABLE'),
    ('interior', 'UNRESOLVED_CONTACT'), ('translational_release', 'UNSUPPORTED_RELEASE'), ('distributed', 'INVALID_INPUT'),
])
def test_explicit_failure_not_fabricated_success(mutation, code):
    p = portal()
    if mutation == 'duplicate': p['nodes'].append(copy.deepcopy(p['nodes'][0]))
    if mutation == 'coincident': p['nodes'][1].update(x_m=0, y_m=0, z_m=0)
    if mutation == 'orphan': p['nodes'].append(dict(id='ORPHAN', x_m=6, y_m=7, z_m=9))
    if mutation == 'reference': p['nodal_loads'][0]['node'] = 'MISSING'
    if mutation == 'zero': p['members'][0]['end'] = 'A'
    if mutation == 'no_combos': p['combinations'] = []
    if mutation == 'bad_combo': p['combinations'][0]['factors'] = {'MISSING': 1}
    if mutation == 'no_material': p['materials'] = []
    if mutation == 'no_support': p['supports'] = []
    if mutation == 'interior': p['nodes'].append(dict(id='CONTACT', x_m=2, y_m=0, z_m=3))
    if mutation == 'translational_release': p['members'][0]['release_start'][0] = True
    if mutation == 'distributed': p['distributed_loads'] = []
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(p)
    assert exc.value.code == code


@pytest.mark.parametrize('field', ('rotation', 'release', 'support', 'load', 'combo', 'length', 'section', 'material', 'source'))
def test_hash_covers_all_physical_assumptions(field):
    p = portal(); digest = input_hash(p)
    if field == 'rotation': p['members'][0]['rotation_deg'] = 1
    if field == 'release': p['members'][0]['release_end'][3] = True
    if field == 'support': p['supports'][0]['restrained'][0] = False
    if field == 'load': p['nodal_loads'][0]['fx_n'] += 1
    if field == 'combo': p['combinations'][0]['factors']['TESTE'] = 2
    if field == 'length': p['nodes'][0]['x_m'] += .1
    if field == 'section': p['sections'][0]['iy_m4'] *= 2
    if field == 'material': p['materials'][0]['e_pa'] *= 2
    if field == 'source': p['materials'][0]['source'] += ' alterada'
    assert input_hash(p) != digest


def test_cli_does_not_emit_logs_or_partial_success():
    result = subprocess.run([sys.executable, '-m', 'jpn_structural.frame3d'], input=json.dumps(portal(), ensure_ascii=False).encode('utf-8'), capture_output=True, timeout=20)
    assert result.returncode == 0
    assert json.loads(result.stdout)['status'] == 'analysis_completed_experimental'
    assert json.loads(result.stdout)['input_sha256'] == input_hash(portal())
    bad = subprocess.run([sys.executable, '-m', 'jpn_structural.frame3d'], input='{"nodes":[],"nodes":[]}', capture_output=True, text=True, timeout=20)
    assert bad.returncode == 2
    assert json.loads(bad.stdout)['status'] == 'error'


def test_nonfinite_solver_result_and_missing_dependency(monkeypatch):
    from Pynite import FEModel3D
    original = FEModel3D.analyze_linear
    def broken(self, *args, **kwargs):
        original(self, *args, **kwargs); self.nodes['D'].DX['TESTE-1'] = float('nan')
    monkeypatch.setattr(FEModel3D, 'analyze_linear', broken)
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(portal())
    assert exc.value.code == 'NUMERICAL_FAILURE'
    monkeypatch.setattr(FEModel3D, 'analyze_linear', original)
    import builtins
    real_import = builtins.__import__
    def missing(name, *args, **kwargs):
        if name == 'Pynite': raise ImportError('deliberately missing')
        return real_import(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', missing)
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(portal())
    assert exc.value.code == 'DEPENDENCY_MISSING'


@pytest.mark.parametrize('inertia,code', [(1e-8, 'MODEL_LIMIT'), (1e-12, 'ILL_CONDITIONED'), (1e-16, 'UNSTABLE')])
def test_numerical_and_operational_limits_are_real_failures(inertia, code):
    p = portal(); p['sections'][0].update(iy_m4=inertia, iz_m4=inertia)
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(p)
    assert exc.value.code == code
