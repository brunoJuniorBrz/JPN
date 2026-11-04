"""One final local regression; Linux/Windows optional profiles and browser CI remain in GitHub."""
import datetime,json,os,platform,subprocess,sys,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'validation/m33a/results'
OUT.mkdir(parents=True,exist_ok=True)
PYTHON=Path(sys.executable);FSM=ROOT/'.tools/sections-fsm/Scripts/python.exe'
env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1',
     'JPN_PYTHON_EXECUTABLE':str(PYTHON),'JPN_SECTION_FSM_PYTHON_EXECUTABLE':str(FSM),'NEXT_TELEMETRY_DISABLED':'1'}
git=os.environ.get('JPN_GIT_EXECUTABLE','git')
sha=subprocess.check_output([git,'rev-parse','HEAD'],cwd=ROOT,text=True).strip()
steps=[
 ('typecheck',['node','node_modules/typescript/bin/tsc','--noEmit']),
 ('lint',['node','node_modules/eslint/bin/eslint.js','.']),
 ('vitest',['node','node_modules/vitest/vitest.mjs','run','--reporter=dot','--reporter=json',f'--outputFile={OUT}/vitest.json']),
 ('core',[PYTHON,'engine/validate.py','--output-dir',OUT/'core']),
 ('dxf',[PYTHON,'tests/verify_dxf.py']),
 ('build',['node','node_modules/next/dist/bin/next','build']),
]
report={'source_sha':sha,'base_sha':'566e068010446c3af8cb4889391ac177dcf752e3',
 'platform':platform.platform(),'python':platform.python_version(),
 'node':subprocess.check_output(['node','--version'],text=True).strip(),
 'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':[],
 'browser_and_optional_profiles':'GitHub CI; not repeated locally in M33A',
 'normative_second_order_verified':False,'approved_for_fabrication':False}
for name,cmd in steps:
 print('START '+name,flush=True);start=time.perf_counter()
 with (OUT/(name+'.log')).open('w',encoding='utf8') as stream:
  result=subprocess.run([str(x) for x in cmd],cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=1800)
 report['steps'].append({'name':name,'command':[str(x).replace(str(ROOT),'${ROOT}') for x in cmd],
  'exit_code':result.returncode,'elapsed_seconds':round(time.perf_counter()-start,3),'log':name+'.log'})
 (OUT/'checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
 print('FINISH '+name+' '+str(result.returncode),flush=True)
 if result.returncode:raise SystemExit(result.returncode)
report.update(all_passed=True,finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
(OUT/'checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
