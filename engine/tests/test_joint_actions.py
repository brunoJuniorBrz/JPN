"""M24: independently known joint/end actions, actual PyNite 3.2.1 bases."""
from copy import deepcopy
import math
import numpy as np
import pytest
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d
from jpn_structural.model import AnalysisError
from .test_mixed3d_loads import beam


def solve(raw):
    trace = {}
    result = analyze_loaded_mixed3d(raw, _joint_actions=trace)
    assert trace['input_sha256'] == result['input_sha256']
    return result, trace


@pytest.mark.parametrize('direction', [(1,0,0),(0,1,0),(0,0,1),(2,3,4),(-2,-3,4)])
@pytest.mark.parametrize('angle', [0.,37.,-23.,90.])
def test_rotated_spatial_cantilever_end_actions_closed_form(direction, angle):
    p=beam(); d=np.array(direction,dtype=float); d/=np.linalg.norm(d); length=2.
    force=np.array([120.,-230.,340.]); brace=np.cross(d,force); brace/=np.linalg.norm(brace)
    end=length*d; extra=end+brace
    for node,point in zip(p['nodes'],(np.zeros(3),end,extra)):
        node.update(dict(zip(('x_m','y_m','z_m'),map(float,point))))
    p['members'][0]['rotation_deg']=angle
    p['nodal_loads']=[dict(node='B',case='L',fx_n=float(force[0]),fy_n=float(force[1]),fz_n=float(force[2]),mx_nm=float(32*d[0]),my_nm=float(32*d[1]),mz_nm=float(32*d[2]))]
    q=np.array([12.,-23.,34.]);p['member_loads'][0]['force_per_length_n_m']=q.tolist()
    result,trace=solve(p); actions=np.array(trace['combinations']['LC']['members']['BEAM']['node_on_member_global'])
    expected_i=np.r_[-force-q*length,-32*d-np.cross(end,force)-np.cross(end/2,q*length)]
    expected_j=np.r_[force,32*d]
    np.testing.assert_allclose(actions[:6],expected_i,atol=1e-7,rtol=1e-9)
    np.testing.assert_allclose(actions[6:],expected_j,atol=1e-7,rtol=1e-9)
    axes=np.array(trace['members']['BEAM']['global_to_local'])
    np.testing.assert_allclose(axes[0],d,atol=1e-12)
    np.testing.assert_allclose(axes@axes.T,np.eye(3),atol=1e-12)
    assert np.linalg.det(axes)==pytest.approx(1.,abs=1e-12)
    local=np.array(result['combinations']['LC']['members']['BEAM']['end_actions_local'])
    # Rotating forces and moments is the SAME orthogonal block transform.
    for offset in (0,3,6,9):np.testing.assert_allclose(axes.T@local[offset:offset+3],actions[offset:offset+3],atol=1e-8)
    if direction==(1,0,0):
        c,s=math.cos(math.radians(angle)),math.sin(math.radians(angle))
        np.testing.assert_allclose(axes,[[1,0,0],[0,c,s],[0,-s,c]],atol=1e-12)


def test_released_end_and_udl_no_double_count():
    p=beam('fixed');p['members'][0]['release_start']=[False]*3+[True]*3
    result,trace=solve(p);a=np.array(trace['combinations']['LC']['members']['BEAM']['node_on_member_global']);q=-100.;length=2.
    np.testing.assert_allclose(a[3:6],0.,atol=1e-8)
    assert a[2]==pytest.approx(-3*q*length/8,abs=1e-8)
    assert a[8]==pytest.approx(-5*q*length/8,abs=1e-8)
    assert a[10]==pytest.approx(-q*length**2/8,abs=1e-8)
    for nodal in trace['combinations']['LC']['nodal_loads'].values():np.testing.assert_allclose(nodal,0.,atol=1e-12)
    assert result['combinations']['LC']['equilibrium']['relative_residual']<1e-8


def spatial_axial_joint():
    p=beam();vectors=[np.array(v,dtype=float) for v in ((1,0,1),(0,1,1),(-1,-1,1))]
    forces=[1200.,-800.,600.];force=-sum(n*v/np.linalg.norm(v) for n,v in zip(forces,vectors))
    p['nodes']=[dict(id='O',x_m=0.,y_m=0.,z_m=0.)]+[dict(id=k,**dict(zip(('x_m','y_m','z_m'),map(float,v)))) for k,v in zip('ABC',vectors)]+[dict(id='D',x_m=2.,y_m=0.,z_m=1.)]
    frame=deepcopy(p['members'][0]);frame.update(id='FRAME',start='A',end='D')
    axial=deepcopy(p['members'][1]);p['members']=[frame]+[dict(axial,id='X'+k,start='O',end=k) for k in 'ABC']
    p['supports']=[dict(node=k,restrained=[True]*3+([True]*3 if k in 'AD' else [False]*3)) for k in 'ABCD']
    p['member_loads']=[];p['nodal_loads']=[dict(node='O',case='L',fx_n=float(force[0]),fy_n=float(force[1]),fz_n=float(force[2]),mx_nm=0.,my_nm=0.,mz_nm=0.)]
    p['combinations']=[dict(id='LC',factors={'L':1.}),dict(id='INV',factors={'L':-2.})]
    return p,vectors,forces


def test_noncoplanar_axial_joint_independent_force_balance_and_combinations():
    p,vectors,forces=spatial_axial_joint();result,trace=solve(p)
    for name,factor in [('LC',1.),('INV',-2.)]:
        total=np.array(trace['combinations'][name]['nodal_loads']['O'][:3])
        for k,vector,n in zip('ABC',vectors,forces):
            m=result['combinations'][name]['members']['X'+k]; assert m['axial_n']==pytest.approx(n*factor,rel=1e-8)
            action=trace['combinations'][name]['members']['X'+k]
            assert set(action)=={'kind','node_on_member_force_n'}  # no axial end moments
            np.testing.assert_allclose(action['node_on_member_force_n'][0],-n*factor*vector/np.linalg.norm(vector),atol=1e-6)
            total-=action['node_on_member_force_n'][0]
        np.testing.assert_allclose(total,0.,atol=1e-6)
        assert result['combinations'][name]['nodes']['O']['active_rotations'] is False


def test_legacy_contract_unchanged_when_trace_not_requested():
    p=beam();old=analyze_loaded_mixed3d(p);new,trace=solve(p)
    assert 'joint_actions' not in old and 'joint_actions' not in new
    old['diagnostics'].pop('elapsed_seconds');new['diagnostics'].pop('elapsed_seconds')
    assert old==new
    assert trace['schema_version']=='jpn.member-end-actions/1'


@pytest.mark.parametrize('bad', ['unrestrained','release','disconnected'])
def test_invalid_models_stay_blocked(bad):
    p=beam()
    if bad=='unrestrained':p['supports']=[]
    elif bad=='release':p['members'][0]['release_start'][3]=p['members'][0]['release_end'][3]=True
    else:p['nodes'].append(dict(id='ORPHAN',x_m=20.,y_m=20.,z_m=20.))
    with pytest.raises(AnalysisError) as error:solve(p)
    assert error.value.code in ('UNSTABLE','UNSUPPORTED_RELEASE','DISCONNECTED_MODEL')
