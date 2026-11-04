"""Executable mixed-engine overlap and explicitly non-equivalent portal probe."""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
from jpn_structural.mixed_initial_stress import analyze_mixed_initial_stress
from compare_frame_engines import stabileo_input


def main():
    p=argparse.ArgumentParser();p.add_argument('--stabileo',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,required=True);args=p.parse_args()
    out=args.output_dir;out.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
    base=json.loads((ROOT/'engine/examples/mixed-initial-stress-axial-brace.json').read_text())
    rows=[]
    for ratio in [0.,.2,.8,.95,-.6]:
        raw=copy.deepcopy(base);k=3*200e9*1e-5/2**3;ka=200e9*.001
        raw['model']['nodal_loads'][0]['fz_n']=ratio*k*(ka+k)/ka
        request=dict(analysis='pdelta',maxIter=30,tolerance=1e-10,model=stabileo_input(raw['model']))
        source=out/f'input-{ratio}.json';source.write_text(json.dumps(request,indent=2)+'\n',encoding='utf8')
        external=subprocess.run([str(args.stabileo.resolve()),str(source.resolve())],capture_output=True,env=env,timeout=20)
        (out/f'output-{ratio}.json').write_bytes(external.stdout)
        (out/f'stderr-{ratio}.txt').write_bytes(external.stderr)
        if external.returncode:
            raise RuntimeError(external.stdout.decode()[:2000])
        result=json.loads(external.stdout)
        jpn=analyze_mixed_initial_stress(raw)['combinations']['LC']
        native=next(n for n in result['results']['displacements'] if n['nodeId']==2)
        actual=jpn['nodes']['B']['translation_m'][1];reference=native['uy'];exact=100/(k*(1-ratio))
        row=dict(ratio=ratio,jpn_uy_m=actual,stabileo_uy_m=reference,analytical_uy_m=exact,
            relative_difference=abs(actual-reference)/abs(reference),stabileo_converged=result['converged'])
        rows.append(row)
        assert result['converged'] and row['relative_difference']<1e-8, row
        assert abs(actual-exact)/abs(exact)<1e-8,row
    # Portal is retained as a diagnostic: Stabileo updates normal forces and
    # includes torsional terms, unlike this deliberately frozen bending model.
    raw=json.loads((ROOT/'engine/examples/mixed-initial-stress-portal.json').read_text())
    request=dict(analysis='pdelta',maxIter=30,tolerance=1e-10,model=stabileo_input(raw['model']))
    source=out/'portal-input.json';source.write_text(json.dumps(request,indent=2)+'\n',encoding='utf8')
    run=subprocess.run([str(args.stabileo.resolve()),str(source.resolve())],capture_output=True,env=env,timeout=20)
    (out/'portal-output.json').write_bytes(run.stdout);(out/'portal-stderr.txt').write_bytes(run.stderr)
    diagnostic=dict(exit_code=run.returncode,physically_identical=False,acceptance_claimed=False,
        reason='Stabileo iterative axial forces and torsional geometric energy differ from the frozen bending prototype')
    if run.returncode==0:
        r=json.loads(run.stdout);jpn=analyze_mixed_initial_stress(raw)['combinations']['LC'];ids={i+1:n['id'] for i,n in enumerate(raw['model']['nodes'])}
        differences=[]
        for node in r['results']['displacements']:
            actual=np.array(jpn['nodes'][ids[node['nodeId']]]['translation_m'])
            reference=np.array([node[k] for k in ['ux','uy','uz']])
            differences.append(float(np.linalg.norm(actual-reference)))
        diagnostic.update(max_translation_difference_m=max(differences),stabileo_converged=r['converged'])
    result=dict(overlap_cases=rows,portal_diagnostic=diagnostic,release_gate='BLOCKED',normative_second_order_verified=False,approved_for_fabrication=False)
    (out/'summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result))


if __name__=='__main__':main()
