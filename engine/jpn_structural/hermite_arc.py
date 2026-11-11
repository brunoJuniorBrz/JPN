"""Own conservative Hermite shallow-arc correction; P3 stays unchanged.

In the current corotational chord frame, v(0)=v(L)=0 and end slopes beta.
1/2 integral(v'^2 dx) = L/30*(2*bi^2-bi*bj+2*bj^2).
This changes the strain ENERGY and both of its derivatives, not recovered
end forces after a solve. Retained local slope order is explicitly quadratic.
"""
import numpy as np
from .corotational_planar import element_response as p3_element


def element_response(x, q, ea, ei):
    base = p3_element(x, q, ea, ei)
    old = base["basic_deformation"]
    length0 = float(np.linalg.norm(x[1]-x[0]))
    length = base["current_length_m"]
    normal = base["chord"]
    bi, bj = old[1:]
    arc = length0/30*(2*bi*bi-bi*bj+2*bj*bj)
    b = old.copy()
    b[0] += arc
    c = np.array([[ea/length0, 0., 0.], [0., 4*ei/length0, 2*ei/length0],
                  [0., 2*ei/length0, 4*ei/length0]])
    a = np.eye(3)
    a[0, 1:] = length0/30*np.array([4*bi-bj, 4*bj-bi])
    ha = np.zeros((3, 3))
    ha[1:, 1:] = length0/30*np.array([[4., -1.], [-1., 4.]])
    constitutive = c@b
    conjugate = a.T@constitutive
    db = a.T@c@a+constitutive[0]*ha
    d = np.array([[-1., 0., 0., 1., 0., 0.], [0., -1., 0., 0., 1., 0.]])
    g_angle = np.array([-normal[1], normal[0]])/length
    jac = np.zeros((3, 6))
    jac[0] = normal@d
    jac[1] = jac[2] = -g_angle@d
    jac[1, 2] = jac[2, 5] = 1.
    h_length = (np.eye(2)-np.outer(normal, normal))/length
    xx, zz = normal*length
    h_angle = np.array([[2*xx*zz, zz*zz-xx*xx], [zz*zz-xx*xx, -2*xx*zz]])/length**4
    geometric = d.T@(conjugate[0]*h_length-(conjugate[1]+conjugate[2])*h_angle)@d
    material = jac.T@db@jac
    return dict(force=jac.T@conjugate, tangent=material+geometric, material=material, geometric=geometric,
                basic_deformation=b, basic_force=conjugate, constitutive_force=constitutive,
                chord=normal, current_length_m=length, energy=float(.5*b@constitutive),
                arc_extension_m=float(arc))
