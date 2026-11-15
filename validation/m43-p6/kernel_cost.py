"""Alternating same-process kernel timings; do not infer solver acceptance."""
from pathlib import Path
import sys,json,time,statistics,os,subprocess
if '--worker' not in sys.argv:
    p=subprocess.run([sys.executable,'-I',__file__,'--worker'],capture_output=True,timeout=20,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    sys.stdout.buffer.write(p.stdout);sys.stderr.buffer.write(p.stderr);sys.exit(p.returncode)
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'engine'))
from local_mixed_worker import memory_limit
limits=memory_limit();sys.path.insert(0,str(ROOT))
import numpy as np
from experiments.m43_p6 import element,material_curvature
element.MATERIAL_CURVATURE=True
args=(np.array([[0.,0.,0.],[2.,0.,0.]]),np.random.default_rng(71).normal(size=12)*1e-4,2e8,2e4,7e4,8e3,np.eye(3))
times={False:[],True:[]}
for round in range(5):
    for mode in ((False,True) if round%2==0 else (True,False)):
        material_curvature.REUSE_RECIPROCALS=mode
        element.element_response(*args)
        started=time.perf_counter()
        for _ in range(25):element.element_response(*args)
        times[mode].append(time.perf_counter()-started)
report=dict(execution=limits,baseline_seconds=times[False],reused_seconds=times[True],median_ratio=statistics.median(times[True])/statistics.median(times[False]),calls_per_sample=25)
path=ROOT/'.tools/m43-p6/directed/kernel-cost.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2));print(json.dumps(report))
