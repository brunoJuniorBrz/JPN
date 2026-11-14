"""Exercise the EXISTING section worker with its unchanged OS/time limits.

No engine file is patched; this is an isolated cross-platform integration probe.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
request = dict(schema_version='jpn.section-analysis/1', units='mm',
               geometry=dict(shape='i', height=200, width=100, webThickness=6, flangeThickness=10, insideRadius=0),
               poisson=.3, source='M51 capped I reference, not a building specification', revision='M51-1',
               responsible='Independent analytical validation', convergence=.001)
# Existing original direct method as an OFFLINE reference (never used as an
# application fallback); the actual candidate worker below retains all caps.
sys.path.insert(0, str(ROOT/'engine'))
from jpn_structural.section_analysis import analyze_section
baseline = analyze_section(request)
completed = subprocess.run([sys.executable, '-I', '-X', 'utf8', str(ROOT/'scripts/section-i-worker.py')],
                           input=json.dumps(request), text=True, encoding='utf-8',
                           capture_output=True, timeout=20, cwd=ROOT)
response = json.loads(completed.stdout)
assert completed.returncode == 0 and response['status'] == 'completed', response
assert response['execution']['memory_limit_bytes'] == 768*1024*1024
assert response['result']['convergence']['status'] == 'observed'
p = response['result']['properties']
assert abs(p['areaMm2'] - 3080) <= 1e-7
assert abs(p['iyMm4'] - (2*(100*10**3/12+1000*95**2)+6*180**3/12)) <= 1e-5
assert p['warpingMm6'] > 0 and p['iyMm4'] > p['izMm4']
assert len(baseline['refinements']) == len(response['result']['refinements'])
assert [s['nodes'] for s in baseline['refinements']] == [s['nodes'] for s in response['result']['refinements']]
for key, value in baseline['properties'].items():
    assert math.isclose(value, p[key], rel_tol=1e-8, abs_tol=1e-8), (key, value, p[key])
assert response['result']['approvedForFabrication'] is False
out = ROOT/'.tools/m51-runtime/capped-section.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(dict(request=request, response=response, originalUncappedReference=baseline,
                               bootstrapSha256=hashlib.sha256((ROOT/'scripts/section-i-worker.py').read_bytes()).hexdigest(),
                               workerSha256=hashlib.sha256((ROOT/'engine/section_worker.py').read_bytes()).hexdigest()),
                          indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(status=response['status'], memory=response['execution'], input_sha256=response['result']['input_sha256'])))
