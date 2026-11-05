import copy
from decimal import Decimal,localcontext
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np
import pytest
from jpn_structural.frame3d_model import input_hash
from jpn_structural.member_buckling import compute_member_buckling,midline_u
from jpn_structural.model import AnalysisError

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT.parent/'docs/validation/coldformed-design/continuation/automatic-compression.json'
pytestmark=pytest.mark.filterwarnings('default:Conversion of an array with ndim > 0 to a scalar is deprecated:DeprecationWarning')


@pytest.mark.parametrize('case',[0,1])
def test_real_capped_worker_mixed_inputs_computed_modes_and_independent_decimal_mrd(case):
    row=json.loads(EVIDENCE.read_text(encoding='utf-8'))['cases'][case];raw=row['design_input']
    assert raw['design']['binding']['analysis_input_sha256']==input_hash(row['solver_input'])
    assert raw['design']['binding']['analysis_result_sha256']==input_hash(row['solver_result'])
    assert row['solver_result']['combinations']['ULS-CONTROL']['members']['COLUMN']['axial_n']==pytest.approx(-row['load_n'])
    p=subprocess.run([sys.executable,'-I','-X','utf8',str(ROOT/'section_worker.py')],input=json.dumps(raw).encode(),capture_output=True,timeout=20,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    out=json.loads(p.stdout);assert p.returncode==0,out
    assert out['execution']['memory_limit_bytes']==805306368
    r=out['result'];audit=r['buckling_audit'];assert r['input_sha256']==input_hash(raw)
    assert max(audit['relative_changes'].values())<=.001
    assert raw['design']['critical']=={k:None for k in raw['design']['critical']}
    # Independent high-precision arithmetic, no call to the production MRD.
    with localcontext() as context:
        context.prec=50;D=lambda v:Decimal(str(v));ny=D(r['geometry_audit']['computed_properties']['area_m2'])*D(raw['design']['section']['fy_pa'])
        ne,nl,nd=(D(audit['compression_critical_n'][k]) for k in ('global','local','distortional'))
        ratio=ny/ne;ng=Decimal('.658')**ratio*ny if ratio<=Decimal('2.25') else Decimal('.877')*ne
        ll=(ng/nl).sqrt();ld=(ny/nd).sqrt()
        local=ng if ll<=Decimal('.776') else (1-Decimal('.15')/ll**Decimal('.8'))*ng/ll**Decimal('.8')
        dist=ny if ld<=Decimal('.561') else (1-Decimal('.25')/ld**Decimal('1.2'))*ny/ld**Decimal('1.2')
        resistance=float(min(ng,local,dist)/Decimal('1.20'))
    check=next(c for c in r['checks'] if c['id']=='compression')
    assert check['resistance']==pytest.approx(resistance,rel=2e-12)
    assert check['status']==('CONDITIONAL' if case==0 else 'FAIL')
    assert not r['computed_structural_approval'] and not audit['error_bound_certified']


@pytest.mark.parametrize('case',['cwlip_P','cwlip_Mx'])
def test_combined_runtime_against_original_matlab_eigenvalues(case):
    from pycufsm import fsm
    from pycufsm.pre import cutwp
    x=json.loads((ROOT/'section_tests/fixtures'/f'{case}.json').read_text());n=np.array(x['nodes'],float);e=np.array(x['elements'],float)
    a,_,_=fsm.strip(props=np.array(x['props'],float),nodes=n,elements=e,lengths=np.array(x['lengths']),springs=np.array([]),constraints=np.array([]),GBT_con=dict(glob=[0],dist=[0],local=[0],other=[0],o_space=1,couple=1,orth=2,norm=0),B_C='S-S',m_all=np.ones((len(x['lengths']),1)),n_eigs=1,sect_props=cutwp.prop2(n[:,1:3],e[:,1:4]))
    # Original project's existing absolute comparison criterion, unchanged.
    np.testing.assert_allclose(a,x['reference_first_eigenvalue'],rtol=0,atol=1e-4)


def test_projected_modal_spaces_obey_rayleigh_ritz_constraint_inequality():
    from pycufsm import fsm
    from pycufsm.pre import cutwp
    from pycufsm.solve import cfsm
    geometry=dict(height=200,width=75,lip=20,wallThickness=1,insideRadius=0)
    n,e=midline_u(geometry,4,8);sect=cutwp.prop2(n[:,1:3],e[:,1:4]);*_,nd,nl,perm=cfsm.base_properties(nodes=n,elements=e)
    results={}
    for family in ('all','local','distortional'):
        config=dict(glob=[0]*4,dist=[int(family=='distortional')]*int(nd),local=[int(family=='local')]*int(nl),other=[0]*(2*(len(n)-1)),o_space=1,couple=1,orth=1,norm=1)
        a,_,_=fsm.strip(props=np.array([[0,200000,200000,.3,.3,200000/2.6]]),nodes=n,elements=e,lengths=np.array([125.,2000/15]),springs=np.array([]),constraints=np.array([]),GBT_con=config,B_C='S-S',m_all=np.ones((2,1)),n_eigs=1,sect_props=sect)
        results[family]=a
    assert np.all(results['all']<=results['local']) and np.all(results['all']<=results['distortional'])
    assert not np.allclose(results['local'],results['distortional'])


def test_rounded_member_that_does_not_refine_is_not_admitted_to_mrd():
    old=json.loads((ROOT.parent/'docs/validation/coldformed-design/integrated-tension.json').read_text(encoding='utf-8'))
    row=json.loads(EVIDENCE.read_text(encoding='utf-8'))['cases'][0];d=copy.deepcopy(row['design_input']['design'])
    with pytest.raises(AnalysisError,match='refinement target'):
        compute_member_buckling(row['design_input']['stability_model'],old['section'],d,.3,old['cases'][0]['design_input']['geometry_analysis']['geometry'])


@pytest.mark.parametrize('key,value',[('boundary','clamped-free'),('intermediate_restraints','assumed-purlins'),('load_pattern','biaxial-bending'),('half_waves_max',4),('target',.01)])
def test_unsupported_conditions_cannot_silently_relax_the_computation(key,value):
    row=json.loads(EVIDENCE.read_text(encoding='utf-8'))['cases'][0];raw=row['design_input'];m=copy.deepcopy(raw['stability_model']);m[key]=value
    with pytest.raises(AnalysisError):compute_member_buckling(m,{},raw['design'],.3,raw['geometry_analysis']['geometry'])
