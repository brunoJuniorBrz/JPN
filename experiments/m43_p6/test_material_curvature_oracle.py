"""Scale-explicit independent oracle for the material-curvature energy.

Derivation (u in [0,1], s = L0 u, ds = L0 du), R = Swing(e1 -> t) Rx(phi):
    vee(R^T R,u) = [K21, K02, K10] with K = R^T R,u  (NO factor 1/2: for a skew
                   matrix K = [w]x, K21 = w1, K02 = w2, K10 = w3)
    kappa        = vee / L0                       (rad/m)
    U            = 1/2 INT_0^L0 (GJ k1^2 + EIy k2^2 + EIz k3^2) ds
                 = 1/(2 L0) INT_0^1 (GJ v1^2 + EIy v2^2 + EIz v3^2) du,   v = vee

The archived oracle used v/2 and omitted 1/(2 L0). Both slips cancel only at
L0 = 2 m (1/2^2 = 1/(2*2)); test_archived_oracle_* reproduces that. The matrix
R(u) here is built from scipy rotations and its own director construction, and
differentiated numerically (two stencils, step-convergence study); nothing
from the candidate's algebra is reused. No expected value was adjusted.
"""
import numpy as np
import pytest
from scipy.spatial.transform import Rotation
from . import element
from .dual import variables
from .material_curvature import energy as material_energy

GAUSS = np.polynomial.legendre.leggauss(16)


def candidate(length, li, lj, eiy, eiz, gj):
    return material_energy(length, li, lj, eiy, eiz, gj, element.rotate, element.exponential, element.atan2, element.sin, element.cos)


def make_frame(li, lj):
    rotations = [Rotation.from_rotvec(r) for r in (li, lj)]
    directors = [r.apply([1., 0., 0.]) for r in rotations]
    slopes = [d[1:]/d[0] for d in directors]
    quats = [r.as_quat() for r in rotations]            # x, y, z, w
    rolls = [2*np.arctan2(q[0], q[3]) for q in quats]   # swing has no x part: roll is the x/w angle

    def frame(u):
        a, b = (1-4*u+3*u*u)*slopes[0]+(-2*u+3*u*u)*slopes[1]
        t = np.array([1., a, b]); t /= np.linalg.norm(t)
        y = np.array([-t[1], 1-t[1]**2/(1+t[0]), -t[1]*t[2]/(1+t[0])]); z = np.cross(t, y)
        phi = (1-u)*rolls[0]+u*rolls[1]
        return np.column_stack([t, np.cos(phi)*y+np.sin(phi)*z, -np.sin(phi)*y+np.cos(phi)*z])
    return frame


def derivative(frame, u, h, stencil):
    if stencil == 3:
        return (frame(u+h)-frame(u-h))/(2*h)
    return (-frame(u+2*h)+8*frame(u+h)-8*frame(u-h)+frame(u-2*h))/(12*h)


def vee_rates(frame, u, h, stencil):
    K = frame(u).T@derivative(frame, u, h, stencil)
    assert np.allclose(K, -K.T, atol=50*h**2+1e-8), "R^T R,u must be skew"
    return np.array([K[2, 1], K[0, 2], K[1, 0]])


def oracle(length, li, lj, eiy, eiz, gj, h=2e-3, stencil=5):
    frame = make_frame(li, lj); total = 0.
    for point, weight in zip(*GAUSS):
        u = (point+1)/2; v = vee_rates(frame, u, h, stencil)
        total += weight/2*(gj*v[0]**2+eiy*v[1]**2+eiz*v[2]**2)
    return total/(2*length)


def archived_oracle(li, lj, eiy, eiz, gj, h=1e-5):
    """The previous test's scale: vee/2 and no 1/(2 L0). Kept only to show the cancellation."""
    frame = make_frame(li, lj); total = 0.
    for point, weight in zip(*GAUSS):
        u = (point+1)/2; k = vee_rates(frame, u, h, 3)/2
        total += weight/2*(gj*k[0]**2+eiy*k[1]**2+eiz*k[2]**2)
    return total


def rotvec(angle, axis, roll=0.):
    """Orientation Rot_axis(angle) * Rx(roll): swing about `axis`, then section roll."""
    swing = Rotation.from_rotvec(angle*np.eye(3)[axis]); twist = Rotation.from_rotvec([roll, 0., 0.])
    return (swing*twist).as_rotvec()


LENGTHS = (1., 2., 6.)
STIFFNESS = {"isotropic": (1e4, 1e4, 8e3), "anisotropic": (2e4, 1e4, 8e3), "weak-axis": (5e5, 2e3, 3e4), "soft-torsion": (7e3, 3e3, 40.)}
ROTATIONS = {
    "combined-small": ([.012, .02, -.025], [-.01, -.015, .03]),
    "roll-and-bend": ([.04, .01, .02], [-.03, .02, -.015]),
    "all-axes-large": ([.03, -.04, .025], [.02, .035, -.03]),
    "pure-torsion": ([.03, 0., 0.], [-.02, 0., 0.]),
}


def test_archived_oracle_matches_only_at_two_metres():
    li, lj = np.array(ROTATIONS["combined-small"][0]), np.array(ROTATIONS["combined-small"][1])
    for length in LENGTHS:
        cand = candidate(length, li, lj, 2e4, 1e4, 8e3)
        ratio = archived_oracle(li, lj, 2e4, 1e4, 8e3)/cand
        # Cause of the false agreement: two scale slips with product L0/2.
        assert ratio == pytest.approx(length/2, rel=1e-7)
        assert oracle(length, li, lj, 2e4, 1e4, 8e3) == pytest.approx(cand, rel=1e-9)


def test_oracle_derivative_step_convergence_and_stencil_independence():
    """Each stencil is checked in ITS asymptotic range (measured order 2.00 and 4.00 there);
    below ~5e-3 the 5-point error reaches the round-off floor (~7e-12 J, ~2e-13 relative),
    which is therefore the oracle's own uncertainty. Reference: 5-point, h = 2.5e-4."""
    li, lj = (np.array(v) for v in ROTATIONS["all-axes-large"]); args = (2., li, lj, 2e4, 1e4, 8e3)
    reference = oracle(*args, h=2.5e-4, stencil=5)
    for stencil, steps, expected_order in ((3, (1e-2, 5e-3, 2.5e-3), 2.), (5, (4e-2, 2e-2, 1e-2), 4.)):
        errors = [abs(oracle(*args, h=h, stencil=stencil)-reference) for h in steps]
        observed = [np.log(errors[i]/errors[i+1])/np.log(2) for i in range(2)]
        assert errors[0] > errors[1] > errors[2]
        assert all(abs(o-expected_order) < .1 for o in observed), (stencil, observed)
    assert oracle(*args, h=1e-3, stencil=5) == pytest.approx(reference, rel=1e-11)       # uncertainty of the oracle
    assert oracle(*args, h=1e-3, stencil=3) == pytest.approx(reference, rel=1e-6)         # independent method
    assert candidate(args[0], li, lj, 2e4, 1e4, 8e3) == pytest.approx(reference, rel=1e-9)

@pytest.mark.parametrize("stiffness", STIFFNESS)
@pytest.mark.parametrize("rotation", ROTATIONS)
def test_energy_is_exactly_inverse_in_length(stiffness, rotation):
    """With fixed end orientations, the field is length-free: U(L) = U(1)/L (SI, N*m)."""
    li, lj = (np.array(v) for v in ROTATIONS[rotation]); eiy, eiz, gj = STIFFNESS[stiffness]
    base = candidate(1., li, lj, eiy, eiz, gj)
    for length in (.5, 1., 2., 6., 50.):
        assert candidate(length, li, lj, eiy, eiz, gj)*length == pytest.approx(base, rel=1e-13)
    # Stiffness scaling is linear in each modulus (dimensional check): GJ, EIy, EIz -> 3x.
    assert candidate(2., li, lj, 3*eiy, 3*eiz, 3*gj) == pytest.approx(3*candidate(2., li, lj, eiy, eiz, gj), rel=1e-13)


@pytest.mark.parametrize("length", LENGTHS)
def test_pure_torsion_closed_form(length):
    gj = 8e3
    for ti, tj in ((.03, -.02), (0., .05), (-.04, -.04)):
        li, lj = np.array([ti, 0., 0.]), np.array([tj, 0., 0.])
        assert candidate(length, li, lj, 2e4, 1e4, gj) == pytest.approx(gj*(tj-ti)**2/(2*length), rel=1e-12, abs=1e-18)
        assert oracle(length, li, lj, 2e4, 1e4, gj) == pytest.approx(gj*(tj-ti)**2/(2*length), rel=1e-9, abs=1e-12)


@pytest.mark.parametrize("length", LENGTHS)
@pytest.mark.parametrize("roll_deg", (0., 30., 90., 137.))
@pytest.mark.parametrize("axis", (1, 2))
def test_biaxial_bending_closed_form_selects_the_right_inertia(length, roll_deg, axis):
    """Symmetric end swings +-a about global axis: U = 2 tan^2(a)/L0 * (EI_about_axis(phi)).

    Swing about global z bends in the xy plane -> curvature component along local z when phi=0
    (k3, EIz); a section roll phi mixes k2/k3: EIy sin^2 + EIz cos^2. Swing about y: EIy cos^2 + EIz sin^2.
    """
    a, phi = 1e-3, np.radians(roll_deg); eiy, eiz, gj = 5e5, 2e3, 3e4
    li, lj = rotvec(a, axis, phi), rotvec(-a, axis, phi)
    inertia = eiy*np.sin(phi)**2+eiz*np.cos(phi)**2 if axis == 2 else eiy*np.cos(phi)**2+eiz*np.sin(phi)**2
    expected = 2*np.tan(a)**2/length*inertia      # exact to O(a^2) ~ 1e-6 relative
    assert candidate(length, li, lj, eiy, eiz, gj) == pytest.approx(expected, rel=2e-5)
    assert oracle(length, li, lj, eiy, eiz, gj) == pytest.approx(expected, rel=2e-5)
    # Weak/strong axis really differ: this test must not pass for isotropic sections by accident.
    assert abs(eiy-eiz)/eiy > .9


@pytest.mark.parametrize("length", LENGTHS)
@pytest.mark.parametrize("rotation", ROTATIONS)
@pytest.mark.parametrize("stiffness", STIFFNESS)
def test_ad_gradient_equals_gradient_of_the_oracle_functional(length, rotation, stiffness):
    """dU/d(end rotation vectors): forward AD of the candidate vs 4th-order differences of the oracle."""
    eiy, eiz, gj = STIFFNESS[stiffness]; q = np.array(ROTATIONS[rotation][0]+ROTATIONS[rotation][1])
    v = variables(q); energy = candidate(length, v[:3], v[3:], eiy, eiz, gj)
    eps, gradient = 2e-4, np.zeros(6)
    value = lambda x: oracle(length, x[:3], x[3:], eiy, eiz, gj)
    for k in range(6):
        d = np.eye(6)[k]*eps
        gradient[k] = (-value(q+2*d)+8*value(q+d)-8*value(q-d)+value(q-2*d))/(12*eps)
    scale = np.max(abs(energy.g))+1e-30
    np.testing.assert_allclose(energy.g, gradient, rtol=0, atol=2e-6*scale+1e-9*energy.v)
    assert energy.v == pytest.approx(value(q), rel=2e-9)
