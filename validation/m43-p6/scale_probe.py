"""Does the archived oracle only match because L0 = 2?  Old oracle scale vs a correct one, for several L0."""
import sys
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else ".")
from experiments.m43_p6 import element
from experiments.m43_p6.material_curvature import energy as candidate

li = np.array([.012, .02, -.025]); lj = np.array([-.01, -.015, .03])
rot = [Rotation.from_rotvec(r) for r in (li, lj)]
slopes = [r.apply([1., 0., 0.])[1:]/r.apply([1., 0., 0.])[0] for r in rot]
rolls = [2*np.arctan2(r.as_quat()[0], r.as_quat()[3]) for r in rot]

def frame(u):
    a, b = (1-4*u+3*u*u)*slopes[0]+(-2*u+3*u*u)*slopes[1]
    t = np.array([1., a, b]); t /= np.linalg.norm(t)
    y = np.array([-t[1], 1-t[1]**2/(1+t[0]), -t[1]*t[2]/(1+t[0])]); z = np.cross(t, y)
    phi = (1-u)*rolls[0]+u*rolls[1]
    return np.column_stack([t, np.cos(phi)*y+np.sin(phi)*z, -np.sin(phi)*y+np.cos(phi)*z])

GJ, EIY, EIZ = 8e3, 2e4, 1e4
def oracle(length, divide_vee_by_two, physical_prefactor, h=1e-5):
    total = 0.
    for p, w in zip(*np.polynomial.legendre.leggauss(16)):
        u = (p+1)/2; R = frame(u); dR = (frame(u+h)-frame(u-h))/(2*h); K = R.T@dR
        k = np.array([K[2, 1], K[0, 2], K[1, 0]])/(2 if divide_vee_by_two else 1)
        total += w/2*(GJ*k[0]**2+EIY*k[1]**2+EIZ*k[2]**2)
    return total/(2*length) if physical_prefactor else total

print("L0   candidate        old oracle (vee/2, no 1/2L)   ratio     correct oracle (vee, 1/2L0)   ratio")
for L in (1., 2., 6.):
    c = candidate(L, li, lj, EIY, EIZ, GJ, element.rotate, element.exponential, element.atan2, element.sin, element.cos)
    old, good = oracle(L, True, False), oracle(L, False, True)
    print(f"{L:<4g} {c:.10e}  {old:.10e}          {old/c:8.5f}  {good:.10e}          {good/c:.10f}")
