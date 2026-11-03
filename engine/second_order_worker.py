"""Offline opt-in experiment. Parent must enforce 20 s and 2 MB limits."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from local_mixed_worker import memory_limit


def main():
    try:
        limits = memory_limit()
        if sys.version_info[:2] != (3, 12):
            raise ValueError('Python 3.12 required')
        from jpn_structural.__main__ import _unique_object
        from jpn_structural.frame_pdelta import analyze_frame_pdelta
        body = sys.stdin.buffer.read(500001)
        if len(body) > 500000:
            raise ValueError('INPUT_LIMIT')
        def nonfinite(value):
            raise ValueError('Nonfinite JSON: '+value)
        result = analyze_frame_pdelta(json.loads(body.decode('utf8'), object_pairs_hook=_unique_object, parse_constant=nonfinite))
        out = dict(status='completed', execution=limits, result=result)
        encoded = json.dumps(out, allow_nan=False).encode('utf8')
        if len(encoded) > 2000000:
            raise ValueError('OUTPUT_LIMIT')
        return encoded, 0
    except Exception as exc:
        return json.dumps(dict(status='error', error=dict(code=getattr(exc, 'code', 'PD_UNAVAILABLE'), message=str(exc)[:1000]))).encode('utf8'), 2


if __name__ == '__main__':
    body, code = main()
    sys.stdout.buffer.write(body+b'\n')
    sys.exit(code)
