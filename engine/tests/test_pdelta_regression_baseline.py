"""Mandatory drift guard must detect deterioration in each physical category."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("p3_regression", ROOT/"validation/m43-p3/regression.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def evidence():
    return json.loads((ROOT/"validation/m43-p2/evidence.json").read_text(encoding="utf-8"))


def test_recorded_p2_evidence_is_baseline_not_homologation():
    raw = evidence()
    assert raw["comparisons_with_all_bounds_met"] == 2
    assert len(guard.check_regression(raw)) == 8


@pytest.mark.parametrize("field", ["translation_m", "rotation_rad", "reaction_force_n", "reaction_moment_nm",
                                  "member_end_actions", "force_relative_residual", "moment_relative_residual",
                                  "refinement_relative_displacement_error", "refinement_relative_rotation_error",
                                  "refinement_relative_member_end_action_error", "axial_assembly_recovery"])
def test_worsening_known_category_fails_even_with_safety_flags_false(field):
    raw = evidence()
    row = raw["cases"][2]  # uncompressed portal, an intentionally discrepant case
    if field in ("translation_m", "rotation_rad", "reaction_force_n", "reaction_moment_nm"):
        row["checks"]["pdelta"][field]["maximum_absolute_error"] += 1.
    elif field == "member_end_actions":
        row["member_end_comparison"]["maximum_absolute_difference"] += 1.
    elif field == "axial_assembly_recovery":
        row["maximum_assembly_recovery_axial_difference_n"] += 1.
    elif field.startswith("refinement_"):
        row["refinement"][field] += 1.
    else:
        row["full_dead_load_equilibrium"][field][0] += 1.
    with pytest.raises(AssertionError, match="regressed"):
        guard.check_regression(raw)


def test_missing_comparison_is_not_a_success():
    raw = evidence()
    raw["cases"].pop()
    with pytest.raises(AssertionError): guard.check_regression(raw)
