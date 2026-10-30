from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
import json
import threading

import pytest

from jpn_structural.service import Handler, ThreadingHTTPServer
from .cases import triangle


@contextmanager
def running_service():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=3)


def send(port, method, path, body=None, headers=None):
    connection = HTTPConnection("127.0.0.1", port, timeout=25)
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


def test_http_real_solver_and_request_hash(monkeypatch):
    monkeypatch.delenv("JPN_ANALYSIS_TOKEN", raising=False)
    payload = json.dumps(triangle()).encode()
    with running_service() as port:
        status, data = send(port, "POST", "/analyze", payload)
        assert status == 200
        assert data["request_sha256"] == hashlib.sha256(payload).hexdigest()
        assert data["result"]["nodes"]["0"]["ry_n"] == pytest.approx(5000)
        assert data["result"]["members"]["M1"]["axial_n"] < 0
        assert send(port, "GET", "/health")[0] == 200


def test_http_auth_and_model_errors(monkeypatch):
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "local-test-token")
    payload = triangle()
    payload["supports"] = []
    with running_service() as port:
        assert send(port, "POST", "/analyze", b"{}")[0] == 401
        status, data = send(port, "POST", "/analyze", json.dumps(payload), {"Authorization": "Bearer local-test-token"})
        assert status == 422
        assert data["error"]["code"] == "UNSTABLE"
        assert "result" not in data
        assert send(port, "POST", "/missing", b"{}", {"Authorization": "Bearer local-test-token"})[0] == 404


def test_http_rejects_empty_and_malformed_json(monkeypatch):
    monkeypatch.delenv("JPN_ANALYSIS_TOKEN", raising=False)
    with running_service() as port:
        assert send(port, "POST", "/analyze", b"")[0] == 413
        status, data = send(port, "POST", "/analyze", b"not json")
        assert status == 422
        assert data["error"]["code"] == "INVALID_INPUT"
