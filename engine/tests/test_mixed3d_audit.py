"""Actual PyNite 3.2.1 API, independent spatial references and failure guards."""
import copy
from importlib.metadata import version
import numpy as np
import pytest
from Pynite import FEModel3D, Analysis
from jpn_structural.model import AnalysisError
from jpn_structural.mixed3d import analyze_mixed3d, validate_mixed3d
from .test_mixed3d import beam_and_axial
from .mixed3d_reference import spatial_chain, chain_force_method, axial_free_joint, axial_joint_statics


def test_real_spring_api_stiffness_and_axial_signs():
    assert version('PyNiteFEA') == '3.2.1'
    fe = FEModel3D(); fe.add_node('A', 0, 0, 0); fe.add_node('B', 1, 2, 3)
    fe.add_spring('S', 'A', 'B', 1234., tension_only=False, comp_only=False)
    fe.add_load_combo('L', {'CASE': 1}); Analysis._prepare_model(fe)
    spring = fe.springs['S']; k = spring.Ke()
    direction = np.array([1., 2., 3.]) / np.sqrt(14.)
    b = np.r_[-direction, direction]; translation = [0, 1, 2, 6, 7, 8]; rotations = [3, 4, 5, 9, 10, 11]
    np.testing.assert_allclose(k[np.ix_(translation, translation)], 1234 * np.outer(b, b), rtol=1e-12, atol=1e-12)
    np.testing.assert_allclose(k[rotations], 0, atol=0); np.testing.assert_allclose(k[:, rotations], 0, atol=0)
    np.testing.assert_allclose(fe.Ke('L', sparse=False, check_stability=False), k, rtol=1e-12, atol=1e-12)
    for sign in [-1, 1]:
        for node in fe.nodes.values():
            for dof in ('DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'): getattr(node, dof)['L'] = 0.
        for dof, value in zip(('DX', 'DY', 'DZ'), sign * 1e-4 * direction): getattr(fe.nodes['B'], dof)['L'] = value
        assert -spring.axial('L') == pytest.approx(sign * 1234 * 1e-4, rel=1e-12)


@pytest.mark.parametrize('kind', ['axial', 'frame'])
def test_near_axis_large_origin_rejects_real_nonorthogonal_pynite_basis(kind):
    p = beam_and_axial()
    if kind == 'axial':
        p['nodes'][2].update(x_m=2. + 1e-8, y_m=1., z_m=0.)
        p['nodal_loads'][0].update(fy_n=-1000., fz_n=0.)
    else:
        p['nodes'][1].update(x_m=1e-8, y_m=1., z_m=0.)
        p['nodes'][2].update(x_m=2., y_m=1., z_m=0.)
    # Near origin, the library produces orthonormal axes and this physical model
    # is valid. At X+9000 m, math.isclose of absolute coordinates in the pinned
    # library misclassifies the element direction. Do not change its orientation
    # or add restraints: refuse the nonphysical basis before solving.
    analyze_mixed3d(p)
    for node in p['nodes']: node['x_m'] += 9000.
    with pytest.raises(AnalysisError) as exc: analyze_mixed3d(p)
    assert exc.value.code == 'INVALID_GEOMETRY'


@pytest.mark.parametrize('sign', [-1, 1])
@pytest.mark.parametrize('axial_k', [2e-7, 2e8, 1e16])
def test_parallel_beam_axial_closed_form_all_actions(sign, axial_k):
    p = beam_and_axial()
    e = 1e3 if axial_k == 2e-7 else 1e13 if axial_k == 1e16 else 200e9
    p['members'][1].update(e_pa=e, area_m2=axial_k / e)
    p['nodal_loads'][0]['fz_n'] *= sign
    r = analyze_mixed3d(p)['combinations']['LC']; f = -1000 * sign; length = 2.; ei = 200e9 * 1e-5
    uz = f / (3 * ei / length**3 + axial_k); beam_force = 3 * ei / length**3 * uz
    assert r['nodes']['B']['translation_m'][2] == pytest.approx(uz, rel=1e-7, abs=1e-20)
    assert r['nodes']['B']['rotation_rad'][1] == pytest.approx(-3 * uz / (2 * length), rel=1e-7, abs=1e-20)
    assert r['members']['BRACE']['axial_n'] == pytest.approx(-axial_k * uz, rel=1e-7, abs=1e-8)
    np.testing.assert_allclose(r['nodes']['A']['reaction_force_n'], [0, 0, -beam_force], rtol=1e-7, atol=1e-8)
    np.testing.assert_allclose(r['nodes']['A']['reaction_moment_nm'], [0, length * beam_force, 0], rtol=1e-7, atol=1e-8)
    expected = np.array([0, 0, -beam_force, 0, length * beam_force, 0, 0, 0, beam_force, 0, 0, 0])
    np.testing.assert_allclose(r['members']['BEAM']['end_actions_local'], expected, rtol=1e-7, atol=1e-8)


def test_spatial_frame_chain_against_independent_castigliano():
    p = spatial_chain(); reference = chain_force_method(p, 'LC'); r = analyze_mixed3d(p)['combinations']['LC']
    for i, nid in enumerate(['A', 'B', 'C', 'D']):
        np.testing.assert_allclose(r['nodes'][nid]['translation_m'] + r['nodes'][nid]['rotation_rad'], reference['u'][i], rtol=1e-8, atol=1e-11)
    actual_a = r['nodes']['A']['reaction_force_n'] + r['nodes']['A']['reaction_moment_nm']
    np.testing.assert_allclose(actual_a, reference['reaction'], rtol=1e-8, atol=1e-6)
    for nid, expected in reference['anchors'].items(): np.testing.assert_allclose(r['nodes'][nid]['reaction_force_n'], expected, rtol=1e-8, atol=1e-6)
    for i, n in enumerate(reference['tension']): assert r['members'][f'S{i}']['axial_n'] == pytest.approx(n, rel=1e-8, abs=1e-6)
    # Explicit library local conventions for beams along +X, +Y and +Z.
    axes = [np.eye(3), np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]]), np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])]
    for i, basis in enumerate(axes):
        local = np.array(r['members'][f'F{i}']['end_actions_local']).reshape(4, 3)
        np.testing.assert_allclose((local @ basis).ravel(), reference['end_actions'][i], rtol=1e-8, atol=1e-6)
    work = reference['external'] @ np.array([r['nodes'][n]['translation_m'] + r['nodes'][n]['rotation_rad'] for n in ['B', 'C', 'D']]).ravel() / 2
    assert work == pytest.approx(reference['energy'], rel=1e-8)


def test_unrestrained_axial_only_joint_keeps_three_translations_and_no_moments():
    p = axial_free_joint(); exact = axial_joint_statics(p); r = analyze_mixed3d(p)
    c = r['combinations']['LC']
    assert r['diagnostics']['free_dofs'] == 9
    np.testing.assert_allclose(c['nodes']['B']['translation_m'] + c['nodes']['B']['rotation_rad'], exact['u_b'], rtol=1e-8, atol=1e-11)
    np.testing.assert_allclose(c['nodes']['C']['translation_m'], exact['u_c'], rtol=1e-8, atol=1e-11)
    assert not c['nodes']['C']['active_rotations']; assert c['nodes']['B']['active_rotations']
    np.testing.assert_allclose(c['nodes']['C']['rotation_rad'] + c['nodes']['C']['reaction_moment_nm'], 0, atol=1e-10)
    np.testing.assert_allclose(c['nodes']['C']['reaction_force_n'], 0, atol=1e-6)
    np.testing.assert_allclose(c['nodes']['A']['reaction_force_n'] + c['nodes']['A']['reaction_moment_nm'], exact['reaction'], rtol=1e-8, atol=1e-6)
    for i, tension in enumerate(exact['tension']): assert c['members'][f'S{i}']['axial_n'] == pytest.approx(tension, rel=1e-8, abs=1e-6)


def test_declared_base_hinge_does_not_transfer_bending_moment():
    p = beam_and_axial(); p['members'][0]['release_start'][4] = True
    c = analyze_mixed3d(p)['combinations']['LC']; uz = -1000 / 2e8
    assert c['nodes']['B']['translation_m'][2] == pytest.approx(uz, rel=1e-9)
    assert c['nodes']['B']['rotation_rad'][1] == pytest.approx(-uz / 2, rel=1e-9)
    assert c['members']['BRACE']['axial_n'] == pytest.approx(1000, rel=1e-9)
    np.testing.assert_allclose(c['members']['BEAM']['end_actions_local'], 0, atol=1e-7)


@pytest.mark.parametrize('end', ['start', 'end'])
def test_unhashable_frame_endpoint_fails_as_contract_error(end):
    p = beam_and_axial(); p['members'][0][end] = []
    with pytest.raises(AnalysisError) as exc: validate_mixed3d(p)
    assert exc.value.code == 'INVALID_INPUT'


def test_nodewise_corruption_cannot_hide_behind_global_balance(monkeypatch):
    original = FEModel3D.analyze_linear
    def corrupt(self, *args, **kwargs):
        original(self, *args, **kwargs)
        # Controlled fault AFTER the real solve: transverse displacement does
        # not change the vertical axial spring extension or stored reactions.
        # Global external balance still passes; member/joint balance must fail.
        self.nodes['B'].DY['LC'] += 1e-4
    monkeypatch.setattr(FEModel3D, 'analyze_linear', corrupt)
    with pytest.raises(AnalysisError) as exc: analyze_mixed3d(beam_and_axial())
    assert exc.value.code == 'EQUILIBRIUM_FAILURE'


def test_spatial_combinations_and_independent_joint_balance():
    p = spatial_chain()
    p['cases'].append(dict(id='T', source='Second explicitly declared six-component load'))
    p['nodal_loads'].append(dict(node='D', case='T', fx_n=-130., fy_n=230., fz_n=90., mx_nm=-20., my_nm=10., mz_nm=35.))
    p['combinations'] = [dict(id='L', factors={'L': 1}), dict(id='T', factors={'T': 1}), dict(id='MIX', factors={'L': 1.3, 'T': -.7})]
    r = analyze_mixed3d(p)
    axes = [np.eye(3), np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]]), np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])]
    xyz = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')]) for n in p['nodes']}
    for combo in p['combinations']:
        c = r['combinations'][combo['id']]; exact = chain_force_method(p, combo['id'])
        for i, n in enumerate(['A', 'B', 'C', 'D']):
            np.testing.assert_allclose(c['nodes'][n]['translation_m'] + c['nodes'][n]['rotation_rad'], exact['u'][i], rtol=1e-8, atol=1e-11)
        assembled = {n: np.zeros(6) for n in xyz}
        for m in p['members']:
            if m['kind'] == 'frame':
                actions = (np.array(c['members'][m['id']]['end_actions_local']).reshape(4, 3) @ axes[int(m['id'][1:])]).ravel()
                assembled[m['start']] += actions[:6]; assembled[m['end']] += actions[6:]
            else:
                d = xyz[m['end']] - xyz[m['start']]; d /= np.linalg.norm(d)
                force = c['members'][m['id']]['axial_n'] * d
                assembled[m['start']][:3] -= force; assembled[m['end']][:3] += force
        for nid, node in c['nodes'].items():
            ext = np.array(node['reaction_force_n'] + node['reaction_moment_nm'])
            for load in p['nodal_loads']:
                if load['node'] == nid:
                    ext += combo['factors'].get(load['case'], 0) * np.array([load[k] for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')])
            np.testing.assert_allclose(assembled[nid], ext, rtol=1e-8, atol=1e-6)
    for nid in xyz:
        for field in ['translation_m', 'rotation_rad', 'reaction_force_n', 'reaction_moment_nm']:
            expected = 1.3 * np.array(r['combinations']['L']['nodes'][nid][field]) - .7 * np.array(r['combinations']['T']['nodes'][nid][field])
            np.testing.assert_allclose(r['combinations']['MIX']['nodes'][nid][field], expected, rtol=1e-8, atol=1e-7)
    for m in p['members']:
        field = 'axial_n' if m['kind'] == 'axial' else 'end_actions_local'
        expected = 1.3 * np.array(r['combinations']['L']['members'][m['id']][field]) - .7 * np.array(r['combinations']['T']['members'][m['id']][field])
        np.testing.assert_allclose(r['combinations']['MIX']['members'][m['id']][field], expected, rtol=1e-8, atol=1e-6)


def test_rigid_coordinate_change_and_reversed_axial_orientation():
    p = spatial_chain(); before = analyze_mixed3d(p)
    axis = np.array([1., 2., 3.]); axis /= np.linalg.norm(axis)
    cross = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    rot = np.eye(3) + np.sin(.73) * cross + (1 - np.cos(.73)) * cross @ cross
    for n in p['nodes']:
        xyz = rot @ [n[k] for k in ('x_m', 'y_m', 'z_m')] + [10., -20., 7.]
        n.update(zip(('x_m', 'y_m', 'z_m'), xyz.tolist()))
    for load in p['nodal_loads']:
        for keys in [('fx_n', 'fy_n', 'fz_n'), ('mx_nm', 'my_nm', 'mz_nm')]: load.update(zip(keys, (rot @ [load[k] for k in keys]).tolist()))
    for m in p['members']:
        if m['kind'] == 'axial': m['start'], m['end'] = m['end'], m['start']
    p['nodes'].reverse(); p['members'].reverse()
    after = analyze_mixed3d(p)
    for nid, original in before['combinations']['LC']['nodes'].items():
        for field in ['translation_m', 'rotation_rad', 'reaction_force_n', 'reaction_moment_nm']:
            np.testing.assert_allclose(after['combinations']['LC']['nodes'][nid][field], rot @ original[field], rtol=1e-8, atol=1e-7 if field.startswith('reaction') else 1e-11)
    for i in range(3):
        assert after['combinations']['LC']['members'][f'S{i}']['axial_n'] == pytest.approx(before['combinations']['LC']['members'][f'S{i}']['axial_n'], rel=1e-8)
    assert after['input_sha256'] != before['input_sha256']


@pytest.mark.parametrize('mutation,code', [
    ('no_support', 'UNSTABLE'), ('free_axial_transverse', 'UNSTABLE'), ('released_frame_rotation', 'UNSTABLE'),
    ('two_torsion_releases', 'UNSUPPORTED_RELEASE'), ('moment_on_axial', 'INACTIVE_DOF'), ('restraint_on_axial', 'INACTIVE_DOF'),
    ('support_duplicate', 'INVALID_REFERENCE'), ('unsupported_kind', 'UNSUPPORTED_MODEL'), ('coincident', 'INVALID_GEOMETRY'),
    ('orphan', 'DISCONNECTED_MODEL'), ('pending_load', 'INVALID_INPUT'), ('missing_case_load', 'INCOMPLETE_MODEL'),
    ('bad_combination', 'INVALID_COMBINATION'), ('node_limit', 'INPUT_LIMIT'), ('ill_conditioned', 'ILL_CONDITIONED'),
])
def test_mechanisms_contracts_and_numeric_limits(mutation, code):
    p = beam_and_axial()
    if mutation == 'no_support': p['supports'] = []
    if mutation == 'free_axial_transverse': p['supports'].pop()
    if mutation == 'released_frame_rotation': p['members'][0]['release_end'][3:] = [True] * 3
    if mutation == 'two_torsion_releases': p['members'][0]['release_start'][3] = True; p['members'][0]['release_end'][3] = True
    if mutation == 'moment_on_axial': p['nodal_loads'][0].update(node='C', mx_nm=1.)
    if mutation == 'restraint_on_axial': p['supports'][1]['restrained'][3] = True
    if mutation == 'support_duplicate': p['supports'].append(copy.deepcopy(p['supports'][0]))
    if mutation == 'unsupported_kind': p['members'][1]['kind'] = 'cable'
    if mutation == 'coincident': p['nodes'].append({**p['nodes'][0], 'id': 'COPY'})
    if mutation == 'orphan': p['nodes'].append(dict(id='ORPHAN', x_m=5., y_m=6., z_m=7.))
    if mutation == 'pending_load': p['nodal_loads'][0]['fz_n'] = None
    if mutation == 'missing_case_load': p['cases'].append(dict(id='EMPTY', source='Explicit case without declared load'))
    if mutation == 'bad_combination': p['combinations'][0]['factors'] = {'WRONG': 1}
    if mutation == 'node_limit': p['nodes'] *= 51
    if mutation == 'ill_conditioned':
        p = axial_free_joint()
        p['nodes'][3].update(x_m=2., y_m=0., z_m=2.)
        p['nodes'][4].update(x_m=2., y_m=1e-5, z_m=1.)
    with pytest.raises(AnalysisError) as exc: analyze_mixed3d(p)
    assert exc.value.code == code


def test_explicit_zero_loading_has_zero_response_and_nonfinite_recovery_is_rejected(monkeypatch):
    p = beam_and_axial()
    for key in ['fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm']: p['nodal_loads'][0][key] = 0.
    c = analyze_mixed3d(p)['combinations']['LC']
    for node in c['nodes'].values():
        for field in ['translation_m', 'rotation_rad', 'reaction_force_n', 'reaction_moment_nm']: np.testing.assert_allclose(node[field], 0, atol=0)
    original = FEModel3D.analyze_linear
    def corrupt(self, *args, **kwargs):
        original(self, *args, **kwargs)
        sub = next(iter(self.members['BEAM'].sub_members.values()))
        sub.f = lambda _name: np.full((12, 1), float('nan'))
    monkeypatch.setattr(FEModel3D, 'analyze_linear', corrupt)
    with pytest.raises(AnalysisError) as exc: analyze_mixed3d(beam_and_axial())
    assert exc.value.code == 'NUMERICAL_FAILURE'
