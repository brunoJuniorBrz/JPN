import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import pytest
from jpn_structural.model import AnalysisError
from jpn_structural.verified_design_batch import analyze_verified_batch
from jpn_structural.coldformed_geometry import analyze_verified_coldformed

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def requests():
    original = json.loads((ROOT / 'docs/validation/coldformed-design/integrated-tension.json').read_text(encoding='utf-8'))['cases'][0]['design_input']
    items = [copy.deepcopy(original) for _ in range(3)]
    for i, item in enumerate(items):
        item['design']['combination_id'] = 'C' + str(i)
        for field in item['design']['fields']:
            field['forces']['nN'] = [x * (i+1) for x in field['forces']['nN']]
    return items


def test_real_geometry_reuse_preserves_independent_per_combination_demands_and_single_result(requests):
    raw = dict(schema_version='jpn.verified-coldformed-batch/1', requests=requests)
    batch = analyze_verified_batch(raw)
    assert batch['geometry_evaluations'] == 1
    assert batch['geometry_reuses'] == 2
    single = analyze_verified_coldformed(requests[0])
    assert batch['results'][0]['input_sha256'] == single['input_sha256']
    assert batch['results'][0]['binding'] == single['binding']
    for cached, fresh in zip(batch['results'][0]['checks'], single['checks']):
        assert (cached['id'], cached['status']) == (fresh['id'], fresh['status'])
        if 'resistance' in fresh:
            assert abs(cached['resistance']-fresh['resistance']) <= 128*math.ulp(fresh['resistance'])
    checks = [next(c for c in r['checks'] if c['id'] == 'tension') for r in batch['results']]
    assert [c['demand'] for c in checks] == [checks[0]['demand']*i for i in (1, 2, 3)]
    assert all(c['resistance'] == checks[0]['resistance'] for c in checks)
    assert len({r['input_sha256'] for r in batch['results']}) == 3
    assert not batch['computed_structural_approval'] and not batch['approved_for_fabrication']


def test_cached_section_never_bypasses_each_members_property_admission(requests):
    invalid = copy.deepcopy(requests)
    invalid[1]['design']['section']['area_m2'] *= 2
    with pytest.raises(AnalysisError, match='area_m2'):
        analyze_verified_batch(dict(schema_version='jpn.verified-coldformed-batch/1', requests=invalid))


def test_real_batch_worker_keeps_existing_time_memory_and_output_guards(requests):
    raw = dict(schema_version='jpn.verified-coldformed-batch/1', requests=requests)
    done = subprocess.run([sys.executable, '-I', '-X', 'utf8', str(ROOT/'engine/section_worker.py')],
                          input=json.dumps(raw).encode(), capture_output=True, timeout=20)
    result = json.loads(done.stdout)
    assert done.returncode == 0, result
    assert result['execution']['memory_limit_bytes'] == 805306368
    assert result['result']['geometry_evaluations'] == 1
    assert result['result']['geometry_reuses'] == 2
    assert len(result['result']['results']) == 3
    assert len(done.stdout) <= 2000000 and len(done.stderr) <= 16000
