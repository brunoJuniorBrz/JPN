import json
import subprocess
import sys
from pathlib import Path
import pytest
from jpn_structural.elastic_strip import analyze_elastic_strip


@pytest.mark.parametrize('case',['cwlip_P','cwlip_Mx'])
def test_elastic_curve_against_original_cufsm_matlab_data_in_converted_si(case):
    x=json.loads((Path(__file__).parent/'fixtures'/f'{case}.json').read_text());mm=25.4;mpa=6.894757293168361
    raw=dict(schema_version='jpn.elastic-strip/1',units='mm-MPa',nodes=[dict(yMm=n[1]*mm,zMm=n[2]*mm,dofs=[bool(v) for v in n[3:7]],stressMpa=n[7]*mpa) for n in x['nodes']],strips=[dict(start=int(e[1]),end=int(e[2]),thicknessMm=e[3]*mm) for e in x['elements']],material=dict(eMpa=x['props'][0][1]*mpa,nu=x['props'][0][3],source='Original CUFSM MATLAB reference',revision=x['source']['commit']),halfWavelengthsMm=[L*mm for L in x['lengths']],boundary='S-S',source='Original elastic DSM2006 example; not ABNT or a roof',revision='1',responsible='Independent comparison')
    r=analyze_elastic_strip(raw)
    # Numerical cross-implementation regression in dimensionless load factor,
    # not a percent engineering tolerance or a resistance certification. The
    # original project's own curve test uses absolute 1e-4; retain that source
    # criterion instead of tuning a universal percentage to the two outcomes.
    for point,expected in zip(r['results'],x['reference_first_eigenvalue']):assert point['loadFactor']==pytest.approx(expected,abs=1e-4,rel=0)
    assert len(r['results'])==99 and not r['normativeResistanceVerified']
    assert r['wavelengthCoverage']=='sampled-explicit-grid'


def test_real_isolated_worker_and_strict_json():
    root=Path(__file__).resolve().parents[1]
    payload=(root/'examples/elastic-strip-compression-reference.json').read_bytes()
    run=subprocess.run([sys.executable,'-I','-X','utf8',str(root/'section_worker.py')],input=payload,capture_output=True,timeout=20)
    out=json.loads(run.stdout)
    assert run.returncode==0 and out['status']=='completed'
    assert out['execution']['memory_limit_bytes']==805306368
    assert len(out['result']['results'])==99 and not out['result']['normativeResistanceVerified']
    bad=payload.replace(b'"units": "mm-MPa"',b'"units": "mm-MPa", "units": "mm-MPa"')
    run=subprocess.run([sys.executable,'-I',str(root/'section_worker.py')],input=bad,capture_output=True,timeout=20)
    assert run.returncode==2 and json.loads(run.stdout)['status']=='error'


def test_degenerate_disconnected_and_undeclared_compression_rejected():
    from jpn_structural.model import AnalysisError
    root=Path(__file__).resolve().parents[1]
    raw=json.loads((root/'examples/elastic-strip-compression-reference.json').read_text())
    for mutate in [lambda p:p['strips'].append(p['strips'][0]),lambda p:p['strips'][0].update(end=p['strips'][0]['start']),lambda p:p['nodes'].append({**p['nodes'][0],'yMm':1234}),lambda p:[n.update(stressMpa=0) for n in p['nodes']],lambda p:p.update(units='SI')]:
        p=json.loads(json.dumps(raw));mutate(p)
        with pytest.raises(AnalysisError):analyze_elastic_strip(p)
