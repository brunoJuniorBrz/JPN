"""Independent energy/one-DOF oracles reach the real mixed implementation."""
import copy
import importlib.util
import json
import os
import subprocess
import sys
from fractions import Fraction as F
from pathlib import Path

import numpy as np
import pytest

from jpn_structural.mixed_initial_stress import analyze_mixed_initial_stress, axial_geometric, hermite_geometric
from jpn_structural.model import AnalysisError
from .test_mixed3d import beam_and_axial

spec=importlib.util.spec_from_file_location('m32_oracles',Path(__file__).parents[2]/'validation/mission32-handoff/test_m32_oracles.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)


def request(model):
    return dict(schema_version='jpn.mixed-initial-stress/1',geometric_model='hermite-bending-and-axial-projector',model=model)


def parallel(ratio=.2,lateral=100.):
    data=beam_and_axial();k=3*200e9*1e-5/2**3;ka=200e9*.001
    data['nodal_loads'][0].update(fy_n=lateral,fz_n=ratio*k*(ka+k)/ka)
    return request(data)


def portal():
    data=beam_and_axial();template=data['members'][0]
    data['nodes']=[];data['members']=[]
    for side,x in [('L',0.),('R',4.)]:
        for i in range(5):data['nodes'].append(dict(id=side+str(i),x_m=x,y_m=0.,z_m=3*i/4))
        for i in range(4):data['members'].append(dict(template,id=side+'F'+str(i),start=side+str(i),end=side+str(i+1)))
    for i in range(1,4):data['nodes'].append(dict(id='T'+str(i),x_m=float(i),y_m=0.,z_m=3.))
    top=['L4','T1','T2','T3','R4']
    for i in range(4):data['members'].append(dict(template,id='TOP'+str(i),start=top[i],end=top[i+1]))
    data['nodes'].append(dict(id='ANCHOR',x_m=-2.,y_m=-2.,z_m=0.))
    data['members'].append(dict(id='BRACE',kind='axial',start='ANCHOR',end='R4',e_pa=200e9,area_m2=.0001,source='Synthetic explicit brace',revision='1'))
    data['supports']=[dict(node=n,restrained=[True]*6) for n in ['L0','R0']]+[dict(node='ANCHOR',restrained=[True]*3+[False]*3)]
    load=data['nodal_loads'][0]
    data['nodal_loads']=[dict(load,node=n,fx_n=.1 if n=='R4' else 0.,fy_n=.07 if n=='R4' else 0.,fz_n=-100000.) for n in ['L4','R4']]
    return request(data)


@pytest.mark.parametrize('direction',[(F(1),F(0),F(0)),(F(0),F(1),F(0)),(F(0),F(0),F(1)),(F(3,5),F(4,5),F(0))])
@pytest.mark.parametrize('normal',[-30000.,0.,12000.])
def test_axial_matrix_matches_independent_fraction_oracle(direction,normal):
    actual=axial_geometric([float(v) for v in direction],normal,3.5)
    exact=np.array(oracle.axial_element_global(F(0),F(normal),F(7,2),direction),float)
    np.testing.assert_allclose(actual,exact,rtol=1e-15,atol=1e-11)
    np.testing.assert_array_equal(actual,actual.T)
    np.testing.assert_allclose(actual@np.tile([1.,-2.,3.],2),0.,atol=1e-10)
    np.testing.assert_allclose(actual@np.r_[np.zeros(3),list(map(float,direction))],0.,atol=1e-10)


@pytest.mark.parametrize('length',[.1,4.,20.])
@pytest.mark.parametrize('normal',[-30000.,0.,12000.])
def test_frame_geometric_energy_matches_independent_gauss_integral(length,normal):
    points,weights=np.polynomial.legendre.leggauss(3)
    integral=np.zeros((4,4))
    for t,w in zip((points+1)/2,weights):
        derivative=np.array([(-6*t+6*t*t)/length,1-4*t+3*t*t,(6*t-6*t*t)/length,-2*t+3*t*t])
        integral+=normal*length/2*w*np.outer(derivative,derivative)
    kg=hermite_geometric(normal,length)
    np.testing.assert_allclose(kg[np.ix_([1,5,7,11],[1,5,7,11])],integral,rtol=2e-15,atol=1e-9)
    np.testing.assert_array_equal(kg[[0,3,6,9]],0.)


@pytest.mark.parametrize('ratio',[0.,.2,.8,.95,-.6])
def test_real_mixed_beam_and_axial_matches_closed_lateral_stiffness(ratio):
    raw=parallel(ratio);before=copy.deepcopy(raw)
    out=analyze_mixed_initial_stress(raw);r=out['combinations']['LC']
    k=3*200e9*1e-5/2**3
    assert r['nodes']['B']['translation_m'][1]==pytest.approx(100/(k*(1-ratio)),rel=1e-9)
    assert r['members']['BRACE']['initial_axial_n']==pytest.approx(-ratio*k,abs=1e-7)
    assert r['nodes']['C']['active_rotations'] is False
    np.testing.assert_array_equal(r['nodes']['C']['reaction_moment_nm'],0.)
    assert r['reduced_equilibrium']['relative_residual']<1e-8
    assert r['equilibrium']['relative_residual']<1e-8
    assert raw==before and out['release_gate']=='BLOCKED'
    assert not out['normative_second_order_verified'] and not out['approved_for_fabrication']
    if ratio==0.:
        np.testing.assert_allclose(r['nodes']['B']['translation_m'],out['first_order']['combinations']['LC']['nodes']['B']['translation_m'],rtol=1e-12,atol=1e-15)


@pytest.mark.parametrize('ratio',[1.,1.01,1.2])
def test_actual_mixed_tangent_near_and_above_instability_fails_closed(ratio):
    with pytest.raises(AnalysisError) as caught:analyze_mixed_initial_stress(parallel(ratio,1.))
    assert caught.value.code in ('UNSTABLE','ILL_CONDITIONED')


def test_portal_braced_out_of_plane_real_3d_and_proportional_instability():
    raw=portal();baseline=analyze_mixed_initial_stress(raw)['combinations']['LC']
    critical=baseline['proportional_initial_stress_critical_factor'];assert critical>0
    for ratio in [.2,.8,.95,1.01]:
        modified=copy.deepcopy(raw)
        for load in modified['model']['nodal_loads']:
            for key in ('fx_n','fy_n','fz_n'):load[key]*=critical*ratio
        if ratio>1:
            with pytest.raises(AnalysisError):analyze_mixed_initial_stress(modified)
        else:
            row=analyze_mixed_initial_stress(modified)['combinations']['LC']
            assert row['proportional_initial_stress_critical_factor']==pytest.approx(1/ratio,rel=1e-8)
            assert row['recovered_nodal_equilibrium']['relative_residual']<1e-8


def test_rotation_translation_node_reversal_and_combinations_keep_physical_solution():
    raw=parallel(.6);base=analyze_mixed_initial_stress(raw)['combinations']['LC']
    a,b=.43,.77
    rz=np.array([[np.cos(a),-np.sin(a),0],[np.sin(a),np.cos(a),0],[0,0,1]])
    rx=np.array([[1,0,0],[0,np.cos(b),-np.sin(b)],[0,np.sin(b),np.cos(b)]])
    q=rz@rx;modified=copy.deepcopy(raw)
    for node in modified['model']['nodes']:
        p=q@np.array([node[k] for k in ('x_m','y_m','z_m')])+[100.,-200.,50.]
        node.update(zip(('x_m','y_m','z_m'),p.tolist()))
    for load in modified['model']['nodal_loads']:
        load.update(zip(('fx_n','fy_n','fz_n'),(q@np.array([load[k] for k in ('fx_n','fy_n','fz_n')])).tolist()))
    for member in modified['model']['members']:member['start'],member['end']=member['end'],member['start']
    row=analyze_mixed_initial_stress(modified)['combinations']['LC']
    np.testing.assert_allclose(row['nodes']['B']['translation_m'],q@base['nodes']['B']['translation_m'],rtol=1e-8,atol=1e-12)
    assert row['geometric_energy_j']==pytest.approx(base['geometric_energy_j'],rel=1e-8)
    modified=copy.deepcopy(raw);modified['model']['combinations'].append(dict(id='HALF',factors={'L':.5}))
    row=analyze_mixed_initial_stress(modified)['combinations']['HALF']
    assert row['combination_id']=='HALF' and row['factors']=={'L':.5}
    k=3*200e9*1e-5/2**3
    assert row['nodes']['B']['translation_m'][1]==pytest.approx(50/(k*(1-.3)),rel=1e-9)


@pytest.mark.parametrize('change',[
    lambda r:r['model']['members'][0]['release_start'].__setitem__(4,True),
    lambda r:r['model']['nodal_loads'][0].update(fy_n=float('nan')),
    lambda r:r['model']['supports'].clear(),
    lambda r:r['model']['supports'][1]['restrained'].__setitem__(3,True),
    lambda r:r.update(geometric_model='native-PDelta-on-springs'),
    lambda r:r['model']['nodal_loads'][0].update(fy_n=1e9),
])
def test_invalid_mechanism_release_and_large_motion_never_fall_back(change):
    raw=parallel();change(raw)
    with pytest.raises(AnalysisError):analyze_mixed_initial_stress(raw)


def test_real_capped_worker_and_public_bounded_cli(tmp_path):
    raw=parallel();source=tmp_path/'input.json';target=tmp_path/'output.json'
    source.write_text(json.dumps(raw),encoding='utf8')
    launcher=Path(__file__).parents[1]/'check_mixed_initial_stress.py'
    result=subprocess.run([sys.executable,str(launcher),str(source),'--output',str(target)],capture_output=True,timeout=25,
        env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    assert result.returncode==0,result.stdout
    out=json.loads(target.read_text())
    assert out['execution']['memory_limit_bytes']==768*1024*1024
    assert out['result']['release_gate']=='BLOCKED' and not out['result']['approved_for_fabrication']
    raw['model']['nodal_loads'][0]['fy_n']=float('nan');source.write_text(json.dumps(raw))
    result=subprocess.run([sys.executable,str(launcher),str(source)],capture_output=True,timeout=25)
    assert result.returncode==2
    assert json.loads(result.stdout)['status']=='error'
