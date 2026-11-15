from .test_mixed3d_second_order_int3c import cantilever
from .test_vercel_mixed_http import call, http
from jpn_structural.frame3d_model import input_hash
import json


def test_queued_profile_preserves_full_input_and_solver_flags(monkeypatch):
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "local-integration-token")
    raw = cantilever(30., 10_000.)
    payload = json.dumps(raw).encode()
    status, expected = call(payload)
    assert status == 200
    status, queued = call(payload, HTTP_X_JPN_EXECUTION_PROFILE="queued")
    assert status == 200
    result = queued["result"]
    assert queued["request_sha256"] == expected["request_sha256"]
    assert result["input_sha256"] == input_hash(raw) == expected["result"]["input_sha256"]
    assert result["combinations"] == expected["result"]["combinations"]
    assert result["computedStructuralApproval"] is result["fabricationRelease"] is False
    assert result["releaseGate"] == "NOT_READY_BLOCKED"
    assert queued["execution"]["timeout_seconds"] == http.QUEUED_SECONDS
    assert expected["execution"]["timeout_seconds"] == http.TIMEOUT_SECONDS


def test_queued_profile_requires_bearer_and_rejects_unknown_profile(monkeypatch):
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "local-integration-token")
    assert call(HTTP_X_JPN_EXECUTION_PROFILE="queued", HTTP_AUTHORIZATION="")[0] == 401
    assert call(HTTP_X_JPN_EXECUTION_PROFILE="arbitrary")[0] == 422
    assert call(REQUEST_METHOD="GET", PATH_INFO="/health", HTTP_X_JPN_EXECUTION_PROFILE="queued")[0] == 422
