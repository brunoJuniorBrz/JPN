"""Compiled P6 spatial element: same energy functional, native AD, block chain rule.

Stage 1 (12 DOF jets) evaluates the P6 kinematics exactly as experiments/m43_p6/element.py:
chord, finite rotations (exponential), mean director, alignment, frame and the two local
end quaternions, plus the chord extension. Its 10 outputs
    w = [chord_extension, length, local_qi(4), local_qj(4)]
are the only quantities through which the energy depends on q.
Stage 2 (10-variable jets) evaluates logarithm, director-Hermite arc extension, axial
energy and either the material-curvature energy (P6 opt-in) or the historical
bending/torsion terms. The exact chain rule
    dE/dq = sum_k E_k dw_k/dq,  d2E/dq2 = J^T E_ww J + sum_k E_k d2w_k/dq2
assembles energy, gradient and Hessian. No term of the functional is changed.
Value-based guards keep the same order and codes as the Python element.
"""
import math
import numpy as np
from numba import njit

from .jets import (OPTS, seed, const, addc, rsubc, mul, power, div, sin, cos, atan2,
                   dot, dotc, cross, unit, qmul, qmulc, conjugate, rotate_e1)

POINTS, WEIGHTS = np.polynomial.legendre.leggauss(8)   # arc.POINTS/WEIGHTS (same call)
STATUS = {
    1: ("SPATIAL_DEGENERATE_CHORD", "Comprimento deformado inválido."),
    2: ("SPATIAL_ROTATION_BRANCH", "Vetor de rotação próximo de pi; ramo não validado."),
    3: ("SPATIAL_ROTATION_BRANCH", "Média dos diretores ambígua; rotação relativa não validada."),
    4: ("SPATIAL_ROTATION_SINGULAR", "Diretor/chorda degenerado; não escolher um eixo fictício."),
    5: ("SPATIAL_ROTATION_BRANCH", "Logaritmo de orientação fora do ramo principal validado."),
    6: ("SPATIAL_STRAIN_LIMIT", "Deformações locais fora do piloto elástico de pequenas deformações."),
}


@njit(**OPTS)
def exponential(r):
    m = r.shape[1]; out = np.empty((4, m, m))
    t2 = dot(r, r)
    if t2[0, 0] >= (math.pi-.05)**2:
        return 2, out
    if t2[0, 0] < 1e-8:
        t4 = mul(t2, t2); t6 = mul(t4, t2)
        w = rsubc(1., t2*(1/8))+t4*(1/384)-t6*(1/46080)
        a = rsubc(.5, t2*(1/48))+t4*(1/3840)-t6*(1/645120)
    else:
        angle = power(t2, .5)
        half = angle*(1/2)
        w = cos(half)
        a = div(sin(half), angle)
    out[0] = w
    for k in range(3):
        out[k+1] = mul(a, r[k])
    return 0, out


@njit(**OPTS)
def logarithm(q):
    m = q.shape[1]; out = np.empty((3, m, m))
    if q[0, 0, 0] <= 0:
        return 5, out
    t2 = dot(q[1:], q[1:])
    if t2[0, 0] < 1e-8:
        q0 = q[0]
        a = (power(q0, -1.)*2-div(t2*2, power(q0, 3.)*3)) + div(mul(t2*2, t2), power(q0, 5.)*5)
    else:
        t = power(t2, .5)
        a = div(atan2(t, q[0])*2, t)
    for k in range(3):
        out[k] = mul(a, q[k+1])
    return 0, out


@njit(**OPTS)
def stage1(r0, length0, q, initial):
    """Returns (status, W[10], frame_value[4])."""
    W = np.zeros((10, 13, 13)); frame_value = np.zeros(4)
    v = seed(q)
    du = np.empty((3, 13, 13)); chord = np.empty((3, 13, 13))
    for k in range(3):
        du[k] = v[6+k]-v[k]
        chord[k] = addc(du[k], r0[k])
    length = power(dot(chord, chord), .5)
    if length[0, 0] <= 1e-5:
        return 1, W, frame_value
    inverse_length = power(length, -1.)
    n = np.empty((3, 13, 13))
    for k in range(3):
        n[k] = mul(chord[k], inverse_length)
    s, qi = exponential(v[3:6])
    if s:
        return s, W, frame_value
    s, qj = exponential(v[9:12])
    if s:
        return s, W, frame_value
    if dot(qi, qj)[0, 0] <= .05:
        return 3, W, frame_value
    s, mean = unit(qi+qj)
    if s:
        return s, W, frame_value
    mean_frame = qmulc(mean, initial)
    director = rotate_e1(mean_frame)
    c = cross(director, n)
    align = np.empty((4, 13, 13)); align[0] = addc(dot(director, n), 1.); align[1:] = c
    s, alignment = unit(align)
    if s:
        return s, W, frame_value
    frame = qmul(alignment, mean_frame)
    local_qi = qmul(conjugate(frame), qmulc(qi, initial))
    local_qj = qmul(conjugate(frame), qmulc(qj, initial))
    extension = div(dotc(r0, du)*2+dot(du, du), addc(length, length0))
    W[0] = extension; W[1] = length; W[2:6] = local_qi; W[6:10] = local_qj
    for k in range(4):
        frame_value[k] = frame[k, 0, 0]
    return 0, W, frame_value


@njit(**OPTS)
def slopes(q):
    d = rotate_e1(q)
    return div(d[1], d[0]), div(d[2], d[0])


@njit(**OPTS)
def stage2(w, length0, ea, eiy, eiz, gj, material, arc, points, weights):
    """Returns (status, energy jet, scalars[4]=strain, chord ext, arc ext, torsion, li[3], lj[3])."""
    v = seed(w); m = v.shape[1]
    scalars = np.zeros(4); li_v = np.zeros(3); lj_v = np.zeros(3)
    extension = v[0]; length = v[1]; qi = v[2:6]; qj = v[6:10]
    s, li = logarithm(qi)
    if s:
        return s, const(0., m), scalars, li_v, lj_v
    s, lj = logarithm(qj)
    if s:
        return s, const(0., m), scalars, li_v, lj_v
    si0, si1 = slopes(qi); sj0, sj1 = slopes(qj)
    arc_extension = const(0., m)
    if arc:
        ii = mul(si0, si0)+mul(si1, si1); jj = mul(sj0, sj0)+mul(sj1, sj1); ij = mul(si0, sj0)+mul(si1, sj1)
        excess = const(0., m)
        for p in range(points.shape[0]):
            t = (points[p]+1)/2
            a = 1-4*t+3*t*t; b = -2*t+3*t*t
            s2 = ii*(a*a)+ij*(2*a*b)+jj*(b*b)
            excess = excess+div(s2, addc(power(addc(s2, 1.), .5), 1.))*(weights[p]/2)
        arc_extension = mul(length, excess)
    strain = extension+arc_extension
    largest = 0.
    for k in range(3):
        li_v[k] = li[k, 0, 0]; lj_v[k] = lj[k, 0, 0]
        largest = max(largest, abs(li_v[k]), abs(lj_v[k]))
    if abs(strain[0, 0])/length0 > .01 or largest > .05:
        return 6, const(0., m), scalars, li_v, lj_v
    energy = power(strain, 2.)*(.5*ea/length0)
    if material:
        pi = atan2(qi[1], qi[0])*2; pj = atan2(qj[1], qj[0])*2
        total = const(0., m); twist = const(0., m)
        for p in range(points.shape[0]):
            u = (points[p]+1)/2
            ca = 1-4*u+3*u*u; cb = -2*u+3*u*u; da_ = -4+6*u; db_ = -2+6*u
            a = si0*ca+sj0*cb; b = si1*ca+sj1*cb
            da = si0*da_+sj0*db_; db = si1*da_+sj1*db_
            speed = power(addc(mul(a, a), 1.)+mul(b, b), .5)
            den = mul(speed, addc(speed, 1.))
            inverse_den = power(den, -1.); inverse_speed = power(speed, -1.)
            ab = mul(mul(a, b), inverse_den)
            bb = mul(mul(b, b), inverse_den)
            aa = mul(mul(a, a), inverse_den)
            ky = mul(mul(ab, da)-mul(rsubc(1., bb), db), inverse_speed)
            kz = mul(mul(rsubc(1., aa), da)-mul(ab, db), inverse_speed)
            phi = pi*(1-u)+pj*u
            c = cos(phi); sn = sin(phi)
            connection = mul(mul(b, da)-mul(a, db), inverse_den)
            k1 = pj-pi+connection
            k2 = mul(c, ky)+mul(sn, kz); k3 = mul(c, kz)-mul(sn, ky)
            density = mul(k1*gj, k1)+mul(k2*eiy, k2)+mul(k3*eiz, k3)
            total = total+density*(weights[p]/2)*(1/(2*length0))
            twist = twist+k1*(weights[p]/2)
        energy = energy+total
        torsion = twist[0, 0]
    else:
        torsion_jet = lj[0]-li[0]
        energy = energy+power(torsion_jet, 2.)*(.5*gj/length0)
        energy = energy+(power(li[1], 2.)+mul(li[1], lj[1])+power(lj[1], 2.))*(2*eiy/length0)
        energy = energy+(power(li[2], 2.)+mul(li[2], lj[2])+power(lj[2], 2.))*(2*eiz/length0)
        torsion = torsion_jet[0, 0]
    scalars[0] = strain[0, 0]; scalars[1] = extension[0, 0]; scalars[2] = arc_extension[0, 0]; scalars[3] = torsion
    return 0, energy, scalars, li_v, lj_v


@njit(**OPTS)
def combine(W, E):
    """Exact block chain rule from intermediates w(q) to q."""
    nw = W.shape[0]; nq = W.shape[1]-1
    g = np.zeros(nq); H = np.zeros((nq, nq))
    for k in range(nw):
        ek = E[0, k+1]
        for a in range(nq):
            g[a] += ek*W[k, 0, a+1]
            for b in range(nq):
                H[a, b] += ek*W[k, a+1, b+1]
    for k in range(nw):
        for l in range(nw):
            ekl = E[k+1, l+1]
            if ekl == 0.:
                continue
            for a in range(nq):
                t = ekl*W[k, 0, a+1]
                for b in range(nq):
                    H[a, b] += t*W[l, 0, b+1]
    return g, H


@njit(**OPTS)
def frame_basis(f):
    """Rows rotate(frame, e_k) for unit axes (float quaternion)."""
    w, x, y, z = f[0], f[1], f[2], f[3]
    return np.array([[w*w+x*x-y*y-z*z, 2*(x*y+w*z), 2*(x*z-w*y)],
                     [2*(x*y-w*z), w*w-x*x+y*y-z*z, 2*(y*z+w*x)],
                     [2*(x*z+w*y), 2*(y*z-w*x), w*w-x*x-y*y+z*z]])


@njit(**OPTS)
def evaluate(r0, length0, q, initial, ea, eiy, eiz, gj, material, arc, points, weights):
    s, W, frame_value = stage1(r0, length0, q, initial)
    if s:
        return s, 0., np.zeros(12), np.zeros((12, 12)), np.zeros(4), np.zeros(3), np.zeros(3), frame_value
    s, E, scalars, li, lj = stage2(W[:, 0, 0].copy(), length0, ea, eiy, eiz, gj, material, arc, points, weights)
    if s:
        return s, 0., np.zeros(12), np.zeros((12, 12)), scalars, li, lj, frame_value
    g, H = combine(W, E)
    return 0, E[0, 0], g, H, scalars, li, lj, frame_value
