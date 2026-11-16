import json
import subprocess
import sys
from pathlib import Path

import pytest

from jpn_structural import optional_extras as extras

WORKER = Path(__file__).resolve().parents[1] / "section_worker.py"
# The memory cap is not under test (it needs a fresh OS job/rlimit); everything else is the real worker.
RUN = ("import sys,runpy;sys.path.insert(0,r'%s');import local_mixed_worker;local_mixed_worker.memory_limit=lambda:{'test':True};"
       "sys.modules['shapely']=None;sys.argv=['section_worker.py'];runpy.run_path(r'%s',run_name='__main__')" % (WORKER.parent, WORKER))


def run_worker(body):
    return subprocess.run([sys.executable, "-c", RUN], input=json.dumps(body).encode(), capture_output=True, timeout=120)


def test_missing_modules_are_detected_without_importing(monkeypatch):
    monkeypatch.setitem(sys.modules, "shapely", None)
    assert "shapely" in extras.missing_sections_modules()
    with pytest.raises(extras.SectionsExtraMissing) as info:
        extras.require_sections_extra("jpn.section-analysis/1")
    assert info.value.code == "SECTIONS_EXTRA_MISSING" and "shapely" in str(info.value) and "jpn-structural[sections]" in str(info.value)


def test_routes_that_do_not_need_the_extra_are_never_blocked(monkeypatch):
    for name in extras.SECTIONS_MODULES:
        monkeypatch.setitem(sys.modules, name, None)
    extras.require_sections_extra("jpn.steel-i-design/1")                      # closed-form I/H design
    extras.require_sections_extra("jpn.section-analysis/1", symmetric_i=True)  # symmetric I section path
    extras.require_sections_extra("jpn.mixed3d/3")


@pytest.mark.parametrize("schema", ["jpn.section-analysis/1", "jpn.verified-coldformed/1", "jpn.verified-coldformed-batch/1"])
def test_worker_refuses_with_a_clear_code_when_the_extra_is_missing(schema):
    done = run_worker({"schema_version": schema})
    assert done.returncode == 2, done.stderr.decode()[-400:]
    out = json.loads(done.stdout.decode())
    assert out["status"] == "error" and out["error"]["code"] == "SECTIONS_EXTRA_MISSING"
    assert "sections" in out["error"]["message"] and "result" not in out


def test_worker_does_not_mislabel_other_failures_as_missing_extra():
    done = run_worker({"schema_version": "jpn.steel-i-design/1"})
    out = json.loads(done.stdout.decode())
    assert out["status"] == "error" and out["error"]["code"] != "SECTIONS_EXTRA_MISSING"
