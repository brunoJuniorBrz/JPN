"""Record independent closed-form comparisons and a protected real-worker case."""
import json,os,platform,subprocess,sys,time
from pathlib import Path
from importlib.metadata import version
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tests.test_mixed3d_loads import beam,weight
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d


def audit():
    rows=[];e=200e9;i=1e-5;l=2.;q=-100.
    for kind in ('cantilever','simple','fixed'):
        out=analyze_loaded_mixed3d(beam(kind));c=out['combinations']['LC'];s=c['members']['BEAM']['stations']
        expected=q*l**4/(8*e*i) if kind=='cantilever' else (5 if kind=='simple' else 1)*q*l**4/(384*e*i)
        actual=c['nodes']['B']['translation_m'][2] if kind=='cantilever' else s[2]['translation_local_m'][2]
        rows.append(dict(case=kind,expected_deflection_m=expected,actual_deflection_m=actual,absolute_error_m=abs(expected-actual),reactions=c['nodes']['A'],stations=s,equilibrium=c['equilibrium']))
        assert abs(actual-expected)<1e-11
    w=analyze_loaded_mixed3d(weight(beam()))
    root=Path(__file__).parent;payload=(root/'examples/mixed-loaded-roof.json').read_bytes();start=time.perf_counter()
    run=subprocess.run([sys.executable,'-I','-X','utf8',str(root/'local_mixed_worker.py')],input=payload,capture_output=True,timeout=22,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    response=json.loads(run.stdout);assert run.returncode==0,response
    result=response['result'];c=result['combinations']['TOTAL'];mass=result['loading']['self_weight']['total_mass_kg']
    return dict(status='passed',environment=dict(python=platform.python_version(),platform=platform.platform(),dependencies={p:version(p) for p in ('numpy','scipy','PyNiteFEA')}),references=rows,
      isolated_weight=dict(expected_mass_kg=21,actual_mass_kg=w['loading']['self_weight']['total_mass_kg'],expected_tip_m=-100*2**4/(8*e*i)-5*2**3/(3*e*i),actual_tip_m=w['combinations']['WEIGHT']['nodes']['B']['translation_m'][2]),
      protected_roof=dict(nodes=len(c['nodes']),segments=len(c['members']),total_mass_kg=mass,input_sha256=result['input_sha256'],diagnostics=result['diagnostics'],wall_seconds=time.perf_counter()-start,input_bytes=len(payload),output_bytes=len(run.stdout),execution=response['execution'],equilibrium=c['equilibrium'],sample_frame=next((dict(id=k,**v) for k,v in c['members'].items() if v['kind']=='frame')),sample_axial=next((dict(id=k,**v) for k,v in c['members'].items() if v['kind']=='axial'))))


if __name__=='__main__':print(json.dumps(audit(),indent=2,allow_nan=False))
