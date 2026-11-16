import json

from .test_vercel_mixed_http import ROOT, call, http


def test_engine_git_deploys_main_and_int2_previews():
    config = json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))
    assert config["git"]["deploymentEnabled"] == {
        "**": False, "main": True, "codex/int-2-*": True,
    }
    assert list(config["functions"]) == ["app.py"]


def test_engine_requires_auth_before_route_dispatch(monkeypatch):
    def unexpected_worker(*args, **kwargs):
        raise AssertionError("Authentication and route checks must precede execution")

    monkeypatch.setattr(http, "_worker", unexpected_worker)
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "local-integration-token")
    monkeypatch.delenv("JPN_PURLIN_REMOTE_ENABLED", raising=False)
    for path in ("/", "/health", "/api/analyze-mixed", "/api/analyze-purlin", "/api/unknown"):
        status, body = call(PATH_INFO=path, HTTP_AUTHORIZATION="")
        assert status == 401
        assert body["error"]["code"] == "UNAUTHORIZED"
    assert call(PATH_INFO="/api/unknown")[0] == 404
    assert call(PATH_INFO="/api/analyze-purlin")[0] == 404
