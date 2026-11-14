"""ADDITIONAL reference qualification and raw candidate mesh sequence.

P5 immutable; conditional numerical uncertainty is not a rigorous error bound.
No candidate extrapolation, no altered acceptance tolerance, no production use.
"""
import argparse,hashlib,json,os,platform,subprocess,sys,time
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
from network import benchmark_bases
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'validation/m43-p5'))
from physical_comparison import compare,compare_orientation,richardson,CRITERIA

FIELDS=('translation_m','rotation_rad','reaction_force_n','reaction_moment_nm','physical_end_actions','strain_energy_j')
ENV={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
FLAGS=dict(computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')

def digest(data):return hashlib.sha256(data).hexdigest()
def sha(path):return digest(path.read_bytes().replace(b'\r\n',b'\n'))
def execute(command,payload):
    raw=json.dumps(payload,sort_keys=True,allow_nan=False).encode()
    if len(raw)>500000:raise ValueError('INPUT_LIMIT')
    started=time.perf_counter()
    try:
        p=subprocess.run(command,input=raw,capture_output=True,timeout=20,cwd=ROOT,env=ENV)
        if len(p.stdout)>2000000 or len(p.stderr)>16000:raise ValueError('OUTPUT_LIMIT')
        answer=json.loads(p.stdout)
        if answer['status']=='diagnostic':assert answer['execution']['memory_limit_bytes']==768*1024*1024
        answer.update(returncode=p.returncode,stderr=p.stderr.decode(errors='replace'))
    except subprocess.TimeoutExpired:answer=dict(status='TIMEOUT',limit_seconds=20)
    return dict(input_bytes_sha256=digest(raw),input=payload,elapsed_seconds=time.perf_counter()-started,execution=answer)

def observables(result):
    nodes=result['nodes']
    return {**{k:np.array([v[k] for v in nodes.values()]) for k in ('translation_m','reaction_force_n','reaction_moment_nm')},
        'rotation_rad':np.array([Rotation.from_matrix(v['orientation_matrix']).as_rotvec() for v in nodes.values()]),
        'physical_end_actions':np.array(result['physical_end_actions']),
        'strain_energy_j':np.array([result['strain_energy_j']])}

def qualify(networks,natives):
    """Use two last continuum changes plus restart drift and native cross-check.

    Independent native Richardson remainder is CONDITIONAL on the observed
    even-power trend. Algebraic sensitivity is measured by a second tolerance.
    Each observable's allowance must accommodate the FULL adopted uncertainty.
    """
    if any(r['execution']['status']!='diagnostic' for r in networks+natives):return dict(qualified=False,reason='Reference execution refused/timed out')
    nr=[r['execution']['result'] for r in networks];sr=[r['execution']['result'] for r in natives]
    nv=[observables(r) for r in nr];sv=[observables(r) for r in sr]
    values=nv[-2];uncertainty={};details={};valid=True
    for k in FIELDS:
        # Finest continuum primary, 17-point restart at identical fine tolerance.
        changes=[abs(nv[i+1][k]-nv[i][k]) for i in range(3)]
        drift=abs(nv[-1][k]-nv[-2][k])
        floor=64*np.finfo(float).eps*np.maximum(1,abs(values[k]))
        continuum_u=changes[-1]+changes[-2]+drift+floor
        extrapolated,native_remainder=richardson([v[k] for v in sv[2:5]]) # 16/32/64
        algebraic=abs(sv[-1][k]-sv[-2][k]) # repeat 64, distinct Newton tolerance
        native_deltas=[abs(sv[i+1][k]-sv[i][k]) for i in range(4)]
        # Trend on materially resolved components. Tiny components retain floor.
        active=native_deltas[1]>100*floor
        ratio=np.divide(native_deltas[1],native_deltas[2],out=np.ones_like(floor)*4,where=native_deltas[2]>100*floor)
        trend_mask=(ratio>3.5)&(ratio<4.5)&active
        # No asymptotic extrapolation on unresolved/noisy components. Use the
        # raw finest value plus the SUM of the last two raw changes instead.
        # This increases uncertainty rather than inventing an observed order.
        estimate=np.where(trend_mask,extrapolated,sv[4][k])
        native_u=np.where(trend_mask,native_remainder,native_deltas[-1]+native_deltas[-2])
        cross_error=abs(estimate-values[k])
        uncertainty[k]=continuum_u+cross_error+native_u+algebraic
        allowance=CRITERIA['absolute'][k]+CRITERIA['reference_relative']*abs(values[k])
        sufficient=bool(np.all(uncertainty[k]<=allowance))
        # Independent collocation changes must decrease, allowing roundoff floor.
        continuous_trend=bool(np.all(changes[-1]<=changes[-2]+floor))
        details[k]=dict(continuum_last_two_changes=[c.tolist() for c in changes[-2:]],restart_drift=drift.tolist(),
            native_raw_changes=[v.tolist() for v in native_deltas],native_ratio_8_16_to_16_32=ratio.tolist(),
            native_extrapolation_mask=trend_mask.tolist(),native_unresolved_components=int(np.count_nonzero(~trend_mask)),continuum_decreasing=continuous_trend,
            native_extrapolated=estimate.tolist(),native_conditional_remainder=native_remainder.tolist(),
            native_adopted_uncertainty=native_u.tolist(),
            native_algebraic_sensitivity=algebraic.tolist(),cross_formulation_difference=cross_error.tolist(),
            uncertainty=uncertainty[k].tolist(),maximum_uncertainty_budget_ratio=float(np.max(uncertainty[k]/allowance)),sufficient=sufficient)
        valid &= sufficient and continuous_trend
    eq=[r['physical_support_equilibrium']['accepted'] for r in nr+sr]
    # A failed native equilibrium is retained and prevents qualification against it.
    selected_eq=[r['physical_support_equilibrium']['accepted'] for r in nr[-2:]+sr[2:]]
    valid &= all(selected_eq)
    return dict(qualified=bool(valid),values={k:v.tolist() for k,v in values.items()},uncertainty={k:v.tolist() for k,v in uncertainty.items()},
        nodes=nr[-2]['nodes'],details=details,all_reference_equilibria_accepted=all(eq),selected_reference_equilibria_accepted=all(selected_eq),equilibrium_by_run=eq,
        uncertainty_kind='conditional numerical estimate; not certified interval',
        method='continuum last two changes + restart drift + roundoff floor + native cross-difference + conditional remainder (or raw drift envelope on nonasymptotic components) + algebraic drift')

def candidate_values(result,model):
    mesh=result['candidate'];combo=mesh['combinations']['C'];nodes=combo['nodes']
    actions=[]
    for m in model['members']:
        children=[c for c in mesh['numerical_member_mapping'] if c['parent_member']==m['id']]
        actions.append(combo['members'][children[0]['id']]['end_actions_global'][:6]+combo['members'][children[-1]['id']]['end_actions_global'][6:])
    return {**{k:np.array([nodes[n['id']][k] for n in model['nodes']]) for k in FIELDS[:4]},
            'physical_end_actions':np.array(actions),'strain_energy_j':np.array([combo['strain_energy_j']])}

def evaluate(candidates,qualification,model):
    if not qualification['qualified']:return dict(compared=False,reason='Independent reference not qualified')
    ref=qualification['values'];u=qualification['uncertainty'];rows=[]
    for row in candidates:
        out=dict(subdivisions=row['subdivisions'],elapsed_seconds=row['elapsed_seconds'],status=row['execution']['status'])
        if out['status']=='diagnostic':
            result=row['execution']['diagnostic'];mesh=result['candidate'];actual=candidate_values(result,model)
            checks={k:compare(actual[k],np.array(ref[k]),k,np.array(u[k])) for k in FIELDS}
            combo=mesh['combinations']['C'];orientations={}
            for i,n in enumerate(model['nodes']):
                value=combo['nodes'][n['id']]['orientation_quaternion'];w,x,y,z=value
                # Exp is nonexpansive on this small principal-log domain; norm
                # of component uncertainty conservatively bounds angular error.
                orientations[n['id']]=compare_orientation(Rotation.from_quat([x,y,z,w]).as_matrix(),qualification['nodes'][n['id']]['orientation_matrix'],float(np.linalg.norm(np.array(u['rotation_rad'])[i])))
            out.update(checks=checks,orientation_checks=orientations,all_bounds_met=all(v['bounds_met'] for v in list(checks.values())+list(orientations.values())),
                physical_equilibrium_verified=combo['physical_equilibrium_verified'],values={k:v.tolist() for k,v in actual.items()},
                absolute_error={k:abs(v-np.array(ref[k])).tolist() for k,v in actual.items()},node_count=mesh['node_count'],member_count=mesh['member_count'])
            assert mesh['node_count']<=150 and mesh['member_count']<=320
            for k,v in FLAGS.items():assert result[k]==v
        rows.append(out)
    # Full raw sequence, including the historically failing 2/4 domain.
    successful=[r for r in rows if r['status']=='diagnostic']
    convergence={}
    if len(successful)>=2:
        for k in FIELDS:
            norms=[float(np.max(r['absolute_error'][k])) for r in successful]
            orders=[float(np.log(a/b)/np.log(successful[i+1]['subdivisions']/successful[i]['subdivisions'])) if a>0 and b>0 else None for i,(a,b) in enumerate(zip(norms,norms[1:]))]
            convergence[k]=dict(maximum_absolute_errors=norms,observed_orders=orders,subdivisions=[r['subdivisions'] for r in successful])
    return dict(compared=True,meshes=rows,convergence=convergence,raw_candidate_extrapolation=False)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--opensees-python',required=True);parser.add_argument('--case',choices=['cantilever','sway','spatial','torsion']);parser.add_argument('--references-only',action='store_true');args=parser.parse_args()
    baseline=json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text());old=json.loads((ROOT/'validation/m43-p5/evidence.json').read_text())
    directory=ROOT/'.tools/m43-p6/reference-v2';directory.mkdir(parents=True,exist_ok=True)
    rows=[]
    for source,historical in zip(baseline['cases'],old['cases']):
        case=historical['case']
        if args.case and case!=args.case:continue
        request=source['request'];request['numerics']=historical['requested_numerics'];model=request['model'];bases=benchmark_bases(model)
        network=[];native=[];candidates=[]
        for tolerance,initial in [(1e-8,9),(1e-9,9),(1e-10,9),(1e-11,9),(1e-11,17)]:
            payload=dict(method='network',model=model,bases=bases,tolerance=tolerance,initial_nodes=initial)
            row=execute([sys.executable,'-I',str(Path(__file__).with_name('worker.py'))],payload);network.append(row)
            (directory/f'{case}-network-{tolerance}-{initial}.json').write_text(json.dumps(row,indent=2,allow_nan=False)+'\n')
        for n,tolerance in [(4,1e-14),(8,1e-14),(16,1e-14),(32,1e-14),(64,1e-14),(64,1e-12)]:
            row=execute([args.opensees_python,'-I',str(Path(__file__).with_name('worker.py'))],dict(method='native',model=model,bases=bases,subdivisions=n,test_tolerance=tolerance));native.append(row)
            (directory/f'{case}-native-{n}-{tolerance}.json').write_text(json.dumps(row,indent=2,allow_nan=False)+'\n')
        qualification=qualify(network,native)
        # Qualification precedes comparison. Preserve raw candidate sequence even
        # when the oracle remains insufficient; no approval is inferred from it.
        if not args.references_only:
            for n in (2,3,4,6,8):
                row=execute([sys.executable,'-I',str(ROOT/'experiments/m43_p6/worker.py'),'--material-curvature','--single-mesh',str(n)],request);row['subdivisions']=n;candidates.append(row)
                (directory/f'{case}-candidate-{n}.json').write_text(json.dumps(row,indent=2,allow_nan=False)+'\n')
        evaluation=evaluate(candidates,qualification,model)
        # Successful mesh comparisons do not by themselves certify a complete
        # refinement sequence or the physical domain. Human audit remains needed.
        summary=dict(case=case,physical_model=model,bases_global_to_local=bases,reference_qualification=qualification,candidate_evaluation=evaluation,
            network_runs=network,native_runs=native,candidate_runs=candidates,classification='PENDENTE' if qualification['qualified'] else 'REFERÊNCIA INSUFICIENTE',**FLAGS)
        rows.append(summary);(directory/f'{case}-summary.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        print(json.dumps(dict(case=case,reference_qualified=qualification['qualified'],equilibria=qualification.get('equilibrium_by_run'),budget={k:v['maximum_uncertainty_budget_ratio'] for k,v in qualification.get('details',{}).items()},candidate_status=[r['execution']['status'] for r in candidates])),flush=True)
    manifest=dict(schema_version='jpn.p6-independent-reference-campaign/2',platform=platform.platform(),python=sys.version,results=rows,
        frozen_p5_sha256={p.name:sha(p) for p in (ROOT/'validation/m43-p5').glob('*') if p.is_file()},
        source_sha256_lf={str(p.relative_to(ROOT)):sha(p) for folder in ('experiments/m43_p6','validation/m43-p6/reference_v2') for p in (ROOT/folder).glob('*.py')},**FLAGS)
    manifest['raw_file_sha256']={p.name:digest(p.read_bytes()) for p in directory.glob('*.json') if '-summary' not in p.name and not p.name.startswith('campaign-')}
    (directory/('campaign-'+(args.case or 'all')+'.json')).write_text(json.dumps(manifest,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    # Newly demonstrated reference precision is mandatory, independently of
    # candidate pass/fail. Retain ALL raw evidence before failing the CI gate.
    assert all(r['reference_qualification']['qualified'] for r in rows if r['case']!='torsion'), 'Additional reference qualification regressed; raw evidence retained'

if __name__=='__main__':main()
