"""Guard executable Python output contracts; no numerical/normative changes."""
import ast
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FLAGS = {"computedStructuralApproval", "fabricationRelease", "computed_structural_approval", "fabrication_release", "approved_for_fabrication"}
GATES = {"releaseGate", "release_gate"}


def contracts(source, legacy_initial_stress=False):
    found = []
    for node in ast.walk(ast.parse(source)):
        pairs = []
        if isinstance(node, ast.keyword):
            pairs = [(node.arg, node.value)]
        elif isinstance(node, ast.Dict):
            pairs = [(key.value, value) for key, value in zip(node.keys, node.values) if isinstance(key, ast.Constant)]
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Attribute):
                    pairs.append((target.attr, node.value))
                elif isinstance(target, ast.Subscript) and isinstance(target.slice, ast.Constant):
                    pairs.append((target.slice.value, node.value))
        for field, value in pairs:
            if field in FLAGS | GATES:
                # Historical research CLI uses BLOCKED, not the production gate.
                expected = "BLOCKED" if legacy_initial_stress and field == "release_gate" else "NOT_READY_BLOCKED"
                valid = isinstance(value, ast.Constant) and (value.value is False if field in FLAGS else value.value == expected)
                found.append((field, node.lineno, valid))
    return found


def test_all_python_release_producers_remain_locked():
    manifest = json.loads((ROOT / "tests/safety/python-release-producers.json").read_text())
    production = [p for p in (ROOT / "engine").rglob("*.py") if not {"tests", "section_tests", "__pycache__"}.intersection(p.relative_to(ROOT / "engine").parts)]
    inventory = {p.relative_to(ROOT).as_posix(): contracts(p.read_text(encoding="utf-8"), p == ROOT / "engine/jpn_structural/mixed_initial_stress.py") for p in production}
    invalid = [f"{file}:{line}: {field}" for file, rows in inventory.items() for field, line, valid in rows if not valid]
    assert not invalid, invalid
    for file, fields in manifest.items():
        for field, count in fields.items():
            assert sum(row[0] == field for row in inventory.get(file, [])) >= count, (file, field)


@pytest.mark.parametrize("source", [
    "result=dict(computed_structural_approval=True)",
    "result={'fabricationRelease': True}",
    "result=dict(release_gate='READY')",
    "result.fabrication_release = approved",
    "result['computedStructuralApproval'] = True",
])
def test_guard_detects_release_mutations(source):
    assert any(not valid for _, _, valid in contracts(source))
