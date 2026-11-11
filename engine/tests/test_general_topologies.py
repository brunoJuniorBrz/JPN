"""Independent analytical frame-only, axial-only and mixed topology references."""
import copy
import pytest
from jpn_structural.mixed3d import analyze_mixed3d,validate_mixed3d
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d
from jpn_structural.model import AnalysisError
from .test_mixed3d import beam_and_axial
from .test_mixed3d_loads import beam

def single_frame():
    data=beam_and_axial()
    data['nodes']=data['nodes'][:2]
    data['members']=data['members'][:1]
    data['supports']=data['supports'][:1]
    return data

def single_axial():
    data=beam_and_axial()
    data['nodes']=data['nodes'][:2]
    data['nodes'][1]['x_m']=1
    data['members']=[dict(id='BAR',kind='axial',start='A',end='B',
                       e_pa=200e9,area_m2=.001,source='Analytical EA',revision='R1')]
    data['materials']=[]
    data['sections']=[]
    data['supports']=[dict(node='A',restrained=[True,True,True,False,False,False]),
                      dict(node='B',restrained=[False,True,True,False,False,False])]
    data['nodal_loads']=[dict(node='B',case='L',fx_n=1000,fy_n=0,fz_n=0,
                             mx_nm=0,my_nm=0,mz_nm=0)]
    return data

def test_single_frame_uses_no_fictitious_spring():
    p=single_frame()
    assert len(validate_mixed3d(p)[0]['members'])==1
    r=analyze_mixed3d(p)
    combination=r['combinations']['LC']
    expected=-1000*2**3/(3*200e9*1e-5)
    assert combination['nodes']['B']['translation_m'][2]==pytest.approx(expected,rel=1e-8)
    assert combination['nodes']['A']['reaction_force_n'][2]==pytest.approx(1000,abs=1e-7)
    assert abs(combination['nodes']['A']['reaction_moment_nm'][1])==pytest.approx(2000,abs=1e-6)
    assert list(combination['members'])==['BEAM']
    assert combination['equilibrium']['relative_residual']<1e-8

def test_single_axial_member_has_no_invented_frame_and_zero_rotations():
    p=single_axial()
    assert validate_mixed3d(p)[2]==set()
    r=analyze_mixed3d(p)
    c=r['combinations']['LC']
    assert c['nodes']['B']['translation_m'][0]==pytest.approx(1000/(200e9*.001),rel=1e-8)
    assert c['nodes']['A']['reaction_force_n'][0]==pytest.approx(-1000,abs=1e-7)
    assert c['members']['BAR']['axial_n']==pytest.approx(1000,rel=1e-7)
    assert not c['nodes']['A']['active_rotations']
    assert not c['nodes']['B']['active_rotations']
    assert c['nodes']['B']['reaction_moment_nm']==pytest.approx([0,0,0],abs=1e-10)
    assert c['equilibrium']['relative_residual']<1e-8

def test_frame_only_loaded_native_uniform_force():
    p=beam()
    p['members']=p['members'][:1]
    p['nodes']=p['nodes'][:2]
    p['supports']=p['supports'][:1]
    c=analyze_loaded_mixed3d(p)['combinations']['LC']
    q=-100
    expected=q*2**4/(8*200e9*1e-5)
    assert c['nodes']['B']['translation_m'][2]==pytest.approx(expected,rel=1e-8)
    assert c['nodes']['A']['reaction_force_n'][2]==pytest.approx(-q*2,abs=1e-7)
    assert list(c['members'])==['BEAM']
    assert c['equilibrium']['relative_residual']<1e-8

def test_axial_only_does_not_accept_fictitious_rotational_restraints_or_moments():
    p=single_axial()
    p['supports'][1]['restrained'][3]=True
    with pytest.raises(AnalysisError) as exc:validate_mixed3d(p)
    assert exc.value.code=='INACTIVE_DOF'
    p=single_axial()
    p['nodal_loads'][0]['my_nm']=100
    with pytest.raises(AnalysisError) as exc:validate_mixed3d(p)
    assert exc.value.code=='INACTIVE_DOF'

def test_insufficient_axial_bracing_refused_instead_of_adding_stiffness():
    p=single_axial()
    p['supports']=p['supports'][:1]
    with pytest.raises(AnalysisError) as exc:analyze_mixed3d(p)
    assert exc.value.code in ('UNSTABLE','ILL_CONDITIONED')

def test_existing_mixed_reference_remains_numerically_equivalent():
    r=analyze_mixed3d(beam_and_axial())
    c=r['combinations']['LC']
    assert set(c['members'])=={'BEAM','BRACE'}
    assert c['equilibrium']['relative_residual']<1e-8
