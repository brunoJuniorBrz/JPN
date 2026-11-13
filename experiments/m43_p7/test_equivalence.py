"""Compiled kernel vs the P6 Python element (the reference), state by state.

Targets from the P6 architectural audit, applied with the reference's own scales:
  energy           |dE| <= 1e-12 * max(|E|, E_floor)
  gradient/actions max|d| <= 1e-10 * max(max|g_ref|, F_floor)
  Hessian          max|d| <= 1e-8 * max|H_ref|          (never zero: elastic stiffness)
E_floor = EA*L0*1e-12 (energy of a 1e-6 axial strain) and F_floor = EA*1e-6 (its force)
only matter for the unloaded straight state, whose reference energy/gradient are 0;
they are far below any physical state in the P6 domain (strains up to 1e-2).
This is implementation compatibility, NOT physical validation of the formulation.
"""
import json
from pathlib import Path
import numpy as np
import pytest
from scipy.spatial.transform import Rotation

from experiments.m43_p6 import element as reference
from experiments.m43_p7 import compiled
from jpn_structural.model import AnalysisError

ROOT = Path(__file__).resolve().parents[2]
SECTION = dict(ea=2.1e11*5.38e-3, eiy=2.1e11*8.36e-5, eiz=2.1e11*6.04e-6, gj=8.1e10*1.2e-7)   # strongly anisotropic


def basis_for(axis, roll_deg=0.):
    x = np.asarray(axis, float); x /= np.linalg.norm(x)
    helper = np.array([0., 0., 1.]) if abs(x[2]) < .9 else np.array([1., 0., 0.])
    y = np.cross(helper, x); y /= np.linalg.norm(y); z = np.cross(x, y)
    r = Rotation.from_rotvec(np.radians(roll_deg)*x).as_matrix()
    return np.array([x, r@y, r@z])


def member(axis=(1., 0., 0.), length=2.5, roll=0.):
    b = basis_for(axis, roll); return np.array([[.3, -.2, 1.], [.3, -.2, 1.]+b[0]*length]), b


def local(b, ti=(0, 0, 0), ri=(0, 0, 0), tj=(0, 0, 0), rj=(0, 0, 0)):
    """End motions given in the member's local axes, returned in global coordinates."""
    return np.concatenate([b.T@np.asarray(v, float) for v in (ti, ri, tj, rj)])


def cases():
    out = []
    x, b = member(); out.append(('straight-unloaded', x, local(b), b))
    out.append(('tension', x, local(b, tj=(2e-3, 0, 0)), b))
    out.append(('compression', x, local(b, tj=(-2e-3, 0, 0)), b))
    out.append(('biaxial-bending', x, local(b, ri=(0, .01, -.006), rj=(0, -.008, .012)), b))
    out.append(('torsion', x, local(b, ri=(.02, 0, 0), rj=(-.015, 0, 0)), b))
    out.append(('bending+torsion', x, local(b, ri=(.012, .009, -.004), rj=(-.01, -.006, .011)), b))
    out.append(('extension+bending+torsion', x, local(b, ti=(1e-4, 3e-4, -2e-4), ri=(.01, .008, -.005),
                                                       tj=(1.5e-3, -1e-4, 4e-4), rj=(-.012, -.004, .009)), b))
    x, b = member(axis=(.6, -.3, .74)); out.append(('inclined', x, local(b, ri=(.008, .01, -.006), tj=(8e-4, 2e-4, -3e-4), rj=(-.01, .004, .007)), b))
    for roll in (30., 90., 137.):
        x, b = member(axis=(.2, .9, -.4), roll=roll)
        out.append((f'section-roll-{roll:g}', x, local(b, ri=(.006, .012, -.004), rj=(-.004, -.009, .01)), b))
    x, b = member(axis=(-1., 0., 0.)); out.append(('reversed-orientation', x, local(b, ri=(.01, -.006, .008), rj=(-.007, .01, -.009)), b))
    x, b = member(axis=(.3, .4, .87))
    out.append(('near-rotation-limit', x, local(b, ri=(.0245, .03, -.0245), rj=(-.02, -.028, .03)), b))
    out.append(('near-strain-limit', x, local(b, tj=(.0245, 0, 0)), b))
    out.append(('small-angle-series-branch', x, local(b, ri=(3e-5, -2e-5, 4e-5), rj=(-5e-5, 1e-5, 2e-5), tj=(1e-6, 0, 0)), b))
    return out


CASES = cases()


def check(x, q, b, section, material):
    reference.MATERIAL_CURVATURE = material
    try:
        a = reference.element_response(x, q, *section.values(), b)
        c = compiled.element_response(x, q, *section.values(), b)
    finally:
        reference.MATERIAL_CURVATURE = False
    length0 = np.linalg.norm(x[1]-x[0]); ea = section['ea']
    e_floor, f_floor = ea*length0*1e-12, ea*1e-6
    assert abs(a['energy']-c['energy']) <= 1e-12*max(abs(a['energy']), e_floor)
    g_scale = max(np.max(abs(a['force'])), f_floor)
    assert np.max(abs(a['force']-c['force'])) <= 1e-10*g_scale
    assert np.max(abs(a['physical_end_actions']-c['physical_end_actions'])) <= 1e-10*max(np.max(abs(a['physical_end_actions'])), f_floor)
    h_scale = np.max(abs(a['tangent']))
    assert np.max(abs(a['tangent']-c['tangent'])) <= 1e-8*h_scale
    assert np.max(abs(c['tangent']-c['tangent'].T)) <= 1e-12*h_scale
    assert np.max(abs(a['current_basis']-c['current_basis'])) <= 1e-12
    for key in ('extension_m', 'chord_extension_m', 'arc_extension_m', 'torsion_rad'):
        assert abs(a[key]-c[key]) <= 1e-12*max(abs(a[key]), length0*1e-6), key
    for key in ('local_rotation_i', 'local_rotation_j'):
        assert np.max(abs(np.subtract(a[key], c[key]))) <= 1e-14
    return c


@pytest.mark.parametrize('material', (True, False), ids=('material-curvature', 'historical-bending'))
@pytest.mark.parametrize('case', CASES, ids=[c[0] for c in CASES])
def test_compiled_matches_reference(case, material):
    _, x, q, b = case
    check(x, q, b, SECTION, material)


@pytest.mark.parametrize('section', ({**SECTION}, dict(ea=1e9, eiy=1e7, eiz=1e7, gj=8e6)), ids=('anisotropic', 'isotropic'))
def test_section_anisotropy_is_carried(section):
    _, x, q, b = CASES[5]
    check(x, q, b, section, True)


STATES = json.loads((ROOT/'validation/m43-p7/converged-states.json').read_text())['states']


@pytest.mark.parametrize('state', STATES, ids=[f"m{s['mesh']}-{s['member']}" for s in STATES])
def test_converged_campaign_states(state):
    x = np.array(state['x']); q = np.array(state['q']); b = np.array(state['basis'])
    check(x, q, b, {k: state[k] for k in ('ea', 'eiy', 'eiz', 'gj')}, True)


def test_rigid_rotation_covariance_and_self_equilibrium():
    """Objectivity of the compiled path: rotate the whole configuration by Q."""
    _, x, q, b = CASES[6]; reference.MATERIAL_CURVATURE = True
    try:
        base = compiled.element_response(x, q, *SECTION.values(), b)
        Q = Rotation.from_rotvec([.4, -.7, .25]).as_matrix()
        qr = np.concatenate([Q@q[k:k+3] for k in range(0, 12, 3)])
        turned = compiled.element_response(x@Q.T, qr, *SECTION.values(), b@Q.T)
    finally:
        reference.MATERIAL_CURVATURE = False
    assert turned['energy'] == pytest.approx(base['energy'], rel=1e-12)
    expected = np.concatenate([Q@base['physical_end_actions'][k:k+3] for k in range(0, 12, 3)])
    assert np.max(abs(turned['physical_end_actions']-expected)) <= 1e-10*np.max(abs(expected))
    f = base['physical_end_actions']; deformed = x+q.reshape(2, 6)[:, :3]
    scale = np.max(abs(f))
    assert np.max(abs(f[0:3]+f[6:9])) <= 1e-10*scale
    moment = f[3:6]+f[9:12]+np.cross(deformed[0], f[0:3])+np.cross(deformed[1], f[6:9])
    assert np.max(abs(moment)) <= 1e-9*scale*np.max(abs(deformed))


def test_independent_finite_differences():
    """Gradient vs 4th-order differences of the compiled energy; Hessian vs differences of its gradient."""
    _, x, q, b = CASES[7]; reference.MATERIAL_CURVATURE = True
    try:
        f = lambda v: compiled.element_response(x, v, *SECTION.values(), b)
        base = f(q); g = np.zeros(12); H = np.zeros((12, 12))
        for k in range(12):
            h = 2e-6 if k % 6 < 3 else 1e-5; d = np.eye(12)[k]*h
            r = [f(q+s*d) for s in (2, 1, -1, -2)]
            g[k] = (-r[0]['energy']+8*r[1]['energy']-8*r[2]['energy']+r[3]['energy'])/(12*h)
            H[:, k] = (-r[0]['force']+8*r[1]['force']-8*r[2]['force']+r[3]['force'])/(12*h)
    finally:
        reference.MATERIAL_CURVATURE = False
    assert np.max(abs(g-base['force'])) <= 1e-6*np.max(abs(base['force']))
    assert np.max(abs(H-base['tangent'])) <= 1e-6*np.max(abs(base['tangent']))


@pytest.mark.parametrize('q_case, code', [
    ('strain', 'SPATIAL_STRAIN_LIMIT'), ('rotation', 'SPATIAL_STRAIN_LIMIT'),
    ('pi-branch', 'SPATIAL_ROTATION_BRANCH'), ('collapse', 'SPATIAL_DEGENERATE_CHORD'), ('nan', 'SPATIAL_NONFINITE')])
def test_same_guards_same_codes(q_case, code):
    x, b = member()
    q = dict(strain=local(b, tj=(.03, 0, 0)), rotation=local(b, ri=(0, .06, 0)),
             **{'pi-branch': local(b, ri=(3.12, 0, 0))}, collapse=local(b, tj=(-2.5+5e-6, 0, 0)),   # exactly 0 makes the REFERENCE raise ZeroDivisionError first
             nan=np.full(12, np.nan))[q_case]
    codes = []
    for fn in (reference.element_response, compiled.element_response):
        with pytest.raises(AnalysisError) as error:
            fn(x, q, *SECTION.values(), b)
        codes.append((error.value.code, str(error.value)))
    assert codes[0] == codes[1] and codes[0][0] == code
