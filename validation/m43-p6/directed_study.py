"""Bounded paired performance and native-equilibrium interventions."""
import argparse,json,sys,platform
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'validation/m43-p6/reference_v2'))
from campaign import execute,benchmark_bases,sha

def main():
    p=argparse.ArgumentParser();p.add_argument('--opensees-python',required=True);args=p.parse_args()
    baseline=json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text());old=json.loads((ROOT/'validation/m43-p5/evidence.json').read_text())
    requests={r['case']:{**r['request'],'numerics':o['requested_numerics']} for r,o in zip(baseline['cases'],old['cases'])}
    out=ROOT/'.tools/m43-p6/directed';out.mkdir(parents=True,exist_ok=True)
    report=dict(platform=platform.platform(),spatial=[],torsion=[],source_sha256_lf={str(p.relative_to(ROOT)):sha(p) for p in (ROOT/'experiments/m43_p6').glob('*.py')},computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')
    def save(): (out/'summary.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    for n in (2,3,4,6,8):
        pair=[]
        for mode in ('baseline','reused'):
            cmd=[sys.executable,'-I',str(ROOT/'experiments/m43_p6/worker.py'),'--material-curvature','--single-mesh',str(n)]
            if mode=='baseline':cmd.append('--baseline-reciprocals')
            row=execute(cmd,requests['spatial']);pair.append(row)
            (out/f'spatial-{n}-{mode}.json').write_text(json.dumps(row,allow_nan=False))
        complete=all(r['execution']['status']=='diagnostic' for r in pair)
        equal=pair[0]['execution']['diagnostic']['candidate']==pair[1]['execution']['diagnostic']['candidate'] if complete else None
        record=dict(mesh=n,status=[r['execution']['status'] for r in pair],seconds=[r['elapsed_seconds'] for r in pair],full_candidate_exactly_equal=equal)
        report['spatial'].append(record);save();print(json.dumps(record),flush=True)
        if complete:assert equal,'Optimization changed complete candidate response'
    model=requests['torsion']['model'];bases=benchmark_bases(model)
    for n in (16,32,64):
        for test,tolerance,system,steps in [('NormDispIncr',1e-14,'BandGeneral',10),('NormUnbalance',1e-8,'BandGeneral',10),('EnergyIncr',1e-16,'BandGeneral',10),('NormDispIncr',1e-14,'UmfPack',10),('NormDispIncr',1e-14,'BandGeneral',20)]:
            payload=dict(method='native',model=model,bases=bases,subdivisions=n,test_tolerance=tolerance,convergence_test=test,linear_system=system,load_steps=steps)
            row=execute([args.opensees_python,'-I',str(ROOT/'validation/m43-p6/reference_v2/worker.py')],payload)
            result=row['execution'].get('result',{})
            name=f'torsion-{n}-{test}-{system}-{steps}.json';(out/name).write_text(json.dumps(row,allow_nan=False))
            record=dict(file=name,mesh=n,test=test,tolerance=tolerance,system=system,steps=steps,status=row['execution']['status'],seconds=row['elapsed_seconds'],equilibrium=result.get('physical_support_equilibrium'),assembled=result.get('assembled_equilibrium'),iterations=result.get('iterations_per_step'),test_norms=result.get('test_norms'))
            record['error']=row['execution'].get('error')
            report['torsion'].append(record);save();print(json.dumps({k:record[k] for k in ('mesh','test','system','steps','status')}),flush=True)

if __name__=='__main__':main()
