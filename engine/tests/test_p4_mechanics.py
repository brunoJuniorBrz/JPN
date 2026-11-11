"""Energy identities independent of any displacement-reference fitting."""
import math
import time
import numpy as np
import pytest
from scipy.spatial.transform import Rotation

from jpn_structural.hermite_arc import element_response as arc_element
from jpn_structural.spatial_corotational import element_response, exponential, multiply, rotate, left_jacobian
from jpn_structural.model import AnalysisError

X = np.array([[0., 0., 0.], [0., 0., 4.]])
BASIS = np.array([[0., 0., 1.], [0., 1., 0.], [-1., 0., 0.]])
PROPS = (4e9, 4e6, 7e6, 1.3e6)


def response(q, **kwargs):
    return element_response(X, q, *PROPS, BASIS, **kwargs)


def test_planar_arc_gradient_hessian_and_work():
    x = np.array([[0., 0.], [3., 4.]])
    q = np.array([.002, -.003, .001, -.004, -.006, -.002])
    direction = np.array([.4, -.7, .2, -.8, .5, -.3])
    row = arc_element(x, q, 4e9, 4e6)
    for h in (1e-6, 1e-7):
        a, b = [arc_element(x, q+s*h*direction, 4e9, 4e6) for s in (1, -1)]
        assert (a["energy"]-b["energy"])/(2*h) == pytest.approx(row["force"]@direction, rel=3e-8)
        np.testing.assert_allclose((a["force"]-b["force"])/(2*h), row["tangent"]@direction, rtol=3e-8, atol=1e-3)
    np.testing.assert_allclose(row["tangent"], row["tangent"].T, rtol=1e-14, atol=1e-6)


def test_so3_composition_matches_independent_rotation_library_and_does_not_commute():
    a, b = [.2, -.1, .15], [-.12, .3, .05]
    ab, ba = multiply(exponential(a), exponential(b)), multiply(exponential(b), exponential(a))
    expected = Rotation.from_rotvec(a)*Rotation.from_rotvec(b)
    for axis in np.eye(3):
        np.testing.assert_allclose(rotate(ab, axis), expected.apply(axis), atol=1e-14)
    assert np.linalg.norm(np.array(ab)-ba) > .01


def test_spatial_energy_gradient_hessian_and_conservative_symmetry():
    q = np.array([.001, -.002, .003, .001, .002, -.001, -.002, .003, -.004, .002, -.001, .003])
    direction = np.array([.4, -.2, .3, -.1, .2, -.3, -.2, .4, -.3, .2, .1, -.4])
    row = response(q)
    for h in (1e-6, 2e-7):
        a, b = [response(q+s*h*direction) for s in (1, -1)]
        assert (a["energy"]-b["energy"])/(2*h) == pytest.approx(row["force"]@direction, rel=1e-7)
        np.testing.assert_allclose((a["force"]-b["force"])/(2*h), row["tangent"]@direction, rtol=2e-6, atol=.05)
    np.testing.assert_allclose(row["tangent"], row["tangent"].T, rtol=1e-13, atol=1e-5)


def test_objectivity_energy_spatial_wrenches_and_deformed_six_resultants():
    q = np.array([.001, -.002, .003, .001, .002, -.001, -.002, .003, -.004, .002, -.001, .003])
    a = response(q)
    rigid = Rotation.from_rotvec([.8, -.6, .4])
    deformed = X+q.reshape(2, 6)[:, :3]
    changed = q.reshape(2, 6).copy()
    changed[:, :3] = rigid.apply(deformed)+[2., -1., .5]-X
    for i in range(2):
        changed[i, 3:] = (rigid*Rotation.from_rotvec(q.reshape(2, 6)[i, 3:])).as_rotvec()
    b = response(changed.ravel())
    assert b["energy"] == pytest.approx(a["energy"], rel=1e-10, abs=1e-8)
    for start in range(0, 12, 3):
        np.testing.assert_allclose(b["physical_end_actions"][start:start+3],
                                   rigid.apply(a["physical_end_actions"][start:start+3]), rtol=1e-8, atol=1e-5)
    f = a["physical_end_actions"].reshape(2, 6)
    np.testing.assert_allclose(f[:, :3].sum(axis=0), 0., atol=1e-6)
    np.testing.assert_allclose(sum(np.cross(deformed[i], f[i, :3])+f[i, 3:] for i in range(2)), 0., atol=1e-6)


def test_physical_moment_is_conjugate_to_spatial_increment_not_rotation_vector_addition():
    q = np.zeros(12)
    q[3:6] = [.006, -.008, .004]
    q[9:12] = [.01, .003, -.007]
    row = response(q)
    variation = np.array([.3, -.2, .4])
    h = 1e-7
    energies = []
    for sign in (1, -1):
        moved = q.copy()
        moved[9:12] = (Rotation.from_rotvec(sign*h*variation)*Rotation.from_rotvec(q[9:12])).as_rotvec()
        energies.append(response(moved)["energy"])
    assert (energies[0]-energies[1])/(2*h) == pytest.approx(row["physical_end_actions"][9:12]@variation, rel=2e-7)
    assert np.linalg.norm(row["force"][9:12]-row["physical_end_actions"][9:12]) > 1e-3


@pytest.mark.parametrize("end", [[0., 0., 4.], [2., 3., 4.], [0., -4., 0.]])
def test_spatial_linear_tangent_matches_existing_audited_frame(end):
    from tests.second_order_cases import frame_case
    from jpn_structural.mixed3d import build_mixed_model, audit_elastic_model
    raw = frame_case("cantilever", 1)
    raw["sections"][0]["iz_m4"] = 3.5e-5
    raw["sections"][0]["j_m4"] = 1.69e-5
    raw["nodes"][1].update(x_m=end[0], y_m=end[1], z_m=end[2])
    _, _, frames, supports, model, _ = build_mixed_model(raw)
    audit_elastic_model(model, raw, frames, supports)
    m = next(iter(model.members["C0-S0"].sub_members.values()))
    basis = m.T()[:3, :3]
    sec, mat = raw["sections"][0], raw["materials"][0]
    row = element_response(np.array([[0., 0., 0.], end]), np.zeros(12), mat["e_pa"]*sec["area_m2"], mat["e_pa"]*sec["iy_m4"],
                           mat["e_pa"]*sec["iz_m4"], mat["g_pa"]*sec["j_m4"], basis)
    np.testing.assert_allclose(row["tangent"], m.Ke(), rtol=1e-12, atol=1e-6)
    assert max(abs(row["force"])) < 1e-6


def test_full_spatial_weak_axis_mode_and_loss_of_positivity():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[2]/"validation/m43-p4/stability_study.py"
    spec = importlib.util.spec_from_file_location("p4_stability_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = module.study()
    assert len(rows) == 9
    for row in rows:
        assert row["positive_definite"] == (row["compression_ratio_of_declared_weak_axis_euler"] < 1)
        assert row["maximum_mode_translation_xyz"][1] > .99
        assert row["force_equilibrium_relative_residual"] < 1e-8
        assert row["eigenpair_relative_residual"] < 1e-8
        assert not row["production_enabled"]


@pytest.mark.parametrize("r", [[math.pi-.01, 0., 0.], [math.nan, 0., 0.]])
def test_rotation_branch_and_nonfinite_are_explicit_refusals(r):
    q = np.zeros(12)
    q[9:12] = r
    with pytest.raises(AnalysisError): response(q)


def test_spatial_kernel_reduces_to_same_planar_arc_energy_and_forces():
    q2 = np.array([.001, -.002, .002, -.004, .003, -.001])
    q3 = np.array([q2[0], 0., q2[1], 0., -q2[2], 0., q2[3], 0., q2[4], 0., -q2[5], 0.])
    a = arc_element(X[:, [0, 2]], q2, PROPS[0], PROPS[1])
    b = response(q3)
    assert b["energy"] == pytest.approx(a["energy"], rel=1e-11)
    np.testing.assert_allclose(b["force"][[0, 2, 4, 6, 8, 10]]*np.array([1, 1, -1, 1, 1, -1]), a["force"], atol=1e-6)
