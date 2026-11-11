"""Objective spatial beam ENERGY with quaternion directors and exact AD.

Own mean-director/chord triad, not a port of OpenSees. Six coupled DOFs/node.
Generalized moments conjugate to rotation-vector coordinates are converted
to spatial physical moments using the SO(3) left Jacobian. No two planar
solutions are combined. Finite rotations are composed, never added.
"""
import math
import numpy as np
from scipy.spatial.transform import Rotation

from .frame3d_model import fail
from .second_jet import variables, value, sin, cos, atan2


def dot(a, b): return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def unit(a):
    norm2 = dot(a, a)
    if value(norm2) <= 1e-16:
        fail("SPATIAL_ROTATION_SINGULAR", "Diretor/chorda degenerado; não escolher um eixo fictício.")
    return [x/norm2**.5 for x in a]


def multiply(a, b):
    v = cross(a[1:], b[1:])
    return [a[0]*b[0]-dot(a[1:], b[1:]), *[a[0]*b[i+1]+b[0]*a[i+1]+v[i] for i in range(3)]]


def conjugate(q): return [q[0], -q[1], -q[2], -q[3]]


def exponential(r):
    t2 = dot(r, r)
    if value(t2) >= (math.pi-.05)**2:
        fail("SPATIAL_ROTATION_BRANCH", "Vetor de rotação próximo de pi; ramo não validado.")
    if value(t2) < 1e-8:
        w = 1-t2/8+t2*t2/384-t2*t2*t2/46080
        a = .5-t2/48+t2*t2/3840-t2*t2*t2/645120
    else:
        angle = t2**.5
        w, a = cos(angle/2), sin(angle/2)/angle
    return [w, *[a*x for x in r]]


def logarithm(q):
    if value(q[0]) <= 0:
        fail("SPATIAL_ROTATION_BRANCH", "Logaritmo de orientação fora do ramo principal validado.")
    t2 = dot(q[1:], q[1:])
    if value(t2) < 1e-8:
        a = 2/q[0]-2*t2/(3*q[0]**3)+2*t2*t2/(5*q[0]**5)
    else:
        t = t2**.5
        a = 2*atan2(t, q[0])/t
    return [a*x for x in q[1:]]


def rotate(q, x):
    return multiply(multiply(q, [0., *x]), conjugate(q))[1:]


def left_jacobian(r):
    r = np.asarray(r, dtype=float)
    angle = float(np.linalg.norm(r))
    skew = np.array([[0., -r[2], r[1]], [r[2], 0., -r[0]], [-r[1], r[0], 0.]])
    if angle < 1e-4:
        a = .5-angle**2/24+angle**4/720
        b = 1/6-angle**2/120+angle**4/5040
    else:
        a, b = (1-math.cos(angle))/angle**2, (angle-math.sin(angle))/angle**3
    return np.eye(3)+a*skew+b*skew@skew


def energy_state(x, q, ea, eiy, eiz, gj, reference_basis, *, arc=True):
    r0 = [float(v) for v in x[1]-x[0]]
    length0 = float(np.linalg.norm(r0))
    du = [q[6+i]-q[i] for i in range(3)]
    chord = [r0[i]+du[i] for i in range(3)]
    length = dot(chord, chord)**.5
    if value(length) <= 1e-5:
        fail("SPATIAL_DEGENERATE_CHORD", "Comprimento deformado inválido.")
    n = [v/length for v in chord]
    qi, qj = exponential(q[3:6]), exponential(q[9:12])
    if value(dot(qi, qj)) <= .05:
        fail("SPATIAL_ROTATION_BRANCH", "Média dos diretores ambígua; rotação relativa não validada.")
    mean = unit([qi[i]+qj[i] for i in range(4)])
    # Initial physical basis is supplied by the existing audited preparation.
    xyzw = Rotation.from_matrix(np.asarray(reference_basis).T).as_quat()
    initial = [float(xyzw[3]), *map(float, xyzw[:3])]
    mean_frame = multiply(mean, initial)
    director = rotate(mean_frame, [1., 0., 0.])
    alignment = unit([1+dot(director, n), *cross(director, n)])
    frame = multiply(alignment, mean_frame)
    local_i = logarithm(multiply(conjugate(frame), multiply(qi, initial)))
    local_j = logarithm(multiply(conjugate(frame), multiply(qj, initial)))
    extension = (2*dot(r0, du)+dot(du, du))/(length+length0)
    arc_extension = 0.
    if arc:
        arc_extension = length0/30*sum(2*local_i[k]**2-local_i[k]*local_j[k]+2*local_j[k]**2 for k in (1, 2))
    strain_extension = extension+arc_extension
    torsion = local_j[0]-local_i[0]
    if (abs(value(strain_extension))/length0 > .01 or
            max(abs(value(v)) for v in local_i+local_j) > .05):
        fail("SPATIAL_STRAIN_LIMIT", "Deformações locais fora do piloto elástico de pequenas deformações.")
    energy = .5*ea/length0*strain_extension**2+.5*gj/length0*torsion**2
    for k, ei in ((1, eiy), (2, eiz)):
        energy += 2*ei/length0*(local_i[k]**2+local_i[k]*local_j[k]+local_j[k]**2)
    return energy, dict(extension_m=strain_extension, chord_extension_m=extension, arc_extension_m=arc_extension,
                        local_rotation_i=local_i, local_rotation_j=local_j, torsion_rad=torsion,
                        frame=frame, axial_n=ea/length0*strain_extension, torsion_nm=gj/length0*torsion)


def element_response(x, q, ea, eiy, eiz, gj, reference_basis, *, arc=True):
    if not np.isfinite(q).all():
        fail("SPATIAL_NONFINITE", "Estado espacial não finito.")
    energy, state = energy_state(x, variables(q), ea, eiy, eiz, gj, reference_basis, arc=arc)
    force = energy.g.copy()
    physical = force.copy()
    for start in (0, 6):
        physical[start+3:start+6] = np.linalg.solve(left_jacobian(q[start+3:start+6]).T, force[start+3:start+6])
    frame = [value(v) for v in state.pop("frame")]
    basis = np.array([list(map(value, rotate(frame, axis))) for axis in ([1., 0., 0.], [0., 1., 0.], [0., 0., 1.])])
    result = {k: [value(a) for a in v] if isinstance(v, list) else value(v) for k, v in state.items()}
    if not all(np.isfinite(a).all() for a in (energy.g, energy.h, physical)):
        fail("SPATIAL_NONFINITE", "Derivada espacial não finita; nenhum resultado.")
    return dict(force=force, tangent=energy.h, physical_end_actions=physical, energy=energy.v,
                current_basis=basis, **result)
