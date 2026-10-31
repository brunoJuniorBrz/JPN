"""Independent Euler-Bernoulli closed forms; real PyNite, never its K as oracle."""
from copy import deepcopy
import numpy as np
import pytest
from .test_mixed3d import beam_and_axial
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d
from jpn_structural.model import AnalysisError


def beam(kind='cantilever', q=-100.):
    p=beam_and_axial(); p.update(schema_version='jpn.mixed3d/2',member_loads=[],self_weight=None)
    p['nodes'][2].update(x_m=2.,y_m=1.,z_m=0.)
    if kind=='simple':
        p['supports']=[dict(node='A',restrained=[True,True,True,True,False,True]),dict(node='B',restrained=[False,True,True,True,False,True]),p['supports'][1]]
    elif kind=='fixed': p['supports'].append(dict(node='B',restrained=[True]*6))
    p['nodal_loads']=[]
    p['member_loads']=[dict(id='Q',member='BEAM',case='L',coordinate_system='global',force_per_length_n_m=[0.,0.,q],source='Synthetic uniform force / independent closed form',revision='R1')]
    return p


@pytest.mark.parametrize('kind',['cantilever','simple','fixed'])
@pytest.mark.parametrize('q',[-100.,100.])
def test_uniform_load_independent_deflection_reaction_shear_moments(kind,q):
    p=beam(kind,q); out=analyze_loaded_mixed3d(p); c=out['combinations']['LC']; e=200e9; inertia=1e-5; length=2.
    assert c['equilibrium']['relative_residual']<1e-8
    assert sum(n['reaction_force_n'][2] for n in c['nodes'].values())==pytest.approx(-q*length,abs=1e-7)
    s=c['members']['BEAM']['stations']; a=c['members']['BEAM']['end_actions_local']
    if kind=='cantilever':
        assert c['nodes']['B']['translation_m'][2]==pytest.approx(q*length**4/(8*e*inertia),rel=1e-8)
        assert c['nodes']['B']['rotation_rad'][1]==pytest.approx(-q*length**3/(6*e*inertia),rel=1e-8)
        assert a[4]==pytest.approx(q*length**2/2,abs=1e-7)
        for point in s:
            x=point['x_m']; assert point['vz_n']==pytest.approx(q*(length-x),abs=1e-7)
            assert point['my_nm']==pytest.approx(-q*(length-x)**2/2,abs=1e-7)
    else:
        coefficient=5 if kind=='simple' else 1
        assert s[2]['translation_local_m'][2]==pytest.approx(coefficient*q*length**4/(384*e*inertia),rel=1e-8)
        assert c['nodes']['A']['reaction_force_n'][2]==pytest.approx(-q*length/2,abs=1e-7)
        for point in s:
            x=point['x_m']; assert point['vz_n']==pytest.approx(q*(length/2-x),abs=1e-7)
            expected=q*x*(length-x)/2 if kind=='simple' else q*(x*(length-x)/2-length**2/12)
            assert point['my_nm']==pytest.approx(expected,abs=1e-7)


def weight(p):
    p['cases'].append(dict(id='SW',source='Explicit synthetic density and gravity'))
    p['self_weight']=dict(case='SW',gravity_m_s2=[0.,0.,-10.],axial_lumping='half-to-end-nodes',densities=[dict(member=m['id'],kg_m3=1000.,source='Synthetic density, not steel default',revision='D1') for m in p['members']])
    p['combinations']=[dict(id='LC',factors={'L':1.,'SW':1.}),dict(id='WEIGHT',factors={'SW':1.}),dict(id='REVERSE',factors={'L':-1.,'SW':-1.})]
    return p


def test_self_weight_lumping_conservation_superposition_and_no_mutation():
    p=weight(beam()); before=deepcopy(p); out=analyze_loaded_mixed3d(p); assert p==before
    # Beam: rho*A*g=100 N/m. Axial 1 m: 10 N total, half per end.
    assert out['loading']['self_weight']['total_mass_kg']==pytest.approx(21.)
    w=out['combinations']['WEIGHT']; c=out['combinations']['LC']; inverse=out['combinations']['REVERSE']
    assert w['nodes']['B']['translation_m'][2]==pytest.approx(-100*2**4/(8*200e9*1e-5)-5*2**3/(3*200e9*1e-5),rel=1e-8)
    assert sum(n['reaction_force_n'][2] for n in w['nodes'].values())==pytest.approx(210,abs=1e-7)
    only=analyze_loaded_mixed3d(beam())['combinations']['LC']
    for nid in c['nodes']:
        for key in ('translation_m','rotation_rad','reaction_force_n','reaction_moment_nm'):
            np.testing.assert_allclose(c['nodes'][nid][key], np.array(w['nodes'][nid][key])+only['nodes'][nid][key],atol=1e-8)
            np.testing.assert_allclose(inverse['nodes'][nid][key],-np.array(c['nodes'][nid][key]),atol=1e-8)
    assert 'stations' not in c['members']['BRACE']


def test_release_condenses_consistent_fixed_end_actions():
    p=beam('fixed'); p['members'][0]['release_end'][4]=True
    c=analyze_loaded_mixed3d(p)['combinations']['LC']; length=2.; q=-100.
    assert c['nodes']['A']['reaction_force_n'][2]==pytest.approx(-5*q*length/8,abs=1e-7)
    assert c['nodes']['B']['reaction_force_n'][2]==pytest.approx(-3*q*length/8,abs=1e-7)
    assert c['members']['BEAM']['end_actions_local'][10]==pytest.approx(0,abs=1e-8)


@pytest.mark.parametrize('change,code',[
    (lambda p:p['member_loads'][0].update(member='BRACE'),'UNSUPPORTED_LOAD'),
    (lambda p:p['member_loads'][0].update(coordinate_system='projected'),'INVALID_INPUT'),
    (lambda p:p['self_weight']['densities'].pop(),'INCOMPLETE_DENSITY'),
    (lambda p:p['self_weight']['densities'][0].update(source=''),'INVALID_INPUT'),
    (lambda p:p['member_loads'][0].update(case='SW'),'DUPLICATE_SELF_WEIGHT'),
    (lambda p:p.update(supports=[]),'UNSTABLE'),
])
def test_rejects_incomplete_contradictory_and_unstable_models(change,code):
    p=weight(beam()); change(p)
    with pytest.raises(AnalysisError) as exc: analyze_loaded_mixed3d(p)
    assert exc.value.code==code


def test_local_global_rotated_and_inclined_loads():
    p=beam(); p['members'][0]['rotation_deg']=90
    a=analyze_loaded_mixed3d(p)['combinations']['LC']
    p['member_loads'][0].update(coordinate_system='local',force_per_length_n_m=[0.,-100.,0.])
    b=analyze_loaded_mixed3d(p)['combinations']['LC']
    np.testing.assert_allclose(a['nodes']['B']['translation_m'],b['nodes']['B']['translation_m'],atol=1e-12)
    # Rotate the entire physical model 45 degrees about global Y, including q.
    p=beam(); angle=np.pi/4; r=np.array([[np.cos(angle),0,np.sin(angle)],[0,1,0],[-np.sin(angle),0,np.cos(angle)]])
    original=analyze_loaded_mixed3d(p)['combinations']['LC']
    for n in p['nodes']:
        n.update(zip(('x_m','y_m','z_m'),map(float,r@np.array([n[k] for k in ('x_m','y_m','z_m')]))))
    p['member_loads'][0]['force_per_length_n_m']=(r@np.array([0.,0.,-100.])).tolist()
    rotated=analyze_loaded_mixed3d(p)['combinations']['LC']
    np.testing.assert_allclose(rotated['nodes']['B']['translation_m'],r@original['nodes']['B']['translation_m'],atol=1e-12)


def test_longitudinal_udl_anisotropic_roll_and_zero_superposition():
    p=beam();p['member_loads'][0]['force_per_length_n_m']=[20.,0.,0.]
    c=analyze_loaded_mixed3d(p)['combinations']['LC']
    assert c['nodes']['B']['translation_m'][0]==pytest.approx(20*2**2/(2*200e9*.01),rel=1e-8)
    for s in c['members']['BEAM']['stations']: assert s['n_n']==pytest.approx(20*(2-s['x_m']),abs=1e-8)
    p=beam();p['sections'][0]['iy_m4']=2e-5
    a=analyze_loaded_mixed3d(p)['combinations']['LC'];p['members'][0]['rotation_deg']=90
    b=analyze_loaded_mixed3d(p)['combinations']['LC']
    assert b['nodes']['B']['translation_m'][2]==pytest.approx(2*a['nodes']['B']['translation_m'][2],rel=1e-8)
    p['cases'].append(dict(id='NEG',source='Explicit inverse uniform case'))
    p['member_loads'].append({**deepcopy(p['member_loads'][0]),'id':'NEG','case':'NEG','force_per_length_n_m':[0.,0.,100.]})
    p['combinations']=[dict(id='LC',factors={'L':1,'NEG':1})]
    c=analyze_loaded_mixed3d(p)['combinations']['LC']
    assert c['equilibrium']['relative_residual']==0
    assert c['nodes']['B']['translation_m']==[0.,0.,0.]


def test_direct_pynite_api_and_published_local_signs():
    from Pynite import FEModel3D
    m=FEModel3D();m.add_node('A',0,0,0);m.add_node('B',2,0,0)
    m.add_material('M',200e9,200e9/2.6,.3,0);m.add_section('S',.01,1e-5,1e-5,1e-5)
    m.add_member('B','A','B','M','S');m.def_support('A',True,True,True,True,True,True)
    m.add_member_dist_load('B','FZ',-100,-100,case='L');m.add_load_combo('LC',{'L':1});m.analyze_linear()
    c=analyze_loaded_mixed3d(beam())['combinations']['LC'];b=m.members['B'];sub=next(iter(b.sub_members.values()))
    np.testing.assert_allclose(c['members']['BEAM']['end_actions_local'],sub.f('LC').ravel(),atol=1e-8)
    for s in c['members']['BEAM']['stations']:
        x=s['x_m'];assert s['vz_n']==pytest.approx(-b.shear('Fz',x,'LC'),abs=1e-8)
        assert s['my_nm']==pytest.approx(b.moment('My',x,'LC'),abs=1e-8)
        assert s['translation_local_m'][2]==pytest.approx(b.deflection('dz',x,'LC'),abs=1e-12)


@pytest.mark.parametrize('area',[1e-9,.001,10.])
def test_distributed_load_with_extreme_axial_stiffness_against_force_method(area):
    p=beam();p['nodes'][2].update(y_m=0.,z_m=1.);p['members'][1]['area_m2']=area
    c=analyze_loaded_mixed3d(p)['combinations']['LC'];ei=200e9*1e-5;k=200e9*area
    expected=(-100*2**4/(8*ei))/(1+k*2**3/(3*ei))
    assert c['nodes']['B']['translation_m'][2]==pytest.approx(expected,rel=1e-7,abs=1e-13)
    assert c['equilibrium']['relative_residual']<1e-8


def test_segmented_continuous_beam_under_udl_has_no_artificial_hinge():
    p=beam();p['nodes'].append(dict(id='MID',x_m=1.,y_m=0.,z_m=0.));frame=p['members'][0]
    p['members']=[{**deepcopy(frame),'end':'MID'},{**deepcopy(frame),'id':'SECOND','start':'MID'},p['members'][1]]
    p['member_loads'].append({**deepcopy(p['member_loads'][0]),'id':'Q2','member':'SECOND'})
    c=analyze_loaded_mixed3d(p)['combinations']['LC']
    assert c['nodes']['B']['translation_m'][2]==pytest.approx(-100*2**4/(8*200e9*1e-5),rel=1e-8)
    assert c['members']['BEAM']['stations'][-1]['my_nm']==pytest.approx(c['members']['SECOND']['stations'][0]['my_nm'],abs=1e-8)
    assert abs(c['members']['BEAM']['stations'][-1]['my_nm'])>1


def test_transverse_y_signs_and_rotation_independent():
    p=beam();p['nodes'][2].update(y_m=0.,z_m=1.);p['member_loads'][0]['force_per_length_n_m']=[0.,100.,0.]
    c=analyze_loaded_mixed3d(p)['combinations']['LC']
    assert c['nodes']['B']['translation_m'][1]==pytest.approx(100*2**4/(8*200e9*1e-5),rel=1e-8)
    assert c['nodes']['B']['rotation_rad'][2]==pytest.approx(100*2**3/(6*200e9*1e-5),rel=1e-8)
    for s in c['members']['BEAM']['stations']:
        assert s['vy_n']==pytest.approx(100*(2-s['x_m']),abs=1e-8)
        assert s['mz_nm']==pytest.approx(100*(2-s['x_m'])**2/2,abs=1e-8)
