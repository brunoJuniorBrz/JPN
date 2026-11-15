"""Optional numerical profile. Same OS cap as the structural worker; no HTTP.

Run with -I. The caller must enforce the existing 20 s and 2 MB limits.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent))
from local_mixed_worker import memory_limit


def main():
    try:
        execution=memory_limit()
        if sys.version_info[:2]!=(3,12):raise RuntimeError('Python 3.12 required')
        from jpn_structural.__main__ import _unique_object
        data=sys.stdin.buffer.read(500001)
        if len(data)>500000:raise ValueError('INPUT_LIMIT')
        def invalid(value):raise ValueError('Nonfinite JSON: '+value)
        raw=json.loads(data.decode('utf8'),object_pairs_hook=_unique_object,parse_constant=invalid)
        if raw.get('schema_version')=='jpn.verified-coldformed-batch/1':
            from jpn_structural.verified_design_batch import analyze_verified_batch
            result=analyze_verified_batch(raw)
        elif raw.get('schema_version')=='jpn.verified-coldformed/1':
            from jpn_structural.coldformed_geometry import analyze_verified_coldformed
            result=analyze_verified_coldformed(raw)
        elif raw.get('schema_version')=='jpn.elastic-strip/1':
            from jpn_structural.elastic_strip import analyze_elastic_strip
            result=analyze_elastic_strip(raw)
        else:
            from jpn_structural.section_analysis import analyze_section
            result=analyze_section(raw)
        return dict(schema_version='jpn.local-section/1',status='completed',execution=execution,result=result)
    except MemoryError:return dict(status='error',error=dict(code='MEMORY_LIMIT',message='Section memory cap reached.'))
    except Exception as e:return dict(status='error',error=dict(code=getattr(e,'code','SECTION_UNAVAILABLE'),message=str(e)[:1000]))


if __name__=='__main__':
    out=main()
    try:
        body=json.dumps(out,allow_nan=False,separators=(',',':')).encode()
        if len(body)>2000000:raise ValueError('OUTPUT_LIMIT')
    except (ValueError,MemoryError):out={'status':'error'};body=b'{"status":"error","error":{"code":"OUTPUT_LIMIT","message":"No representable section result."}}'
    sys.stdout.buffer.write(body+b'\n');sys.exit(2 if out['status']=='error' else 0)
