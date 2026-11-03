"""Real protected mixed worker: roof and maximum declared resource envelope.

The added nodes/supports are a synthetic performance fixture, never inferred
construction assumptions. Run with requirements-sections.lock (psutil monitor).
"""
import copy
import itertools
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import psutil


def maximum_fixture(raw):
    p=copy.deepcopy(raw)
    bases=[s['node'] for s in p['supports'] if all(s['restrained'][:3])][:3]
    assert len(bases)==3
    template=next(m for m in p['members'] if m['kind']=='axial')
    # Tripods to three non-collinear existing fixed base points.
    for i in range(18):
        name=f'PERF-{i}'
        p['nodes'].append(dict(id=name,x_m=2.1+i*i*.017,y_m=1.1+i*.13,z_m=6+i*i*i*.003))
        for j,base in enumerate(bases):
            p['members'].append({**template,'id':f'PERF-{i}-{j}','start':base,'end':name})
    pairs={tuple(sorted((m['start'],m['end']))) for m in p['members']}
    fixed=[f'PERF-{i}' for i in range(18)]
    for a,b in itertools.combinations(fixed,2):
        if len(p['members'])==320:break
        if tuple(sorted((a,b))) not in pairs:
            p['members'].append({**template,'id':f'PERF-FIXED-{len(p["members"])}','start':a,'end':b})
    p['combinations']=[{**p['combinations'][0],'id':f'PERF-C{i}'} for i in range(10)]
    density=p['self_weight']['densities'][0]
    declared={d['member'] for d in p['self_weight']['densities']}
    p['self_weight']['densities'] += [{**density,'member':m['id'],'source':'Synthetic performance fixture density, not physical construction'} for m in p['members'] if m['id'] not in declared]
    assert len(p['nodes'])==150 and len(p['members'])==320
    return p


def measure(raw,name):
    payload=json.dumps(raw,separators=(',',':'),allow_nan=False).encode()
    start=time.perf_counter();peak=0;timed_out=False
    # File pipes avoid stdout deadlock while monitoring a large real response.
    with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
        child=subprocess.Popen([sys.executable,'-I','-X','utf8',str(Path(__file__).parent/'local_mixed_worker.py')],stdin=subprocess.PIPE,stdout=output,stderr=errors,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
        child.stdin.write(payload);child.stdin.close()
        process=psutil.Process(child.pid)
        while child.poll() is None:
            try:peak=max(peak,process.memory_info().rss)
            except psutil.NoSuchProcess:pass
            if time.perf_counter()-start>20:timed_out=True;child.kill();break
            time.sleep(.01)
        child.wait(timeout=2);output.seek(0);body=output.read();errors.seek(0);stderr=errors.read()
    result=json.loads(body) if body else {}
    return dict(name=name,nodes=len(raw['nodes']),segments=len(raw['members']),combinations=len(raw['combinations']),input_bytes=len(payload),output_bytes=len(body),peak_rss_bytes=peak,elapsed_seconds=time.perf_counter()-start,timed_out=timed_out,returncode=child.returncode,status=result.get('status'),error=result.get('error'),stderr_bytes=len(stderr),input_sha256=result.get('result',{}).get('input_sha256'),equilibrium={k:v['equilibrium'] for k,v in result.get('result',{}).get('combinations',{}).items()},completed_within_http_caps=result.get('status')=='completed' and len(body)<=2000000 and len(payload)<=500000 and not timed_out)


if __name__=='__main__':
    raw=json.loads((Path(__file__).parent/'examples/mixed-loaded-roof.json').read_text(encoding='utf8'))
    maximum=maximum_fixture(raw);single=copy.deepcopy(maximum);single['combinations']=single['combinations'][:1]
    print(json.dumps(dict(python=sys.version,threads=1,results=[measure(raw,'synthetic-roof-207-pieces'),measure(single,'synthetic-maximum-size-one-combination'),measure(maximum,'synthetic-resource-maximum')]),indent=2,allow_nan=False))
