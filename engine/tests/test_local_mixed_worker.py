"""Actual protected processes: no mock substitutes for numerical execution."""
import json
import os
from pathlib import Path
import subprocess
import sys
import pytest
from .test_mixed3d import beam_and_axial

SCRIPT = Path(__file__).parents[1] / 'local_mixed_worker.py'
ENV = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}


def run(payload=b'', *args):
    p = subprocess.run([sys.executable, '-I', '-X', 'utf8', str(SCRIPT), *args], input=payload, capture_output=True, timeout=20, env=ENV)
    return p, json.loads(p.stdout)


def test_os_memory_cap_is_effectively_enforced_before_engine_import():
    p, out = run(b'', '--memory-self-test')
    assert p.returncode == 0, out
    assert out['status'] == 'memory_limit_verified'
    assert out['execution']['memory_limit_bytes'] == 768 * 1024 * 1024
    assert not p.stderr


def test_health_imports_actual_dependencies_under_the_cap():
    p, out = run(b'', '--health')
    assert p.returncode == 0, out
    assert out['dependencies']['PyNiteFEA'] == '3.2.1'
    assert out['dependencies']['python'] == '3.12'


def test_protected_real_numerical_process_matches_independent_parallel_formula():
    p, out = run(json.dumps(beam_and_axial()).encode())
    assert p.returncode == 0, out
    result = out['result']['combinations']['LC']; expected = -1000 / (3 * 200e9 * 1e-5 / 2**3 + 200e9 * .001)
    assert result['nodes']['B']['translation_m'][2] == pytest.approx(expected, rel=1e-7)
    assert result['equilibrium']['relative_residual'] < 1e-8


@pytest.mark.parametrize('payload', [b'{"x":1,"x":2}', b'NaN', b' ' * 500001])
def test_invalid_and_oversized_payloads_have_no_partial_result(payload):
    p, out = run(payload)
    assert p.returncode == 2
    assert out['status'] == 'error' and 'result' not in out


def test_real_jpn_mixed_roof_and_unstable_alternative_stay_distinct():
    folder = SCRIPT.parent / 'examples'
    p, out = run((folder / 'mixed-adapted-roof.json').read_bytes())
    assert p.returncode == 0, out
    assert len(out['result']['combinations']['TESTE-1']['members']) == 243
    p, out = run((folder / 'mixed-incomplete-all-webs-axial.json').read_bytes())
    assert p.returncode == 2
    assert out['error']['code'] == 'UNSTABLE' and 'result' not in out
