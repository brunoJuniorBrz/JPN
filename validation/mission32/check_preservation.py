"""Source-byte preservation audit against the confirmed handoff base."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

BASE='0d7ebc2729fb4f370a7d99fa7f6f4751d6f12696'
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--git',default='git');p.add_argument('--output',type=Path,required=True);args=p.parse_args()
prefixes=['src/components/','src/lib/exports/','src/domain/calculations/']
specific=['src/domain/models.ts','engine/jpn_structural/solver.py','engine/jpn_structural/model.py',
 'engine/jpn_structural/frame3d.py','engine/jpn_structural/frame3d_model.py','engine/jpn_structural/mixed3d.py',
 'engine/jpn_structural/mixed3d_loads.py','engine/jpn_structural/truss3d.py','engine/jpn_structural/section_analysis.py',
 'src/domain/wind-speed.ts','src/domain/wind-loads.ts','pnpm-lock.yaml']
paths=subprocess.check_output([args.git,'ls-tree','-r','--name-only',BASE],cwd=ROOT,text=True).splitlines()
paths=[p for p in paths if p in specific or (any(p.startswith(prefix) for prefix in prefixes) and not p.endswith('.test.ts')) or (p.startswith('engine/requirements-') and p.endswith('.lock'))]
rows=[]
for path in paths:
 old=subprocess.check_output([args.git,'show',BASE+':'+path],cwd=ROOT).replace(b'\r\n',b'\n')
 new=(ROOT/path).read_bytes().replace(b'\r\n',b'\n')
 rows.append(dict(path=path,base_sha256=hashlib.sha256(old).hexdigest(),current_sha256=hashlib.sha256(new).hexdigest(),unchanged=old==new))
result=dict(initial_sha=BASE,comparison='Exact source bytes after checkout CRLF-to-LF normalization only',
            all_preserved=all(r['unchanged'] for r in rows),files=rows)
args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(dict(files=len(rows),all_preserved=result['all_preserved'])))
raise SystemExit(0 if result['all_preserved'] else 1)
