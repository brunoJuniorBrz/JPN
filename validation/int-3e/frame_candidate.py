"""Experimental analytic P4 frame tangent, kept outside the worker.

The six strain coordinates are the reference chord extension with its
Hermite arc term, torsion and the two pairs of end bending rotations.
For m = dE/de, B = de/dq the tangent is B.T D B + sum(m_i H_i).
Here H_i are the explicit chord, normalization, and SO(3) curvatures.
"""
from typing import NamedTuple

import numpy as np
from scipy.spatial.transform import Rotation

from jpn_structural.frame3d_model import fail
from jpn_structural.second_order_uniform import _quaternion_coefficients
from jpn_structural.spatial_corotational import left_jacobian


class Kinematics(NamedTuple):
    value: np.ndarray
    jacobian: np.ndarray
    curvature: np.ndarray


def _select(c, selection):
    return Kinematics(*(value[:,selection] for value in c))


def _join(a,b):
    return Kinematics(*(np.concatenate((x,y),axis=1) for x,y in zip(a,b)))


def _multiply(a,b,operation):
    # Bilinear vector fields use the explicit product rule for each physical
    # operation below (dot, cross, and quaternion composition).
    av,ag,ah = a
    bv,bg,bh = b
    mixed = operation(ag[:,:,:,None],bg[:,:,None,:])
    return Kinematics(operation(av,bv),
                      operation(ag,bv[:,:,None])+operation(av[:,:,None],bg),
                      operation(ah,bv[:,:,None,None])+operation(av[:,:,None,None],bh)+mixed+mixed.swapaxes(-2,-1))


def _dot(a,b):
    return (a*b).sum(axis=1,keepdims=True)


def _cross(a,b):
    ax,ay,az = a[:,0],a[:,1],a[:,2]
    bx,by,bz = b[:,0],b[:,1],b[:,2]
    return np.stack((ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx),axis=1)


def _quaternion_product(a,b):
    av,bv = a[:,1:],b[:,1:]
    return np.concatenate((a[:,:1]*b[:,:1]-_dot(av,bv),
                           a[:,:1]*bv+b[:,:1]*av+_cross(av,bv)),axis=1)


def _conjugate(q):
    return Kinematics(*(np.concatenate((p[:,:1],-p[:,1:]),axis=1) for p in q))


def _radial(s,value,first,second):
    _,g,h = s
    return Kinematics(value,first[:,:,None]*g,
                      first[:,:,None,None]*h+second[:,:,None,None]*(g[:,:,:,None]*g[:,:,None,:]))


def _normalize(c,minimum,code):
    v,g,h = c
    r = np.linalg.norm(v,axis=1)
    if np.any(r<=minimum):
        fail(code,"Degenerate rotation or chord.")
    u = v/r[:,None]
    dr = (u[:,:,None]*g).sum(axis=1)
    du = (g-u[:,:,None]*dr[:,None,:])/r[:,None,None]
    ddr = ((g[:,:,:,None]*g[:,:,None,:]+v[:,:,None,None]*h).sum(axis=1)-
           dr[:,:,None]*dr[:,None,:])/r[:,None,None]
    ddu = (h-u[:,:,None,None]*ddr[:,None,:,:]-du[:,:,:,None]*dr[:,None,None,:]-
           du[:,:,None,:]*dr[:,None,:,None])/r[:,None,None,None]
    length = Kinematics(r[:,None],dr[:,None,:],ddr[:,None,:,:])
    return length,Kinematics(u,du,ddu)


def _end_quaternion(rotation):
    s = _multiply(rotation,rotation,_dot)
    w,a = np.array([_quaternion_coefficients(t) for t in s.value[:,0]]).transpose(1,2,0)[...,None]
    return _join(_radial(s,*w),_multiply(_radial(s,*a),rotation,np.multiply))


def _rotation_vector(quaternion):
    w = _select(quaternion,slice(0,1))
    if np.any(w.value<=0.):
        fail("SPATIAL_ROTATION_BRANCH","Logarithm outside the validated principal branch.")
    vector = _select(quaternion,slice(1,None))
    inverse = 1/w.value
    r = _multiply(vector,_radial(w,inverse,-inverse**2,2*inverse**3),np.multiply)
    s = _multiply(r,r,_dot)
    z = s.value
    t = np.sqrt(np.maximum(z,1e-12))
    f = 2*np.arctan(t)/t
    df = (2/(1+z)-f)/(2*np.maximum(z,1e-12))
    ddf = (-2/(1+z)**2-3*df)/(2*np.maximum(z,1e-12))
    small = (vector.value**2).sum(axis=1,keepdims=True)<1e-8
    f = np.where(small,2-2*z/3+2*z*z/5,f)
    series = z<.001
    df = np.where(series,-2/3+4*z/5-6*z*z/7+8*z**3/9-10*z**4/11,df)
    ddf = np.where(series,4/5-12*z/7+24*z*z/9-40*z**3/11+60*z**4/13,ddf)
    df = np.where(small,-2/3+4*z/5,df)
    ddf = np.where(small,.8,ddf)
    return _multiply(_radial(s,f,df,ddf),r,np.multiply)


def _fixed(c,values):
    v = np.broadcast_to(values,(len(c.value),len(values)))
    return Kinematics(v,np.zeros((*v.shape,12)),np.zeros((*v.shape,12,12)))


def _bend(ai,aj,ii,ij):
    """d² of ii*(ai*ai+aj*aj)+ij*ai*aj, componentwise."""
    vi,gi,hi = ai
    vj,gj,hj = aj
    mi,mj = 2*ii*vi+ij*vj,2*ii*vj+ij*vi
    mixed = gi[:,:,:,None]*gj[:,:,None,:]
    value = ii*(vi*vi+vj*vj)+ij*vi*vj
    grad = mi[:,:,None]*gi+mj[:,:,None]*gj
    hess = mi[:,:,None,None]*hi+mj[:,:,None,None]*hj
    hess += (2*ii)[:,:,None,None]*(gi[:,:,:,None]*gi[:,:,None,:]+gj[:,:,:,None]*gj[:,:,None,:])
    hess += ij[:,:,None,None]*(mixed+mixed.swapaxes(-2,-1))
    return Kinematics(value,grad,hess)


def frame_tangent(q,length0,ea,eiy,eiz,gj):
    """Energy derivatives in fixed local axes, for work at actual end coordinates."""
    if not np.isfinite(q).all():
        fail("SPATIAL_NONFINITE","Nonfinite frame coordinates.")
    n = len(q)
    coordinates = Kinematics(q,np.broadcast_to(np.eye(12),(n,12,12)),
                              np.zeros((n,12,12,12)))
    a = _select(coordinates,slice(0,3))
    b = _select(coordinates,slice(6,9))
    delta = b.value-a.value
    initial = np.zeros((n,3))
    initial[:,0] = length0
    chord = Kinematics(initial+delta,b.jacobian-a.jacobian,a.curvature)
    length,axis = _normalize(chord,1e-5,"SPATIAL_DEGENERATE_CHORD")
    qi = _end_quaternion(_select(coordinates,slice(3,6)))
    qj = _end_quaternion(_select(coordinates,slice(9,12)))
    if np.any((qi.value*qj.value).sum(axis=1)<=.05):
        fail("SPATIAL_ROTATION_BRANCH","Ambiguous mean director.")
    _,mean = _normalize(Kinematics(*(i+j for i,j in zip(qi,qj))),1e-8,"SPATIAL_ROTATION_SINGULAR")
    director = _select(_multiply(_multiply(mean,_fixed(mean,[0.,1.,0.,0.]),_quaternion_product),
                                 _conjugate(mean),_quaternion_product),slice(1,None))
    product = _multiply(director,axis,_dot)
    dot = Kinematics(1+product.value,product.jacobian,product.curvature)
    _,alignment = _normalize(_join(dot,_multiply(director,axis,_cross)),1e-8,"SPATIAL_ROTATION_SINGULAR")
    frame = _multiply(alignment,mean,_quaternion_product)
    inverse = _conjugate(frame)
    li = _rotation_vector(_multiply(inverse,qi,_quaternion_product))
    lj = _rotation_vector(_multiply(inverse,qj,_quaternion_product))
    bend_i,bend_j = (_select(c,slice(1,None)) for c in (li,lj))
    arc_coeff = np.broadcast_to(length0[:,None]/30,(n,2))
    arc = _bend(bend_i,bend_j,2*arc_coeff,-arc_coeff)
    stable_extension = ((2*initial*delta+delta*delta).sum(axis=1)/(length.value[:,0]+length0))
    strain = Kinematics((stable_extension+arc.value.sum(axis=1))[:,None],
                        length.jacobian+arc.jacobian.sum(axis=1,keepdims=True),
                        length.curvature+arc.curvature.sum(axis=1,keepdims=True))
    if (np.any(abs(strain.value[:,0])>.01*length0) or
            np.any(abs(li.value)>.05) or np.any(abs(lj.value)>.05)):
        fail("SPATIAL_STRAIN_LIMIT","Outside the elastic small-strain frame domain.")
    torsion = Kinematics(*(j-i for i,j in zip(_select(li,slice(0,1)),_select(lj,slice(0,1)))))
    stiffness = np.stack((ea/length0,gj/length0),axis=1)
    deform = _join(strain,torsion)
    efforts = stiffness*deform.value
    bending = 2*np.stack((eiy,eiz),axis=1)/length0[:,None]
    bend = _bend(bend_i,bend_j,bending,bending)
    force = (efforts[:,:,None]*deform.jacobian).sum(axis=1)+bend.jacobian.sum(axis=1)
    tangent = (deform.jacobian[:,:,:,None]*stiffness[:,:,None,None]*deform.jacobian[:,:,None,:]+
               efforts[:,:,None,None]*deform.curvature).sum(axis=1)+bend.curvature.sum(axis=1)
    if not np.isfinite(force).all() or not np.isfinite(tangent).all():
        fail("SPATIAL_NONFINITE","Nonfinite analytical frame tangent.")
    return force,tangent,frame.value,efforts[:,0]


def frame_responses(rows, q):
    basis = np.stack([e["basis"] for e in rows])
    length = np.linalg.norm([e["coordinates"][1]-e["coordinates"][0] for e in rows],axis=1)
    transform = np.einsum("ij,bkl->bikjl",np.eye(4),basis).reshape(-1,12,12)
    local = (transform@np.array(q)[:,:,None])[:,:,0]
    materials = [np.array([e[k] for e in rows]) for k in ("ea","eiy","eiz","gj")]
    force,tangent,quaternion,axial = frame_tangent(local,length,*materials)
    physical = force.copy()
    for start in (3,9):
        indices = slice(start,start+3)
        spin_map = np.stack([left_jacobian(v).T for v in local[:,indices]])
        physical[:,indices] = np.linalg.solve(spin_map,force[:,indices,None])[:,:,0]
    inverse = transform.swapaxes(1,2)
    global_force = (inverse@force[:,:,None])[:,:,0]
    global_actions = (inverse@physical[:,:,None])[:,:,0]
    tangent = inverse@tangent@transform
    current = Rotation.from_quat(quaternion[:,[1,2,3,0]]).as_matrix().swapaxes(1,2)@basis
    return [dict(force=f,tangent=k,physical_end_actions=p,current_basis=b,axial_n=n)
            for f,k,p,b,n in zip(global_force,tangent,global_actions,current,axial)]
