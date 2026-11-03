"""Contract tests for the two Vercel Python API entrypoints.

No platform calls or network access are needed; these test the HTTP adapters.
"""
import importlib.util
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from jpn_structural.service import Handler as WorkerHandler


ROOT = Path(__file__).resolve().parents[1]


def load_handler(name):
    path = ROOT / "api" / (name + ".py")
    spec = importlib.util.spec_from_file_location("jpn_vercel_" + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


@pytest.mark.parametrize("name,internal", [("analyze", "/analyze"), ("analyze3d", "/analyze3d")])
def test_function_blocks_unauthenticated_installations(name, internal, monkeypatch):
    monkeypatch.delenv("JPN_ANALYSIS_TOKEN", raising=False)
    klass = load_handler(name)
    h = object.__new__(klass)
    h.path = "/api/" + name
    h.respond = Mock()
    with patch.object(WorkerHandler, "do_POST", autospec=True) as delegated:
        h.do_POST()
    h.respond.assert_called_once()
    status, body = h.respond.call_args.args
    assert status == 503 and body["error"]["code"] == "CONFIGURATION"
    delegated.assert_not_called()


@pytest.mark.parametrize("name,internal", [("analyze", "/analyze"), ("analyze3d", "/analyze3d")])
def test_function_delegates_to_existing_token_and_limits(name, internal, monkeypatch):
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "local-unit-test-token")
    klass = load_handler(name)
    h = object.__new__(klass)
    h.path = "/api/" + name
    with patch.object(WorkerHandler, "do_POST", autospec=True) as delegated:
        h.do_POST()
    delegated.assert_called_once_with(h)
    assert h.path == internal


@pytest.mark.parametrize("name,mode", [("analyze", "2d"), ("analyze3d", "3d")])
def test_health_is_read_only_and_never_exposes_token(name, mode, monkeypatch):
    monkeypatch.setenv("JPN_ANALYSIS_TOKEN", "never-expose-this-secret")
    klass = load_handler(name)
    h = object.__new__(klass)
    h.respond = Mock()
    h.do_GET()
    h.respond.assert_called_once_with(200, {
        "service": "jpn-experimental-analysis", "mode": mode, "status": "ready",
    })

@pytest.mark.parametrize("name,mode", [("analyze", "2d"), ("analyze3d", "3d")])
def test_health_reports_configuration_required_without_token(name, mode, monkeypatch):
    monkeypatch.delenv("JPN_ANALYSIS_TOKEN", raising=False)
    klass = load_handler(name)
    h = object.__new__(klass)
    h.respond = Mock()
    h.do_GET()
    h.respond.assert_called_once_with(503, {
        "service": "jpn-experimental-analysis", "mode": mode,
        "status": "configuration_required",
    })
