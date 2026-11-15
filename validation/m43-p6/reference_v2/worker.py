"""Capped independent reference process; imports no candidate mechanics."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'engine'))
from local_mixed_worker import memory_limit
limits=memory_limit()
try:
    raw=sys.stdin.buffer.read(500001)
    if len(raw)>500000:raise ValueError('INPUT_LIMIT')
    request=json.loads(raw)
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    method=request.pop('method')
    if method=='network':
        from network import solve
    elif method=='native':
        from native import solve
    else:raise ValueError('REFERENCE_METHOD')
    result=solve(**request)
    out=dict(status='diagnostic',execution=limits,result=result,input_bytes_sha256=hashlib.sha256(raw).hexdigest())
    out['source_sha256_lf']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest() for p in [Path(__file__).resolve(),Path(__file__).with_name(method if method=='native' else 'network').with_suffix('.py'),ROOT/'engine/local_mixed_worker.py']}
except Exception as e:
    out=dict(status='refused',error=dict(code=type(e).__name__,message=str(e)))
body=json.dumps(out,allow_nan=False).encode()
if len(body)>2000000:raise ValueError('OUTPUT_LIMIT')
sys.stdout.buffer.write(body)
sys.exit(0 if out['status']=='diagnostic' else 2)
