"""Remote purlin HTTP is opt-in, authenticated and physically non-approving."""
import hashlib
import json
import pytest
from .test_purlin import request as purlin_request
from .test_vercel_mixed_http import http, call, request as http_request, server

def _post(body, **kwargs):
    return call(json.dumps(body).encode(), PATH_INFO='/api/analyze-purlin', **kwargs)

def test_remote_gate_and_authentication_precede_worker(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', 'local-integration-token')
    monkeypatch.delenv('JPN_PURLIN_REMOTE_ENABLED', raising=False)
    monkeypatch.setattr(http, '_worker', lambda *_a, **_k: pytest.fail('Unauthorized worker'))
    body = purlin_request()
    assert _post(body)[0] == 404
    monkeypatch.setenv('JPN_PURLIN_REMOTE_ENABLED', '1')
    assert _post(body, HTTP_AUTHORIZATION='')[0] == 401
    assert _post(body, CONTENT_LENGTH='25001')[0] == 413
    assert _post(body, HTTP_X_JPN_JOINT_ACTIONS='1')[0] == 422
    assert _post({**body, 'schema_version':'jpn.mixed3d/1'})[0] == 422
    assert _post({**body, 'request_id':'x'})[0] == 422

def test_real_python_purlin_route_preserves_traceability_and_safety(server,monkeypatch):
    monkeypatch.setenv('JPN_PURLIN_REMOTE_ENABLED', '1')
    data=purlin_request()
    data.update(load_mode='surface', uniform_load_n_m=0, surface_pressure_n_m2=-800,
                tributary_width_m=1.25, load_source='Memorial de carga vertical da obra',
                include_self_weight=True)
    raw=json.dumps(data).encode()
    status,body,headers=http_request(server+'/api/analyze-purlin',raw)
    assert status==200,body
    assert body['schema_version']=='jpn.http-purlin/1'
    assert body['request_sha256']==hashlib.sha256(raw).hexdigest()
    assert body['execution']['memory_limit_bytes']==805306368
    result=body['result']
    assert result['request_id']==data['request_id']
    assert result['computedStructuralApproval'] is False
    assert result['fabricationRelease'] is False
    assert result['results'][0]['declared_line_load_n_m']==pytest.approx(-1000)
    assert result['results'][0]['self_weight_line_load_n_m']<0
    assert result['results'][0]['total_line_load_n_m']<-1000
    assert headers['Cache-Control']=='no-store'
    assert headers.get('Access-Control-Allow-Origin') is None

def test_invalid_worker_results_are_fail_closed(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', 'local-integration-token')
    monkeypatch.setenv('JPN_PURLIN_REMOTE_ENABLED', '1')
    data=purlin_request()
    from jpn_structural.purlin import analyze_purlin
    proper=analyze_purlin(data)
    for change in ({'fabricationRelease':True},
                   {'request_id':'forged-identifier'},
                   {'results':[]},
                   {'computedStructuralApproval':True}):
        result={**proper,**change}
        monkeypatch.setattr(http,'_worker', lambda *a, **kw: {'status':'completed','result':result,'execution':{'memory_limit_bytes':805306368,'memory_kind':'linux-address-space'}})
        status,body=_post(data)
        assert status==503 and body['error']['code']=='INVALID_RESPONSE'

def test_health_post_is_not_a_calculation_endpoint(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', 'local-integration-token')
    assert call(b'{}', PATH_INFO='/health', REQUEST_METHOD='POST')[0] == 405
