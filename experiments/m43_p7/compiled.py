"""Opt-in adapter: same inputs/outputs as experiments.m43_p6.element.element_response.

The Python element stays the reference. The control MATERIAL_CURVATURE is read from
the P6 element module at call time, so both paths always evaluate the same functional.
Guards raise the same codes/messages through the historical `fail`.
"""
import numpy as np
from scipy.spatial.transform import Rotation

from jpn_structural.frame3d_model import fail
from experiments.m43_p6 import element as reference
from . import kernel

_initial = {}


def initial_quaternion(reference_basis):
    basis = np.asarray(reference_basis, dtype=float)
    key = basis.tobytes()
    if key not in _initial:
        xyzw = Rotation.from_matrix(basis.T).as_quat()          # identical call to element.py
        _initial[key] = np.array([xyzw[3], xyzw[0], xyzw[1], xyzw[2]], dtype=float)
    return _initial[key]


def _evaluate(x, q, ea, eiy, eiz, gj, reference_basis, arc):
    q = np.ascontiguousarray(q, dtype=float)
    if not np.isfinite(q).all():
        fail("SPATIAL_NONFINITE", "Estado espacial não finito.")
    r0 = np.array([float(v) for v in x[1]-x[0]])
    length0 = float(np.linalg.norm(r0))
    out = kernel.evaluate(r0, length0, q, initial_quaternion(reference_basis), float(ea), float(eiy), float(eiz),
                          float(gj), bool(reference.MATERIAL_CURVATURE), bool(arc), kernel.POINTS, kernel.WEIGHTS)
    if out[0]:
        fail(*kernel.STATUS[out[0]])
    return out


def element_response(x, q, ea, eiy, eiz, gj, reference_basis, *, arc=True):
    _, energy, force, tangent, scalars, li, lj, frame = _evaluate(x, q, ea, eiy, eiz, gj, reference_basis, arc)
    physical = force.copy()
    for start in (0, 6):
        physical[start+3:start+6] = np.linalg.solve(reference.left_jacobian(q[start+3:start+6]).T, force[start+3:start+6])
    if not all(np.isfinite(a).all() for a in (force, tangent, physical)):
        fail("SPATIAL_NONFINITE", "Derivada espacial não finita; nenhum resultado.")
    length0 = float(np.linalg.norm(np.asarray(x[1]-x[0], dtype=float)))
    strain, chord_extension, arc_extension, torsion = (float(v) for v in scalars)
    return dict(force=force, tangent=tangent, physical_end_actions=physical, energy=float(energy),
                current_basis=kernel.frame_basis(frame), extension_m=strain, chord_extension_m=chord_extension,
                arc_extension_m=arc_extension, local_rotation_i=[float(v) for v in li],
                local_rotation_j=[float(v) for v in lj], torsion_rad=torsion,
                axial_n=ea/length0*strain, torsion_nm=gj/length0*torsion)


def internal_force(x, q, ea, eiy, eiz, gj, reference_basis, *, arc=True):
    """Gradient for the residual line search (same guards; Hessian discarded)."""
    return _evaluate(x, q, ea, eiy, eiz, gj, reference_basis, arc)[2]
