"""Offline bounded launcher for the opt-in straight-frame P-Delta experiment."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('input',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    try:
        if args.input.stat().st_size>500000:
            raise ValueError('INPUT_LIMIT')
        process=subprocess.Popen([sys.executable,'-I','-X','utf8',str(Path(__file__).with_name('second_order_worker.py'))],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
        try:
            body,_=process.communicate(args.input.read_bytes(),timeout=20)
        except subprocess.TimeoutExpired:
            if sys.platform=='win32':
                subprocess.run(['taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True,timeout=2)
            process.kill()
            raise ValueError('TIMEOUT: worker tree terminated after 20 seconds')
        if len(body)>2000000:
            raise ValueError('OUTPUT_LIMIT')
        result=json.loads(body)
        if result.get('status')!='completed' or process.returncode:
            print(json.dumps(result));return 2
        if args.output:
            args.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf8')
        print(json.dumps(result,allow_nan=False))
        return 0
    except (ValueError,OSError,subprocess.SubprocessError) as exc:
        print(json.dumps(dict(status='error',error=dict(code='PD_UNAVAILABLE',message=str(exc)[:1000]))))
        return 2


if __name__=='__main__':
    sys.exit(main())
