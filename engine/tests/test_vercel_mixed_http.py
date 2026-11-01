"""Actual HTTP -> WSGI -> capped Python 3.12 -> real PyNite, plus boundaries."""
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import socketserver
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server
import pytest
from .test_mixed3d import beam_and_axial
from .test_mixed3d_loads import beam, weight
from jpn_structural.frame3d_model import input_hash

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('jpn_vercel_app', ROOT/'app.py')
http = importlib.util.module_from_spec(spec)
spec.loader.exec_module(http)


class Server(socketserver.ThreadingMixIn, WSGIServer):
    daemon_threads = True


class Quiet(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', 'local-integration-token')
    srv = make_server('127.0.0.1', 0, http.app, server_class=Server, handler_class=Quiet)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{srv.server_port}'
    srv.shutdown(); srv.server_close(); thread.join(timeout=2)


def request(url, payload=None, token='local-integration-token'):
    headers = {'Authorization': 'Bearer '+token}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        payload = json.dumps(payload, allow_nan=False).encode() if isinstance(payload, dict) else payload
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read()), response.headers


def call(payload=b'{}', **overrides):
    env = {'REQUEST_METHOD':'POST','PATH_INFO':'/api/analyze-mixed','CONTENT_TYPE':'application/json',
           'CONTENT_LENGTH':str(len(payload)),'HTTP_AUTHORIZATION':'Bearer local-integration-token','wsgi.input':BytesIO(payload)}
    env.update(overrides)
    recorded = []
    body = b''.join(http.app(env, lambda status, headers: recorded.append((int(status[:3]), headers))))
    return recorded[0][0], json.loads(body)


def test_entrypoint_import_from_engine_without_numerical_imports():
    script = "import sys;sys.path.insert(0,sys.argv[1]);import app;assert callable(app.app);assert 'numpy' not in sys.modules;assert 'Pynite' not in sys.modules"
    p = subprocess.run([sys.executable,'-I','-c',script,str(ROOT)],cwd=ROOT,capture_output=True,timeout=5)
    assert p.returncode==0,p.stderr
    import tomllib
    config = tomllib.loads((ROOT/'pyproject.toml').read_text())
    assert config['tool']['vercel']['entrypoint']=='app:app'
    assert config['project']['requires-python']=='>=3.12,<3.13'
    assert 'PyNiteFEA==3.2.1' in config['project']['dependencies']
    assert (ROOT/'.python-version').read_text().strip()=='3.12'
    settings=json.loads((ROOT/'vercel.json').read_text())
    assert settings['framework']=='python' and settings['functions']['app.py']['maxDuration']==30
    assert 'local_mixed_worker.py' not in settings['functions']['app.py']['excludeFiles']


def test_authentication_is_required_for_health_and_analysis_before_body_or_worker(monkeypatch):
    def forbidden(*_args,**_kwargs):
        pytest.fail('Unauthorized request reached a worker')
    monkeypatch.setattr(http,'_worker',forbidden)
    monkeypatch.delenv('JPN_ANALYSIS_TOKEN',raising=False)
    assert call()[0]==503
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN','local-integration-token')
    for path in ('/health','/api/analyze-mixed'):
        status,body=call(HTTP_AUTHORIZATION='',PATH_INFO=path,REQUEST_METHOD='GET' if path=='/health' else 'POST')
        assert status==401 and body['error']['code']=='UNAUTHORIZED'


def test_real_http_health_imports_real_dependencies_under_memory_cap(server):
    status,body,headers=request(server+'/health')
    assert status==200,body
    assert body['dependencies']['python']=='3.12' and body['dependencies']['PyNiteFEA']=='3.2.1'
    assert body['execution']['memory_limit_bytes']==768*1024*1024
    assert body['execution']['isolation']=='subprocess'
    assert 'local_only' not in body['execution']
    assert headers['Cache-Control']=='no-store' and headers.get('Access-Control-Allow-Origin') is None
    assert request(server+'/health',token='wrong')[0]==401


def test_real_http_mixed_v1_matches_independent_closed_form_and_both_hashes(server):
    payload=beam_and_axial();raw=json.dumps(payload).encode()
    status,body,_=request(server+'/api/analyze-mixed',raw)
    assert status==200,body
    result=body['result'];expected=-1000/(3*200e9*1e-5/2**3+200e9*.001)
    assert result['combinations']['LC']['nodes']['B']['translation_m'][2]==pytest.approx(expected,rel=1e-7)
    assert body['request_sha256']==hashlib.sha256(raw).hexdigest()
    assert result['input_sha256']==input_hash(payload)
    assert result['schema_version']=='jpn.mixed3d-result/1'


def test_real_http_mixed_v2_weight_and_udl_match_mass_and_beam_references(server):
    payload=weight(beam());status,body,_=request(server+'/api/analyze-mixed',payload)
    assert status==200,body
    result=body['result'];assert result['schema_version']=='jpn.mixed3d-result/2'
    assert result['loading']['self_weight']['total_mass_kg']==pytest.approx(21)
    w=result['combinations']['WEIGHT'];ei=200e9*1e-5
    assert w['nodes']['B']['translation_m'][2]==pytest.approx(-100*2**4/(8*ei)-5*2**3/(3*ei),rel=1e-8)
    assert sum(n['reaction_force_n'][2] for n in w['nodes'].values())==pytest.approx(210,abs=1e-7)
    assert w['equilibrium']['relative_residual']<1e-8
    assert len(result['combinations']['LC']['members']['BEAM']['stations'])==5
    assert result['input_sha256']==input_hash(payload)


@pytest.mark.parametrize('payload',[b'{"schema_version":"jpn.mixed3d/1","x":1,"x":2}',b'NaN',b'{"a":1e999}',b'{"schema_version":"jpn.frame3d/1"}',b'{}'])
def test_strict_json_and_contracts_are_rejected_without_partial_results(payload,monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN','local-integration-token')
    status,body=call(payload)
    assert status==422 and 'result' not in body


def test_body_limits_and_methods_before_worker(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN','local-integration-token')
    assert call(CONTENT_LENGTH='500001')[0]==413
    assert call(CONTENT_LENGTH='')[0]==411
    assert call(CONTENT_LENGTH='-1')[0]==400
    assert call(CONTENT_LENGTH='3')[0]==400
    assert call(CONTENT_TYPE='text/plain')[0]==415
    assert call(REQUEST_METHOD='GET')[0]==405
    assert call(PATH_INFO='/api/analyze3d')[0]==404


def test_unstable_real_model_is_never_published_as_success(server):
    p=beam_and_axial();p['supports']=[]
    status,body,_=request(server+'/api/analyze-mixed',p)
    assert status==422 and body['error']['code']=='UNSTABLE' and 'result' not in body


def test_capacity_and_failed_cleanup_fail_closed(monkeypatch):
    assert http._slot.acquire(blocking=False)
    try:
        with pytest.raises(http.TransportError) as e:http._worker(b'',True)
        assert e.value.code=='BUSY'
    finally:http._slot.release()
    monkeypatch.setattr(http,'_disabled',True)
    with pytest.raises(http.TransportError) as e:http._worker(b'',True)
    assert e.value.code=='CLEANUP_FAILURE'


@pytest.mark.parametrize('mode',['timeout','stdout','stderr'])
def test_transport_kills_real_process_on_deadline_or_pipe_limit(mode,tmp_path,monkeypatch):
    # A real deliberately stuck process exercises HTTP transport protection;
    # numerical assertions above use the actual capped structural worker.
    script=tmp_path/'stuck.py'
    code="import sys,time\n"
    if mode=='stdout':code+="sys.stdout.write('x'*2000001);sys.stdout.flush()\n"
    if mode=='stderr':code+="sys.stderr.write('x'*16001);sys.stderr.flush()\n"
    code+="time.sleep(60)\n";script.write_text(code)
    monkeypatch.setattr(http,'WORKER',script)
    monkeypatch.setattr(http,'TIMEOUT_SECONDS',1)
    import time
    started=time.monotonic()
    with pytest.raises(http.TransportError) as exc:http._worker(b'')
    assert exc.value.code==('TIMEOUT' if mode=='timeout' else 'OUTPUT_LIMIT')
    assert time.monotonic()-started<5
    assert http._slot.acquire(blocking=False)
    http._slot.release()
