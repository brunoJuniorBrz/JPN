"""Reproducible bounded SPATIAL cost study, no acceptance extrapolation."""
import hashlib,json,os,platform,pstats,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'.tools/m43-p6/profiling';out.mkdir(parents=True,exist_ok=True)
baseline=json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text())
historical=json.loads((ROOT/'validation/m43-p5/evidence.json').read_text())
request=next(x['request'] for x in baseline['cases'] if x['case']=='spatial')
request['numerics']=next(x['requested_numerics'] for x in historical['cases'] if x['case']=='spatial')
payload=json.dumps(request).encode();rows=[]
for n in (2,3,4,6,8):
    path=out/f'mesh-{n}.prof';started=time.perf_counter()
    try:
        p=subprocess.run([sys.executable,'-I',str(ROOT/'experiments/m43_p6/profile_worker.py'),str(path),'--material-curvature','--single-mesh',str(n)],input=payload,capture_output=True,timeout=20,cwd=ROOT,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
        if len(p.stdout)>2000000:raise ValueError('OUTPUT_LIMIT')
        result=json.loads(p.stdout);status=result['status']
        (out/f'mesh-{n}-result.json').write_bytes(p.stdout)
    except subprocess.TimeoutExpired:status='TIMEOUT'
    stats=pstats.Stats(str(path));functions=[]
    for (file,line,name),(primitive,calls,self_time,cumulative,callers) in stats.stats.items():
        if any(k in file for k in ('m43_p6','second_jet','p4_frame','corotational_planar','scipy/linalg','scipy\\linalg')):
            functions.append(dict(file=file,line=line,function=name,calls=calls,self_seconds=self_time,cumulative_seconds=cumulative))
    functions.sort(key=lambda r:r['cumulative_seconds'],reverse=True)
    row=dict(mesh=n,status=status,wall_seconds=time.perf_counter()-started,partial=status=='TIMEOUT',memory=json.loads(path.with_suffix('.memory.json').read_text()),functions=functions)
    rows.append(row);print(json.dumps({k:row[k] for k in ('mesh','status','wall_seconds','memory')}),flush=True)
    (out/'summary.json').write_text(json.dumps(dict(platform=platform.platform(),input_sha256=hashlib.sha256(payload).hexdigest(),profile_overhead_included=True,rows=rows),indent=2))
