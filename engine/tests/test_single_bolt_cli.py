"""Subprocess test of offline bolt checker, including error exit codes."""
import json
from pathlib import Path
import subprocess
import sys


def launch(tmp_path, payload):
    root = Path(__file__).resolve().parents[1]
    inp = tmp_path / 'input.json'
    inp.write_text(json.dumps(payload), encoding='utf8')
    return subprocess.run([sys.executable,str(root/'check_single_bolt.py'),str(inp)],
                          capture_output=True,text=True,timeout=5)


def sample():
    root=Path(__file__).resolve().parents[1]
    return json.loads((root/'examples'/'single-bolt-14762.json').read_text(encoding='utf8'))


def test_cli_real_pass_with_machine_readable_no_approval(tmp_path):
    r=launch(tmp_path,sample())
    assert r.returncode==0, r.stderr
    data=json.loads(r.stdout)
    assert data['status']=='PASS-ISOLATED-CHECKS-ONLY'
    assert not data['joint_all_limit_states_verified']
    assert not data['fabrication_approved']


def test_cli_real_fail_does_not_return_success(tmp_path):
    model=sample();model['demand']['shear_n']=40000
    r=launch(tmp_path,model)
    assert r.returncode==2
    assert json.loads(r.stdout)['status']=='FAIL-ISOLATED-CHECKS'


def test_cli_rejects_bad_json(tmp_path):
    root=Path(__file__).resolve().parents[1]
    inp=tmp_path/'invalid.json';inp.write_text('{"a":1,"a":2}',encoding='utf8')
    r=subprocess.run([sys.executable,str(root/'check_single_bolt.py'),str(inp)],capture_output=True,text=True,timeout=5)
    assert r.returncode==3
    assert 'Duplicate JSON key' in r.stderr
