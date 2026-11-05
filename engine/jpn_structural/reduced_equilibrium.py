"""Residual of the physical FREE equations, in equivalent-force SI units.

Moment equations are divided by the same model length in numerator and
denominator. Supported loads/reactions never contribute to this metric.
The existing relative acceptance threshold remains a caller responsibility.
"""
import numpy as np

from .frame3d_model import fail


def reduced_equilibrium(tangent, displacement, applied, free, length_scale):
    internal = (tangent @ displacement).ravel()
    load = np.asarray(applied).ravel()
    residual = internal-load
    if not all(np.isfinite(v).all() for v in (internal, load, residual)):
        fail('NUMERICAL_FAILURE', 'Nonfinite reduced equilibrium equation.')
    free = np.asarray(free, dtype=int)
    units = np.tile([1., 1., 1., length_scale, length_scale, length_scale], len(load)//6)
    absolute = float(np.linalg.norm(residual[free]/units[free]))
    denominator = max(float(np.linalg.norm(internal[free]/units[free])),
                      float(np.linalg.norm(load[free]/units[free])), 1e-30)
    return residual, dict(relative_residual=absolute/denominator,
        scaled_absolute_residual_n=absolute, scaled_denominator_n=denominator,
        free_dofs=len(free), length_scale_m=length_scale)
