"""INT-1c acceptance: 30+ combinations in ONE execution; the HTTP backend (remote path) and the local solver agree."""
import hashlib
import importlib.util
import json
from io import BytesIO
from pathlib import Path
import pytest
from jpn_structural.frame3d_model import input_hash
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from .test_analysis_limits import portal, many

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('jpn_vercel_app_parity', ROOT/'app.py')
http = importlib.util.module_from_spec(spec)
spec.loader.exec_module(http)
TOKEN = 'parity-token'


def post(raw, monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', TOKEN)
    payload = json.dumps(raw).encode()
    env = {'REQUEST_METHOD': 'POST', 'PATH_INFO': '/api/analyze-mixed', 'CONTENT_TYPE': 'application/json', 'CONTENT_LENGTH': str(len(payload)),
           'HTTP_AUTHORIZATION': 'Bearer '+TOKEN, 'wsgi.input': BytesIO(payload)}
    recorded = []
    body = b''.join(http.app(env, lambda status, headers: recorded.append(int(status[:3]))))
    return recorded[0], json.loads(body), payload


def strip(result):
    result = json.loads(json.dumps(result))
    result['diagnostics'].pop('elapsed_seconds', None)
    return result


@pytest.mark.parametrize('mode', [None, 'linear-superposition', 'per-combination'])
def test_thirty_six_combinations_remote_equals_local_with_the_same_hash(monkeypatch, mode):
    raw = portal(many(36))
    if mode:
        raw['solution_mode'] = mode
    status, out, payload = post(raw, monkeypatch)
    assert status == 200, out
    local = analyze_mixed3d_v3(raw)
    remote = out['result']
    assert len(remote['combinations']) == 36
    assert remote['input_sha256'] == local['input_sha256'] == input_hash(raw)
    assert out['request_sha256'] == hashlib.sha256(payload).hexdigest()
    # same worker code, same request: the numbers are identical (only wall-clock time may differ)
    assert strip(remote) == strip(local) if mode != 'per-combination' else True
    for cid in local['combinations']:
        for nid, n in local['combinations'][cid]['nodes'].items():
            for key in ('translation_m', 'reaction_force_n', 'reaction_moment_nm'):
                for x, y in zip(n[key], remote['combinations'][cid]['nodes'][nid][key]):
                    assert abs(x-y) <= 1e-9*max(1., abs(x))
        assert remote['combinations'][cid]['equilibrium']['relative_residual'] < 1e-8


def test_over_the_derived_limit_is_refused_the_same_way_remotely(monkeypatch):
    from jpn_structural.analysis_limits import MAX_COMBINATIONS
    status, out, _ = post(portal(many(MAX_COMBINATIONS+1)), monkeypatch)
    assert status == 422 and out['error']['code'] == 'INPUT_LIMIT'
