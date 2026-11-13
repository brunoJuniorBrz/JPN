"""Capped P6 campaign against archived independent P5 physical references.

Never overwrite historical evidence or promote a passed mathematical diagnostic.
"""
import argparse,hashlib,json,os,subprocess,sys,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
sys.path.insert(0,str(ROOT/'validation/m43-p5'))
from reproduce import measures,physical_matrix
from physical_comparison import compare,compare_orientation
from jpn_structural.frame3d_model import input_hash

def sha(p): return hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--material-curvature',action='store_true')
    args=parser.parse_args()
    baseline=json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text())
    evidence=json.loads((ROOT/'validation/m43-p5/evidence.json').read_text())
    cases=[]
    for original,old in zip(baseline['cases'],evidence['cases']):
        request=original['request'];request['numerics']=old['requested_numerics']
        started=time.perf_counter()
        try:
            command=[sys.executable,'-I','-X','utf8',str(ROOT/'experiments/m43_p6/worker.py')]+(['--material-curvature'] if args.material_curvature else [])
            completed=subprocess.run(command,
                input=json.dumps(request).encode(),capture_output=True,timeout=20,cwd=ROOT,
                env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
            assert len(completed.stdout)<=2000000 and len(completed.stderr)<=16000
            answer=json.loads(completed.stdout)
        except subprocess.TimeoutExpired:
            answer=dict(status='TIMEOUT',limit_seconds=20)
        row=dict(case=old['case'],input_sha256=input_hash(request),elapsed_seconds=time.perf_counter()-started,execution=answer,
                 production_enabled=False,computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')
        if answer['status']=='diagnostic':
            result=answer['diagnostic'];assert result['input_sha256']==input_hash(request)
            assert result['experimental_controls']['material_curvature']==args.material_curvature
            assert answer['execution']['memory_limit_bytes']==768*1024*1024
            for k in ('production_enabled','computed_structural_approval','fabrication_release','spatial_domain_verified','normative_stability_verified'): assert result[k] is False
            actual=measures(result['candidate'],request['model']);ref=old['after']
            row['independent_checks']={k:compare(a,np.array(ref['reference'][k]),k,np.array(ref['uncertainty'][k])) for k,a in actual.items()}
            nodes=result['candidate']['combinations']['C']['nodes']
            row['orientation_checks']={n:compare_orientation(physical_matrix(nodes[n]),r['reference_orientation'],r['reference_uncertainty_rad']) for n,r in ref['physical_nodes'].items()}
            row['refinement']=result['comparison'];row['physical_convergence_verified']=result['physical_convergence_verified']
            row['archived_reference_equilibrium_verified']=old['native_equilibrium_verified']
            row['all_archived_bounds_met']=all(c['bounds_met'] for c in row['independent_checks'].values()) and all(c['bounds_met'] for c in row['orientation_checks'].values())
            rod=old.get('continuous_after')
            if rod:
                row['continuous_checks']={k:compare(a,np.array(rod['reference'][k]),k,np.array(rod['uncertainty'][k])) for k,a in actual.items()}
                row['continuous_orientations']={n:compare_orientation(physical_matrix(nodes[n]),r['reference_orientation'],r['reference_uncertainty_rad']) for n,r in rod['physical_nodes'].items()}
                row['all_archived_bounds_met'] &= all(c['bounds_met'] for c in row['continuous_checks'].values()) and all(c['bounds_met'] for c in row['continuous_orientations'].values())
            row['strictly_verified_diagnostic']=row['all_archived_bounds_met'] and row['physical_convergence_verified'] and old['native_equilibrium_verified']
        cases.append(row)
        print(json.dumps({k:row.get(k) for k in ('case','elapsed_seconds','all_archived_bounds_met','physical_convergence_verified')}),flush=True)
    output=ROOT/('.tools/m43-p6/material-evidence.json' if args.material_curvature else '.tools/m43-p6/evidence.json');output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(dict(schema_version='jpn.m43-p6-campaign/1',
        criteria_sha256=sha(ROOT/'validation/m43-p5/criteria.json'),reference_sha256=sha(ROOT/'validation/m43-p5/evidence.json'),
        source_sha256_lf={str(p.relative_to(ROOT)):sha(p) for p in (ROOT/'experiments/m43_p6').glob('*.py')},
        references='Archived OpenSees SO(3)/Kirchhoff P5; not newly generated OpenSees results',cases=cases,
        material_curvature=args.material_curvature,
        computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED'),indent=2,allow_nan=False)+'\n',encoding='utf-8')
    assert cases[0].get('strictly_verified_diagnostic') is True, 'Previously demonstrated cantilever regressed; evidence retained'

if __name__=='__main__': main()
