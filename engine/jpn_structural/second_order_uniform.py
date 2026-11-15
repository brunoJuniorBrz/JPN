"""Closed-form force and tangent of the dead uniform load potential."""
import math

import numpy as np

from .frame3d_model import fail

I3 = np.eye(3)
CHORD_GRAD = np.zeros((3,12))
CHORD_GRAD[:,:3] = -I3
CHORD_GRAD[:,6:9] = I3
MID_GRAD = abs(CHORD_GRAD)/2
CHORD_LENGTH_SQUARED_HESS = 2*CHORD_GRAD.T@CHORD_GRAD


def _quaternion_coefficients(s):
    angle = math.sqrt(s)
    if angle >= math.pi-.05:
        fail("SPATIAL_ROTATION_BRANCH","Rotation stays inside the principal branch.")
    if s < .01:
        # Stable radial derivatives of cos(sqrt(s)/2) and
        # sin(sqrt(s)/2)/sqrt(s). Match the P4 branch at the origin.
        ws = (-1/8,1/384,-1/46080,1/10321920,-1/3715891200)
        vs = (-1/48,1/3840,-1/645120,1/185794560,-1/81749606400)
        if s < 1e-8:
            ws,vs = ws[:3],vs[:3]
            w = 1-s/8+s*s/384-s*s*s/46080
            a = .5-s/48+s*s/3840-s*s*s/645120
        else:
            w,a = math.cos(angle/2),math.sin(angle/2)/angle
        dw,da = (sum(i*c*s**(i-1) for i,c in enumerate(coeff,1)) for coeff in (ws,vs))
        ddw,dda = (sum(i*(i-1)*c*s**(i-2) for i,c in enumerate(coeff,1) if i>=2) for coeff in (ws,vs))
    else:
        w,a = math.cos(angle/2),math.sin(angle/2)/angle
        dw = -a/4
        da = (w/2-a)/(2*s)
        ddw = -da/4
        dda = (dw/2-3*da)/(2*s)
    return (w,dw,ddw), (a,da,dda)


def _director(rotation, axis):
    """Rotated end director and its Jacobian/Hessian in rotation-vector coordinates."""
    s = float(rotation@rotation)
    (w,dw,ddw),(a,da,dda) = _quaternion_coefficients(s)
    a2,d_a2,dd_a2 = a*a,2*a*da,2*(da*da+a*dda)
    # q(0,e)q* = (w²-s a²)e + 2wa(r×e) + 2a² r(r·e).
    c0 = w*w-s*a2,2*w*dw-a2-s*d_a2,2*(dw*dw+w*ddw)-2*d_a2-s*dd_a2
    c1 = 2*w*a,2*(dw*a+w*da),2*(ddw*a+2*dw*da+w*dda)
    c2 = 2*a2,2*d_a2,2*dd_a2
    along = float(rotation@axis)
    value = c0[0]*axis+c1[0]*np.cross(rotation,axis)+c2[0]*along*rotation
    jac = np.zeros((3,3))
    hess = np.zeros((3,3,3))
    r2 = np.outer(rotation,rotation)
    terms = ((c0,axis,np.zeros((3,3)),0.),
             (c1,np.cross(rotation,axis),np.cross(I3,axis).T,0.),
             (c2,along*rotation,along*I3+np.outer(rotation,axis),
              np.einsum("ij,k->ijk",I3,axis)+np.einsum("ik,j->ijk",I3,axis)))
    for (f,df,ddf),v,dv,ddv in terms:
        radial_grad = 2*df*rotation
        radial_hess = 2*df*I3+4*ddf*r2
        jac += f*dv+v[:,None]*radial_grad
        hess += (f*ddv+v[:,None,None]*radial_hess+
                 dv[:,:,None]*radial_grad+dv[:,None,:]*radial_grad[None,:,None])
    return value,jac,hess


def _slope(chord, director, jac, hess, offset):
    """d/(chord·d), with the chord and director derivatives expanded."""
    grad = np.zeros((3,12))
    curvature = np.zeros((3,12,12))
    end = slice(offset,offset+3)
    grad[:,end] = jac
    curvature[:,end,end] = hess
    value = float(chord@director)
    if value <= 0.:
        fail("SECOND_ORDER_NOT_CONVERGED","Distributed load reached a singular centerline slope.")
    b = CHORD_GRAD.T@director+chord@grad
    mixed = CHORD_GRAD.T@grad
    h_b = mixed+mixed.T+np.einsum("i,ijk->jk",chord,curvature)
    inverse = 1/value
    v = director*inverse
    grad_inverse = -(inverse**2)*b
    hess_inverse = 2*inverse**3*np.outer(b,b)-inverse**2*h_b
    return (v,grad*inverse+director[:,None]*grad_inverse,
            curvature*inverse+director[:,None,None]*hess_inverse+
            grad[:,:,None]*grad_inverse+grad[:,None,:]*grad_inverse[None,:,None])


def uniform_centroid(row, q):
    """Centroid and derivatives of the exact cubic-centerline dead load work."""
    a,b = row["coordinates"]
    axis = row["basis"][0]
    chord = b-a+q[6:9]-q[:3]
    ci,gi,hi = _slope(chord,*_director(q[3:6],axis),3)
    cj,gj,hj = _slope(chord,*_director(q[9:12],axis),9)
    difference,grad,hess = ci-cj,gi-gj,hi-hj
    s = float(chord@chord)
    ds = 2*CHORD_GRAD.T@chord
    # C = midpoint + (chord·chord) / 12 * (d_i/(chord·d_i) - d_j/(chord·d_j)).
    centroid = a+((b-a)+q[:3]+q[6:9])/2+s*difference/12
    centroid_grad = MID_GRAD+(s*grad+difference[:,None]*ds)/12
    centroid_hess = (s*hess+difference[:,None,None]*CHORD_LENGTH_SQUARED_HESS+
                     grad[:,:,None]*ds+grad[:,None,:]*ds[None,:,None])/12
    return centroid,centroid_grad,centroid_hess
