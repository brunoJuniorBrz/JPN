"""Standalone experiment, same capped worker environment, no HTTP dispatch."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
from local_mixed_worker import memory_limit
limits=memory_limit()
sys.path.insert(0,str(ROOT))
try:
    from experiments.m43_p6.pilot import run
    if '--material-curvature' in sys.argv:
        from experiments.m43_p6 import element
        element.MATERIAL_CURVATURE=True
    raw=sys.stdin.buffer.read(500001)
    if len(raw)>500000: raise ValueError('INPUT_LIMIT')
    result=run(json.loads(raw))
    out=dict(status='diagnostic',execution=limits,diagnostic=result)
except Exception as e:
    out=dict(status='refused',error=dict(code=getattr(e,'code',type(e).__name__),message=str(e)))
body=json.dumps(out,allow_nan=False).encode()
if len(body)>2000000: raise ValueError('OUTPUT_LIMIT')
sys.stdout.buffer.write(body)
sys.exit(0 if out['status']=='diagnostic' else 2)
