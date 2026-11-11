"""Independent mechanical identities, analytic limit and fail-closed domain."""
from copy import deepcopy
import math

import numpy as np
import pytest

from jpn_structural.corotational_planar import (
    element_response, analyze_corotational_planar, run_mesh, validate_request, assemble, audit_tangent,
)
from jpn_structural.frame3d_model import input_hash
from jpn_structural.model import AnalysisError
from tests.test_second_order_frame import request as p2_request
from tests.second_order_cases import frame_case, CANTILEVER_PCR


def request(kind="cantilever", ratio=.2, horizontal=2000., coarse=32):
    raw = p2_request(kind, compression_ratio=ratio, horizontal_n=horizontal, coarse=coarse)
    raw.update(schema_version="jpn.second-order-frame/2", analysis_type="experimental-corotational-xz-diagnostic")
    raw["numerics"].pop("max_tc_iterations")
    raw["numerics"].update(load_steps=10, max_newton_iterations=30,
                          displacement_increment_tolerance=1e-10, force_change_tolerance=1e-8)
    return raw


def rehash(raw):
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    return raw


@pytest.mark.parametrize("angle", [-1.1, 0., .7, 2.2])
def test_rigid_motion_objectivity_and_zero_strain_energy(angle):
    x = np.array([[1., 2.], [4., 6.]])
    r = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
    deformed = x@r.T+np.array([7., -3.])
    q = np.array([*(deformed[0]-x[0]), angle, *(deformed[1]-x[1]), angle])
    row = element_response(x, q, 4e9, 4e6)
    assert np.max(abs(row["basic_deformation"])) < 4e-15
    assert row["energy"] < 1e-20


def test_work_virtual_gradient_tangent_symmetry_and_differentiation():
    x = np.array([[0., 0.], [3., 4.]])
    q = np.array([.002, -.003, .001, -.004, -.006, -.002])
    delta = np.array([.4, -.7, .2, -.8, .5, -.3])
    row = element_response(x, q, 4e9, 4e6)
    for h in (1e-6, 1e-7):
        plus = element_response(x, q+h*delta, 4e9, 4e6)
        minus = element_response(x, q-h*delta, 4e9, 4e6)
        derivative = (plus["energy"]-minus["energy"])/(2*h)
        assert derivative == pytest.approx(row["force"]@delta, rel=2e-8)
        df = (plus["force"]-minus["force"])/(2*h)
        np.testing.assert_allclose(df, row["tangent"]@delta, rtol=2e-8, atol=1e-3)
    np.testing.assert_allclose(row["tangent"], row["tangent"].T, rtol=1e-14, atol=1e-7)
    np.testing.assert_allclose(row["material"]+row["geometric"], row["tangent"], atol=0)
    # Full physical member equilibrium in the displaced geometry, including
    # H*uz and all endpoint moment/force terms, follows from objectivity.
    a, b = x[0]+q[:2], x[1]+q[3:5]
    f = row["force"]
    assert abs(f[0]+f[3])+abs(f[1]+f[4]) < 1e-8
    assert abs(a[0]*f[1]-a[1]*f[0]+f[2]+b[0]*f[4]-b[1]*f[3]+f[5]) < 1e-7


@pytest.mark.parametrize("horizontal", [-2000., 2000.])
def test_cantilever_consistent_forces_deformed_equilibrium_refinement_and_safety(horizontal):
    result = analyze_corotational_planar(request(horizontal=horizontal))
    answer = result["candidate"]["combinations"]["C"]
    assert result["physical_convergence_verified"] is True
    assert answer["equilibrium"]["accepted"] is True
    assert max(answer["equilibrium"]["moment_relative_residual"]) < 1e-8
    assert 0 < math.copysign(1, horizontal)*answer["nodes"]["T0"]["translation_m"][0] < .02
    assert len(answer["newton_steps"]) == 10
    for step in answer["newton_steps"]:
        assert 1 <= step["iterations"] < 30
        assert step["newton_residual_evaluations"] == step["iterations"]+1
        assert step["scaled_displacement_increment"] <= 1e-10
        assert step["scaled_internal_force_change"] <= 1e-8
        assert step["algebraic_relative_residual"] <= 1e-8
    for member in answer["members"].values():
        assert member["geometric_axial_n"] == member["axial_n"] == member["basic_force"][0]
    for flag in ("production_enabled", "normative_stability_verified", "computed_structural_approval", "fabrication_release"):
        assert result[flag] is False
    assert result["release_gate"] == "NOT_READY_BLOCKED"


def test_linear_analytic_limit_and_mesh_improvement():
    data = validate_request(request(ratio=0., horizontal=.02, coarse=16))
    answer = run_mesh(data, 32)["combinations"]["C"]
    # Independent Euler-Bernoulli cantilever limit HL^3/(3EI).
    assert answer["nodes"]["T0"]["translation_m"][0] == pytest.approx(.02*4**3/(3*200e9*2e-5), rel=1e-9)
    data = validate_request(request(coarse=16))
    tips = [run_mesh(data, n)["combinations"]["C"]["nodes"]["T0"]["translation_m"][0] for n in (8, 16, 32)]
    assert abs(tips[2]-tips[1]) < .3*abs(tips[1]-tips[0])


def test_planar_portal_unconverged_actions_remain_explicitly_blocked():
    result = analyze_corotational_planar(request("sway", ratio=0., coarse=16))
    assert result["candidate"]["combinations"]["C"]["physical_equilibrium_verified"]
    assert not result["physical_convergence_verified"]
    assert "COROTATIONAL_REFINEMENT_NOT_CONVERGED:C" in result["blockers"]


@pytest.mark.parametrize("ratio", [.6, .95, 1.01])
def test_compression_limit_is_a_refusal_even_if_finite_native_vector_exists(ratio):
    with pytest.raises(AnalysisError, match="margem|positividade") as error:
        analyze_corotational_planar(request(ratio=ratio, coarse=8))
    assert error.value.code in ("COROTATIONAL_DOMAIN_MARGIN", "COROTATIONAL_INSTABILITY")


@pytest.mark.parametrize("change,code", [
    ("spatial", "COROTATIONAL_SPATIAL_PENDING"), ("load", "COROTATIONAL_SPATIAL_PENDING"),
    ("roll", "COROTATIONAL_SECTION_ROLL_PENDING"), ("release", "PDELTA_RELEASE_PENDING"),
    ("axial", "PDELTA_AXIAL_KG_UNSUPPORTED"), ("stale", "PDELTA_BINDING"),
    ("tolerance", "COROTATIONAL_NUMERICS"), ("schema", "COROTATIONAL_CONTRACT"),
])
def test_explicit_domain_and_hash_refusals(change, code):
    raw = request(coarse=8)
    if change == "spatial": raw["model"]["nodes"][-1]["y_m"] = 1.
    if change == "load": raw["model"]["nodal_loads"][-1]["fy_n"] = 1.
    if change == "roll": raw["model"]["members"][0]["rotation_deg"] = 5.
    if change == "release": raw["model"]["members"][0]["release_end"][4] = True
    if change == "axial":
        m = raw["model"]["members"][0]
        raw["model"]["members"][0] = dict(id=m["id"], start=m["start"], end=m["end"], kind="axial",
                                          e_pa=200e9, area_m2=.02, source="explicit test", revision="1")
        raw["model"]["supports"][0]["restrained"][3:] = [False]*3
    if change == "stale": raw["model"]["materials"][0]["e_pa"] *= .99
    else: rehash(raw)
    if change == "tolerance": raw["numerics"]["equilibrium_relative_tolerance"] *= 10
    if change == "schema": raw["schema_version"] = "jpn.second-order-frame/1"
    with pytest.raises(AnalysisError) as error:
        analyze_corotational_planar(raw)
    assert error.value.code == code


def test_mechanism_and_nonconvergence_are_not_results(monkeypatch):
    raw = request(coarse=8)
    raw["model"]["supports"] = []
    rehash(raw)
    with pytest.raises(AnalysisError): analyze_corotational_planar(raw)
    import jpn_structural.corotational_planar as module
    data = validate_request(request(coarse=8))
    monkeypatch.setattr(module, "MAX_ITER", 1)
    with pytest.raises(AnalysisError) as error:
        run_mesh(data, 16)
    assert error.value.code == "COROTATIONAL_NONCONVERGENCE"


def test_nonfinite_state_is_rejected():
    with pytest.raises(AnalysisError) as error:
        element_response(np.array([[0., 0.], [1., 0.]]), np.full(6, math.nan), 4e9, 4e6)
    assert error.value.code == "COROTATIONAL_NONFINITE"


def test_physical_compressed_cantilever_tangent_loses_positivity_above_euler_load():
    # Direct energy tangent test, bypassing ONLY the earlier 0.6 pilot-domain
    # refusal. No result/API is enabled. The actual sampled tangent must detect
    # a negative mode even though its entries and the imposed state are finite.
    count = 32
    x = np.array([[0., 4*i/count] for i in range(count+1)])
    elements = [(np.arange(3*i, 3*i+6), x[[i, i+1]], 200e9*.02, 200e9*2e-5) for i in range(count)]
    free = np.arange(3, 3*(count+1))
    initial = assemble(x, elements, np.zeros(3*(count+1)))[1]
    for ratio in (.95, 1.01):
        q = np.zeros(3*(count+1))
        q[1::3] = -ratio*CANTILEVER_PCR*x[:, 1]/(200e9*.02)
        tangent = assemble(x, elements, q)[1]
        assert np.isfinite(tangent).all()
        if ratio < 1:
            minimum, _, _ = audit_tangent(tangent, free, initial, margin=False)
            assert 0 < minimum < .1
        else:
            with pytest.raises(AnalysisError) as error:
                audit_tangent(tangent, free, initial, margin=False)
            assert error.value.code == "COROTATIONAL_INSTABILITY"
