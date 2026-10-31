"""Strict mixed-model preflight + independent 3D beam/spring closed form.

The numerical tests require the real pinned PyNiteFEA==3.2.1 runtime.
No test assumes that an analysis result certifies a physical design.
"""
import copy

import numpy as np
import pytest

from jpn_structural.model import AnalysisError
from jpn_structural.mixed3d import validate_mixed3d, analyze_mixed3d


def beam_and_axial():
    e=200e9
    return dict(
        schema_version='jpn.mixed3d/1',units='SI',theory='linear-elastic-frame-axial',
        project=dict(id='MIXED-1',revision='1',source='Analytical isolated fixture'),
        nodes=[dict(id='A',x_m=0.,y_m=0.,z_m=0.),
               dict(id='B',x_m=2.,y_m=0.,z_m=0.),
               dict(id='C',x_m=2.,y_m=0.,z_m=1.)],
        materials=[dict(id='STEEL',e_pa=e,g_pa=e/(2*1.3),nu=.3,source='Synthetic E and G',revision='1')],
        sections=[dict(id='S',area_m2=.01,iy_m4=1e-5,iz_m4=1e-5,j_m4=1e-5,source='Synthetic section',revision='1')],
        members=[dict(id='BEAM',kind='frame',start='A',end='B',material='STEEL',section='S',
                      rotation_deg=0,release_start=[False]*6,release_end=[False]*6),
                 dict(id='BRACE',kind='axial',start='B',end='C',e_pa=e,area_m2=.001,
                      source='Synthetic axial area',revision='1')],
        supports=[dict(node='A',restrained=[True]*6),
                  dict(node='C',restrained=[True,True,True,False,False,False])],
        cases=[dict(id='L',source='Explicit point load -1000 N at B')],
        nodal_loads=[dict(node='B',case='L',fx_n=0,fy_n=0,fz_n=-1000,
                         mx_nm=0,my_nm=0,mz_nm=0)],
        combinations=[dict(id='LC',factors={'L':1})])


def test_preflight_axial_only_rotations_do_not_become_supports():
    p=beam_and_axial()
    validated, points, frame_nodes, supports=validate_mixed3d(p)
    assert set(points)=={'A','B','C'}
    assert frame_nodes=={'A','B'}
    assert supports['C']==[True,True,True,False,False,False]
    assert validated is p


@pytest.mark.parametrize('change,code',[
    (lambda p:p.update(units='mm'),'UNSUPPORTED_MODEL'),
    (lambda p:p['members'][1].update(kind='cable'),'UNSUPPORTED_MODEL'),
    (lambda p:p['members'][1].update(area_m2=float('nan')),'INVALID_INPUT'),
    (lambda p:p['members'][1].update(source=' '),'INVALID_INPUT'),
    (lambda p:p['members'][1].update(release_start=[False]*6),'INVALID_INPUT'),
    (lambda p:p['members'][0]['release_start'].__setitem__(0,True),'UNSUPPORTED_RELEASE'),
    (lambda p:p['supports'][1]['restrained'].__setitem__(3,True),'INACTIVE_DOF'),
    (lambda p:p['nodal_loads'][0].update(node='C',mx_nm=20),'INACTIVE_DOF'),
    (lambda p:p['supports'][1].update(restrained=[True,True,True]),'INVALID_INPUT'),
    (lambda p:p['members'][1].update(end='unknown'),'INVALID_REFERENCE'),
    (lambda p:p['members'][1].update(end='A'),'INVALID_GEOMETRY'),
    (lambda p:p['nodal_loads'][0].update(fz_n=float('inf')),'INVALID_INPUT'),
    (lambda p:p['combinations'][0].update(factors={'L':0}),'INVALID_COMBINATION'),
    (lambda p:p['materials'][0].update(g_pa=1),'INVALID_MATERIAL'),
    (lambda p:p['nodal_loads'].clear(),'INCOMPLETE_MODEL'),
])
def test_invalid_input_fails_closed(change,code):
    p=beam_and_axial()
    change(p)
    with pytest.raises(AnalysisError) as exc:
        validate_mixed3d(p)
    assert exc.value.code==code


def test_contact_at_middle_of_beam_rejected_without_implicit_joint():
    p=beam_and_axial()
    p['nodes'][2]['x_m']=1.
    p['nodes'][2]['z_m']=0.
    with pytest.raises(AnalysisError) as exc:
        validate_mixed3d(p)
    assert exc.value.code in ('UNRESOLVED_CONTACT','INVALID_GEOMETRY')


def test_input_revisions_are_explicit_not_inferred():
    p=beam_and_axial()
    q=copy.deepcopy(p);q['project']['revision']='2'
    assert validate_mixed3d(q)[0]['project']['revision']=='2'
    q['cases'][0]['source']=' '
    with pytest.raises(AnalysisError):
        validate_mixed3d(q)


def test_real_pynite_tip_stiffness_in_parallel_with_axial_element():
    pytest.importorskip('Pynite')
    p=beam_and_axial()
    r=analyze_mixed3d(p)
    c=r['combinations']['LC']
    k_frame=3*200e9*1e-5/(2**3)
    k_axial=200e9*.001
    uz=-1000/(k_frame+k_axial)
    assert c['nodes']['B']['translation_m'][2]==pytest.approx(uz,rel=1e-7)
    assert c['members']['BRACE']['axial_n']==pytest.approx(-k_axial*uz,rel=1e-7)
    assert len(c['members']['BEAM']['end_actions_local'])==12
    assert c['equilibrium']['relative_residual']<1e-8
    assert c['nodes']['C']['active_rotations'] is False
    np.testing.assert_allclose(c['nodes']['C']['reaction_moment_nm'],0,atol=1e-8)


def test_real_pynite_removing_frame_support_does_not_introduce_rigid_spring():
    pytest.importorskip('Pynite')
    p=beam_and_axial()
    p['supports'][0]['restrained'][3:]=[False]*3
    with pytest.raises(AnalysisError) as exc:
        analyze_mixed3d(p)
    assert exc.value.code in ('UNSTABLE','ILL_CONDITIONED')


def test_real_pynite_invariance_under_force_scaling_and_revision_hash():
    pytest.importorskip('Pynite')
    p=beam_and_axial()
    r=analyze_mixed3d(p)
    q=copy.deepcopy(p)
    q['nodal_loads'][0]['fz_n']*=-2
    rr=analyze_mixed3d(q)
    assert r['input_sha256']!=rr['input_sha256']
    for nid in ('A','B','C'):
        np.testing.assert_allclose(rr['combinations']['LC']['nodes'][nid]['translation_m'],
                                   -2*np.array(r['combinations']['LC']['nodes'][nid]['translation_m']),
                                   rtol=1e-7,atol=1e-10)
