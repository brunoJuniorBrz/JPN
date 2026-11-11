from copy import deepcopy
import numpy as np
import pytest
from jpn_structural.p4_frame import analyze_p4_frame, validate_request
from jpn_structural.model import AnalysisError
from tests.p4_cases import request
from tests.test_corotational_planar import rehash


@pytest.mark.parametrize("ratio", [0., .1, .2, .4])
def test_four_portals_converge_with_same_limits_and_no_postprocessed_balancing(ratio):
    r = analyze_p4_frame(request("sway", dimension=2, ratio=ratio, horizontal=2000., coarse=6))
    assert r["physical_convergence_verified"]
    assert max(r["comparison"]["C"].values()) < 1e-4
    assert r["candidate"]["node_count"] == 37
    assert r["candidate"]["combinations"]["C"]["equilibrium"]["accepted"]
    assert r["candidate"]["combinations"]["C"]["stability"]["positive_definite"]
    assert "P4_OUT_OF_PLANE_STABILITY_PENDING" in r["blockers"]
    for flag in ("production_enabled", "normative_stability_verified", "computed_structural_approval", "fabrication_release"):
        assert r[flag] is False


def test_spatial_biaxial_cantilever_uses_coupled_six_dofs_and_never_approves():
    r = analyze_p4_frame(request(coarse=2))
    a = r["candidate"]["combinations"]["C"]
    assert a["nodes"]["T0"]["translation_m"][0] != 0
    assert a["nodes"]["T0"]["translation_m"][1] != 0
    assert a["nodes"]["T0"]["rotation_rad"][0] != 0
    assert a["nodes"]["T0"]["rotation_rad"][1] != 0
    assert a["equilibrium"]["accepted"]
    assert len(a["stability"]["generalized_mode"]) == r["candidate"]["node_count"]*6
    assert "P4_SPATIAL_DOMAIN_NOT_VERIFIED" in r["blockers"]
    assert r["production_enabled"] is False
    assert r["fabrication_release"] is False
    for step in a["newton_steps"]:
        assert step["newton_residual_evaluations"] == step["iterations"]+1
        assert step["linear_system_solves"] == 2*step["iterations"]


def test_physical_eccentric_arm_generates_nonzero_torsion_without_applied_nodal_moments():
    raw = request("torsion", ratio=.05, horizontal=200., coarse=1)
    assert all(load[k] == 0 for load in raw["model"]["nodal_loads"] for k in ("mx_nm", "my_nm", "mz_nm"))
    r = analyze_p4_frame(raw)
    members = r["candidate"]["combinations"]["C"]["members"]
    assert max(abs(m["end_actions_local"][3]) for m in members.values()) > 100
    assert r["candidate"]["combinations"]["C"]["equilibrium"]["accepted"]
    assert not r["fabrication_release"]


@pytest.mark.parametrize("change,code", [("moment", "SPATIAL_APPLIED_MOMENT_PENDING"),
    ("partial", "SPATIAL_PARTIAL_ROTATION_SUPPORT_PENDING"), ("roll", "SPATIAL_SECTION_ROLL_PENDING"),
    ("stale", "PDELTA_BINDING"), ("tolerance", "P4_NUMERICS"), ("dimension", "P4_FORMULATION")])
def test_domain_refuses_missing_mechanics_or_changed_binding(change, code):
    raw = request()
    if change == "moment": raw["model"]["nodal_loads"][-1]["mz_nm"] = 1.
    if change == "partial": raw["model"]["supports"][0]["restrained"][3] = False
    if change == "roll": raw["model"]["members"][0]["rotation_deg"] = 10.
    if change == "stale": raw["model"]["materials"][0]["e_pa"] *= .9
    else: rehash(raw)
    if change == "tolerance": raw["numerics"]["equilibrium_relative_tolerance"] = 1e-7
    if change == "dimension": raw["dimensionality"] = 2
    with pytest.raises(AnalysisError) as e: analyze_p4_frame(raw)
    assert e.value.code == code


def test_mechanism_and_real_newton_execution_fault_are_explicit_errors(monkeypatch):
    raw = request()
    raw["model"]["supports"] = []
    rehash(raw)
    with pytest.raises(AnalysisError): analyze_p4_frame(raw)
    import jpn_structural.p4_frame as module
    monkeypatch.setattr(module, "solve", lambda matrix, rhs, **kw: np.zeros_like(rhs))
    with pytest.raises(AnalysisError) as e: analyze_p4_frame(request())
    assert e.value.code == "P4_NONCONVERGENCE"


def test_resource_budget_not_expanded_for_arc_or_spatial_modes():
    with pytest.raises(AnalysisError) as e:
        analyze_p4_frame(request("spatial", coarse=16))
    assert e.value.code == "INPUT_LIMIT"
