"""Physical identities and independent continuous-reference checks for P5."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest
from scipy.spatial.transform import Rotation

from jpn_structural.spatial_corotational import element_response, left_jacobian
from tests.test_p4_mechanics import X, BASIS, PROPS
from tests.p4_cases import request

VALIDATION = Path(__file__).resolve().parents[2]/"validation/m43-p5"
spec = importlib.util.spec_from_file_location("p5_physical", VALIDATION/"physical_comparison.py")
physical = importlib.util.module_from_spec(spec)
spec.loader.exec_module(physical)
spec = importlib.util.spec_from_file_location("p5_continuous", VALIDATION/"kirchhoff_chain.py")
rod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rod)

Q = np.array([.001, -.002, .003, .001, .002, -.001, -.002, .003, -.004, .002, -.001, .003])


@pytest.mark.parametrize("amplitude", [0., 1e-7, 1.])
def test_all_twelve_energy_derivatives_and_hessian_columns(amplitude):
    q = Q*amplitude
    answer = element_response(X, q, *PROPS, BASIS)
    for j in range(12):
        # Four-point energy derivative avoids subtracting O(1e4 J) values
        # at an unnecessarily tiny step for an O(10 Nm) component.
        h = 1e-6
        delta = np.eye(12)[j]*h
        a, b = [element_response(X, q+s*delta, *PROPS, BASIS) for s in (1, -1)]
        c, d = [element_response(X, q+s*2*delta, *PROPS, BASIS) for s in (1, -1)]
        derivative = (8*(a["energy"]-b["energy"])-(c["energy"]-d["energy"]))/12/h
        assert derivative == pytest.approx(answer["force"][j], rel=3e-7, abs=2e-5)
        np.testing.assert_allclose((a["force"]-b["force"])/2/h, answer["tangent"][:, j], rtol=2e-6, atol=.03)
    np.testing.assert_allclose(answer["tangent"], answer["tangent"].T, atol=1e-6, rtol=1e-13)


@pytest.mark.parametrize("factor", [.1, 10.])
def test_dimensional_similarity_does_not_hide_translation_moment_units(factor):
    a = element_response(X, Q, *PROPS, BASIS)
    q = Q.reshape(2, 6).copy()
    q[:, :3] *= factor
    ea, eiy, eiz, gj = PROPS
    b = element_response(X*factor, q.ravel(), ea*factor**2, eiy*factor**4, eiz*factor**4, gj*factor**4, BASIS)
    assert b["energy"] == pytest.approx(a["energy"]*factor**3, rel=1e-11)
    expected = a["physical_end_actions"].reshape(2, 6)*np.array([factor**2]*3+[factor**3]*3)
    np.testing.assert_allclose(b["physical_end_actions"].reshape(2, 6), expected, rtol=1e-10, atol=1e-5)


@pytest.mark.parametrize("axis", [[.7, -.5, .3], [-1.3, .2, .4], [1e-9, -2e-9, 3e-9]])
def test_superposed_noncommuting_rigid_motion_preserves_energy_and_all_wrenches(axis):
    a = element_response(X, Q, *PROPS, BASIS)
    rigid = Rotation.from_rotvec(axis)
    q = Q.reshape(2, 6).copy()
    positions = X+q[:, :3]
    q[:, :3] = rigid.apply(positions)+[7., -3., 2.]-X
    for i in range(2):
        q[i, 3:] = (rigid*Rotation.from_rotvec(Q.reshape(2, 6)[i, 3:])).as_rotvec()
    b = element_response(X, q.ravel(), *PROPS, BASIS)
    assert b["energy"] == pytest.approx(a["energy"], rel=2e-10, abs=1e-7)
    np.testing.assert_allclose(b["physical_end_actions"].reshape(4, 3), rigid.apply(a["physical_end_actions"].reshape(4, 3)), rtol=2e-8, atol=1e-5)


@pytest.mark.parametrize("rotation", [[0., 0., 0.], [1e-10, -2e-10, 3e-10], [.01, -.008, .006]])
def test_left_jacobian_matches_actual_left_orientation_increment(rotation):
    r, dr = np.array(rotation), np.array([.4, -.3, .2])
    h = 1e-7
    actual = (Rotation.from_rotvec(r+h*dr)*Rotation.from_rotvec(r-h*dr).inv()).as_rotvec()/(2*h)
    np.testing.assert_allclose(actual, left_jacobian(r)@dr, rtol=2e-9, atol=2e-10)


def test_zero_state_has_six_rigid_modes_without_artificial_stiffness():
    k = element_response(X, np.zeros(12), *PROPS, BASIS)["tangent"]
    scale = np.sqrt(np.diag(k))
    eigenvalues = np.linalg.eigvalsh(k/scale[:, None]/scale[None, :])
    assert np.count_nonzero(abs(eigenvalues) < 1e-12) == 6
    assert np.min(eigenvalues) > -1e-12
    assert np.count_nonzero(eigenvalues > 1e-8) == 6


def test_physical_orientation_is_invariant_to_global_basis_and_ignores_parameter_path():
    a = Rotation.from_rotvec([.01, -.02, .03])
    b = Rotation.from_rotvec([2e-7, -1e-7, 3e-7])*a
    c = Rotation.from_rotvec([.7, -.9, .6])
    first = physical.compare_orientation(a.as_matrix(), b.as_matrix())
    second = physical.compare_orientation((c*a*c.inv()).as_matrix(), (c*b*c.inv()).as_matrix())
    assert first["geodesic_error_rad"] == pytest.approx(second["geodesic_error_rad"], rel=2e-7, abs=1e-16)
    assert first["bounds_met"] == second["bounds_met"]
    # Noncommuting actual spins cannot be interpreted as an additive total vector.
    spins = [np.array([.01, 0., 0.]), np.array([0., .02, 0.])]
    actual = Rotation.from_rotvec(spins[1])*Rotation.from_rotvec(spins[0])
    assert physical.compare_orientation(actual.as_matrix(), Rotation.from_rotvec(sum(spins)).as_matrix())["geodesic_error_rad"] > 9e-5


@pytest.mark.parametrize("value", [np.zeros((3, 3)), np.diag([-1., 1., 1.]), np.full((3, 3), np.nan)])
def test_orientation_audit_refuses_nonphysical_matrices(value):
    with pytest.raises(ValueError): physical.compare_orientation(value, np.eye(3))


def test_near_zero_components_use_dimensional_absolute_bounds_and_uncertainty():
    assert physical.compare([0.], [9e-11], "translation_m")["bounds_met"]
    assert not physical.compare([0.], [11e-11], "translation_m")["bounds_met"]
    assert not physical.compare([0.], [9e-11], "translation_m", 2e-11)["bounds_met"]
    assert not physical.compare([0.], [1.1e-5], "reaction_moment_nm")["bounds_met"]
    with pytest.raises(ValueError): physical.compare([np.nan], [0.], "translation_m")
    with pytest.raises(ValueError): physical.compare([0.], [0.], "translation_m", -1.)
    with pytest.raises(ValueError): physical.compare([0.], [[0.]], "translation_m")


def test_continuous_rod_axial_and_torsional_exact_solution_and_energy():
    length, ea, gj, n, torque = 4., 4e9, 1.3e6, -20000., 200.
    pos, rotation, moment, energy = rod.segment(np.zeros(3), np.eye(3), [torque, 0., 0.], np.array([n, 0., 0.]),
                                               length, np.eye(3), ea, np.array([gj, 4e6, 7e6]), 2e-12)
    np.testing.assert_allclose(pos, [length*(1+n/ea), 0., 0.], atol=1e-12)
    np.testing.assert_allclose(rotation, Rotation.from_rotvec([torque*length/gj, 0., 0.]).as_matrix(), atol=1e-12)
    np.testing.assert_allclose(moment, [torque, 0., 0.], atol=1e-12)
    assert energy == pytest.approx(length/2*(n*n/ea+torque*torque/gj), rel=1e-12)


def test_continuous_rod_constant_bending_exact_circular_arc():
    length, ei, m = 4., 4e6, 2000.
    curvature = m/ei
    pos, rotation, _, energy = rod.segment(np.zeros(3), np.eye(3), np.array([0., m, 0.]), np.zeros(3),
                                          length, np.eye(3), 4e9, np.array([1.3e6, ei, 7e6]), 2e-12)
    np.testing.assert_allclose(pos, [np.sin(curvature*length)/curvature, 0., (np.cos(curvature*length)-1)/curvature], atol=1e-12)
    np.testing.assert_allclose(rotation, Rotation.from_rotvec([0., curvature*length, 0.]).as_matrix(), atol=1e-12)
    assert energy == pytest.approx(m*m*length/(2*ei), rel=1e-12)


def test_continuous_reference_refuses_portal_and_applied_moment_instead_of_inventing_bc():
    with pytest.raises(ValueError): rod.solve(request("sway")["model"])
    raw = request()["model"]
    raw["nodal_loads"][0]["mx_nm"] = 1.
    with pytest.raises(ValueError): rod.solve(raw)
