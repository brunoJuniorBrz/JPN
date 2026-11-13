"""Native second-order forward jets (Numba nopython, no object-mode fallback).

A jet over n variables is one float64 array J of shape (n+1, n+1):
    J[0, 0] value, J[0, 1:] gradient (mirrored in J[1:, 0]), J[1:, 1:] Hessian.
Every rule is the same chain rule as engine/jpn_structural/second_jet.Jet and keeps
its term order (h*b + h'*a + outer(g, g') + outer(g', g)); only the storage and the
interpreter dispatch change. Linear operations act on the whole array.
"""
import math
import numpy as np
from numba import njit

OPTS = dict(cache=True, nogil=True, fastmath=False, error_model="numpy")


@njit(**OPTS)
def seed(values):
    n = values.shape[0]
    out = np.zeros((n, n+1, n+1))
    for i in range(n):
        out[i, 0, 0] = values[i]; out[i, 0, i+1] = 1.; out[i, i+1, 0] = 1.
    return out


@njit(**OPTS)
def const(c, m):
    out = np.zeros((m, m)); out[0, 0] = c
    return out


@njit(**OPTS)
def addc(a, c):
    out = a.copy(); out[0, 0] = a[0, 0]+c
    return out


@njit(**OPTS)
def rsubc(c, a):
    """c - a, evaluated like Jet.__rsub__: (-a) + c."""
    out = -a; out[0, 0] = out[0, 0]+c
    return out


@njit(**OPTS)
def mul(a, b):
    m = a.shape[0]; out = np.empty((m, m)); av = a[0, 0]; bv = b[0, 0]
    out[0, 0] = av*bv
    for i in range(1, m):
        gi = a[0, i]*bv+b[0, i]*av
        out[0, i] = gi; out[i, 0] = gi
    for i in range(1, m):
        ai = a[0, i]; bi = b[0, i]
        for j in range(1, m):
            out[i, j] = a[i, j]*bv+b[i, j]*av+ai*b[0, j]+bi*a[0, j]
    return out


@njit(**OPTS)
def unary(a, f0, f1, f2):
    m = a.shape[0]; out = np.empty((m, m)); out[0, 0] = f0
    for i in range(1, m):
        gi = f1*a[0, i]; out[0, i] = gi; out[i, 0] = gi
    for i in range(1, m):
        ai = a[0, i]
        for j in range(1, m):
            out[i, j] = f1*a[i, j]+f2*(ai*a[0, j])
    return out


@njit(**OPTS)
def power(a, p):
    if p == 0.:
        return const(1., a.shape[0])
    v = a[0, 0]
    second = p*(p-1.)*v**(p-2.) if p != 1. else 0.
    return unary(a, v**p, p*v**(p-1.), second)


@njit(**OPTS)
def div(a, b):
    return mul(a, power(b, -1.))


@njit(**OPTS)
def sin(a):
    v = a[0, 0]
    return unary(a, math.sin(v), math.cos(v), -math.sin(v))


@njit(**OPTS)
def cos(a):
    v = a[0, 0]
    return unary(a, math.cos(v), -math.sin(v), -math.cos(v))


@njit(**OPTS)
def atan2(y, x):
    m = y.shape[0]; out = np.empty((m, m))
    xv = x[0, 0]; yv = y[0, 0]; r2 = xv*xv+yv*yv
    fy = xv/r2; fx = -yv/r2
    fyy = -2*xv*yv/r2**2; fxx = 2*xv*yv/r2**2; fyx = (yv*yv-xv*xv)/r2**2
    out[0, 0] = math.atan2(yv, xv)
    for i in range(1, m):
        gi = fy*y[0, i]+fx*x[0, i]; out[0, i] = gi; out[i, 0] = gi
    for i in range(1, m):
        yi = y[0, i]; xi = x[0, i]
        for j in range(1, m):
            out[i, j] = (fy*y[i, j]+fx*x[i, j]+fyy*(yi*y[0, j])+fxx*(xi*x[0, j])
                         + fyx*(yi*x[0, j]+xi*y[0, j]))
    return out


# --- jet vectors: arrays (k, n+1, n+1) -------------------------------------------------
@njit(**OPTS)
def dot(a, b):
    acc = mul(a[0], b[0])
    for k in range(1, a.shape[0]):
        acc = acc+mul(a[k], b[k])
    return acc


@njit(**OPTS)
def dotc(c, a):
    acc = a[0]*c[0]
    for k in range(1, a.shape[0]):
        acc = acc+a[k]*c[k]
    return acc


@njit(**OPTS)
def cross(a, b):
    out = np.empty_like(a)
    out[0] = mul(a[1], b[2])-mul(a[2], b[1])
    out[1] = mul(a[2], b[0])-mul(a[0], b[2])
    out[2] = mul(a[0], b[1])-mul(a[1], b[0])
    return out


@njit(**OPTS)
def unit(a):
    """Returns (status, unit vector). status 4 = SPATIAL_ROTATION_SINGULAR."""
    norm2 = dot(a, a)
    if norm2[0, 0] <= 1e-16:
        return 4, a
    inverse = power(power(norm2, .5), -1.)
    out = np.empty_like(a)
    for k in range(a.shape[0]):
        out[k] = mul(a[k], inverse)
    return 0, out


@njit(**OPTS)
def qmul(a, b):
    """Hamilton product of two jet quaternions (w, x, y, z), same algebra as element.multiply."""
    out = np.empty_like(a)
    v = cross(a[1:], b[1:])
    out[0] = mul(a[0], b[0])-dot(a[1:], b[1:])
    for i in range(3):
        out[i+1] = mul(a[0], b[i+1])+mul(b[0], a[i+1])+v[i]
    return out


@njit(**OPTS)
def qmulc(a, c):
    """Jet quaternion times constant quaternion."""
    out = np.empty_like(a)
    v0 = a[2]*c[3]-a[3]*c[2]; v1 = a[3]*c[1]-a[1]*c[3]; v2 = a[1]*c[2]-a[2]*c[1]
    out[0] = a[0]*c[0]-dotc(c[1:], a[1:])
    out[1] = a[0]*c[1]+a[1]*c[0]+v0
    out[2] = a[0]*c[2]+a[2]*c[0]+v1
    out[3] = a[0]*c[3]+a[3]*c[0]+v2
    return out


@njit(**OPTS)
def conjugate(q):
    out = -q; out[0] = q[0]
    return out


@njit(**OPTS)
def rotate_e1(q):
    """rotate(q, [1, 0, 0]) = (q (x) [0, 1, 0, 0]) (x) conj(q), vector part."""
    c = np.array([0., 1., 0., 0.])
    return qmul(qmulc(q, c), conjugate(q))[1:]
