"""Real section library -> physical admission -> normative arithmetic worker."""
import copy
import math
import json
from pathlib import Path
import subprocess
import sys
import pytest
from jpn_structural.coldformed_geometry import analyze_verified_coldformed
from jpn_structural.section_analysis import analyze_section
from jpn_structural.model import AnalysisError
from tests.test_coldformed_design import member
from tests.test_mixed3d import beam_and_axial
from jpn_structural.mixed3d import analyze_mixed3d
from jpn_structural.frame3d_model import input_hash


@pytest.fixture(scope='module')
def physical():
    section=dict(schema_version='jpn.section-analysis/1',units='mm',geometry=dict(shape='u-stiffened',height=100,width=50,lip=15,wallThickness=2,insideRadius=3),poisson=.3,source='Explicit synthetic geometric control, not a commercial section',revision='1',responsible='Independent integration test',convergence=.001)
    measured=analyze_section(section)['properties'];d=member()
    d['section'].update(area_m2=measured['areaMm2']*1e-6,iy_m4=measured['iyMm4']*1e-12,iz_m4=measured['izMm4']*1e-12,wy_m3=min(measured['wyPositiveMm3'],measured['wyNegativeMm3'])*1e-9,wz_m3=min(measured['wzPositiveMm3'],measured['wzNegativeMm3'])*1e-9)
    d['web'].update(flat_height_m=.09,thickness_m=.002)
    d['tension']=dict(basis='full-section-all-elements-welded',source='Declared hole-free bar; all section elements connected by longitudinal and transverse welds; weld resistance is outside this member test',revision='1')
    values={k:d['section'][k] for k in ['area_m2','iy_m4','iz_m4','wy_m3','wz_m3']};values['j_m4']=measured['jMm4']*1e-12
    resolutions={k:10**(math.floor(math.log10(v))-5) for k,v in values.items()}
    for k,v in values.items():
        if k!='j_m4':d['section'][k]=float(format(v,'.6g'))
    return dict(schema_version='jpn.verified-coldformed/1',geometry_analysis=section,solver_j_m4=float(format(values['j_m4'],'.6g')),
                property_resolutions=resolutions,design=d)


def test_real_worker_refuses_contradictory_geometry_and_runs_matching_section(physical):
    root=Path(__file__).resolve().parents[1]
    out=subprocess.run([sys.executable,'-I','-X','utf8',str(root/'section_worker.py')],input=json.dumps(physical).encode(),capture_output=True,timeout=20)
    r=json.loads(out.stdout)
    assert out.returncode==0, r
    assert r['execution']['memory_limit_bytes']==805306368
    assert r['result']['geometry_audit']['library']['version']=='3.10.2'
    difference=abs(r['result']['geometry_audit']['computed_properties']['area_m2']-physical['design']['section']['area_m2'])
    assert difference<=physical['property_resolutions']['area_m2']/2+128*math.ulp(physical['design']['section']['area_m2'])
    assert r['result']['checks'] and not r['result']['computed_structural_approval']
    bad=copy.deepcopy(physical);bad['design']['section']['area_m2']*=10
    with pytest.raises(AnalysisError,match='area_m2'):analyze_verified_coldformed(bad)


def test_revision_and_web_dimensions_are_not_reinterpreted(physical):
    bad=copy.deepcopy(physical);bad['design']['web']['flat_height_m']=.1
    with pytest.raises(AnalysisError,match='Web dimensions'):analyze_verified_coldformed(bad)
    bad=copy.deepcopy(physical);bad['property_resolutions']['j_m4']=1
    with pytest.raises(AnalysisError,match='resolution interval'):analyze_verified_coldformed(bad)
    bad=copy.deepcopy(physical);bad['property_resolutions']['area_m2']=bad['design']['section']['area_m2']/10
    with pytest.raises(AnalysisError,match='six significant digits'):analyze_verified_coldformed(bad)


@pytest.mark.parametrize('load',[1000.,200000.])
def test_real_mixed_solver_to_tension_resistance_matches_independent_parallel_stiffness(physical,load):
    raw=copy.deepcopy(physical);d=raw['design'];p=beam_and_axial()
    p['members'][1]['area_m2']=d['section']['area_m2'];p['nodal_loads'][0]['fz_n']=-load
    result=analyze_mixed3d(p);normal=result['combinations']['LC']['members']['BRACE']['axial_n']
    kb=3*200e9*1e-5/2**3;kt=200e9*d['section']['area_m2']
    assert normal==pytest.approx(load*kt/(kb+kt),rel=1e-10)
    d['piece_id']='BRACE';d['combination_id']='LC';d['study']['minimum_search']='not-required-pure-tension'
    d['critical']={k:None for k in d['critical']};d['section'].update(fy_pa=250e6,fu_pa=400e6)
    d['fields']=[dict(segment_id='BRACE',offset_m=0,length_m=1,forces=dict(nN=[normal],vyN=None,vzN=None,tNm=None,myNm=None,mzNm=None))]
    d['binding'].update(analysis_input_sha256=input_hash(p),analysis_result_sha256=input_hash(result))
    out=analyze_verified_coldformed(raw);c=next(c for c in out['checks'] if c['id']=='tension')
    expected=out['geometry_audit']['computed_properties']['area_m2']*250e6/1.1
    assert c['resistance']==pytest.approx(expected,rel=1e-12)
    assert c['status']==('PASS' if load==1000 else 'FAIL')
    assert not out['approved_for_fabrication']
