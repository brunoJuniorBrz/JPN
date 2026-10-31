import json
import subprocess
import threading
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import pytest
from jpn_structural import service
from .test_frame3d import portal


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN', 'private-test-token')
    host = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
    thread = threading.Thread(target=host.serve_forever, daemon=True); thread.start()
    yield f'http://127.0.0.1:{host.server_port}/analyze3d'
    host.shutdown(); host.server_close(); thread.join()


def post(url, data=None, token='private-test-token', length=None):
    body = json.dumps(data if data is not None else portal(), ensure_ascii=False).encode('utf-8')
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}
    if length is not None: headers['Content-Length'] = str(length)
    request = Request(url, data=body, headers=headers, method='POST')
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def test_real_private_http_and_utf8(server):
    status, body = post(server)
    assert status == 200
    assert body['result']['project']['source'] == portal()['project']['source']
    assert len(body['request_sha256']) == 64
    assert post(server, token='wrong')[0] == 401
    assert post(server, {}, length=500001)[0] == 413
    assert post(server, {})[0] == 422


def test_service_hard_timeout_and_output_limit(server, monkeypatch):
    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired('worker', 20)
    monkeypatch.setattr(service.subprocess, 'run', timeout)
    status, body = post(server)
    assert status == 503 and body['error']['code'] == 'TIMEOUT'
    monkeypatch.setattr(service.subprocess, 'run', lambda *_args, **_kwargs: SimpleNamespace(stdout=b'x' * 2_000_001, returncode=0))
    status, body = post(server)
    assert status == 422 and body['error']['code'] == 'OUTPUT_LIMIT'


def test_shared_service_concurrency_limit(server):
    assert service.slots.acquire(blocking=False)
    assert service.slots.acquire(blocking=False)
    try:
        status, body = post(server)
        assert status == 503 and body['error']['code'] == 'BUSY'
    finally:
        service.slots.release(); service.slots.release()
