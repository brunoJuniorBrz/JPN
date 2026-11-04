"""Offline launcher; the mixed experiment is never exposed as HTTP/UI design."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--output',type=Path)
    args=p.parse_args()
    try:
        if args.input.stat().st_size>500000:raise ValueError('INPUT_LIMIT')
        with args.input.open('rb') as source:body=source.read(500001)
        if len(body)>500000:raise ValueError('INPUT_LIMIT')
        if json.loads(body).get('schema_version')!='jpn.mixed-initial-stress/1':raise ValueError('UNSUPPORTED_MODEL')
        process=subprocess.Popen([sys.executable,'-I','-X','utf8',str(Path(__file__).with_name('second_order_worker.py'))],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
        try:result,_=process.communicate(body,timeout=20)
        except subprocess.TimeoutExpired:
            if sys.platform=='win32':
                subprocess.run(['taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True,timeout=2)
            process.kill();process.communicate(timeout=1.5)
            raise ValueError('TIMEOUT: worker tree terminated after 20 seconds')
        if len(result)>2000000:raise ValueError('OUTPUT_LIMIT')
        parsed=json.loads(result)
        if process.returncode or parsed.get('status')!='completed':
            print(json.dumps(parsed));return 2
        if args.output:args.output.write_text(json.dumps(parsed,indent=2,allow_nan=False)+'\n',encoding='utf8')
        print(json.dumps(parsed,allow_nan=False));return 0
    except (ValueError,OSError,AttributeError,subprocess.SubprocessError) as exc:
        print(json.dumps(dict(status='error',error=dict(code='SECOND_ORDER_UNAVAILABLE',message=str(exc)[:1000]))));return 2


if __name__=='__main__':sys.exit(main())
