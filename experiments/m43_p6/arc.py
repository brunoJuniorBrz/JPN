"""Three-dimensional chord-Hermite centreline length, stable near zero slope.

Endpoint slopes come from rotated directors, not rotation-vector components.
This fixes the kinematic length functional only; bending/twist laws still need
independent validation. Eight Gauss points, never tuned to benchmark outcomes.
"""
import numpy as np
POINTS,WEIGHTS=np.polynomial.legendre.leggauss(8)

def extension(length,li,lj,rotate,exponential):
    di,dj=[rotate(exponential(r),[1.,0.,0.]) for r in (li,lj)]
    si=[di[k]/di[0] for k in (1,2)];sj=[dj[k]/dj[0] for k in (1,2)]
    ii=sum(s*s for s in si);jj=sum(s*s for s in sj);ij=sum(a*b for a,b in zip(si,sj))
    excess=0.
    for point,weight in zip(POINTS,WEIGHTS):
        t=(float(point)+1)/2
        a,b=1-4*t+3*t*t,-2*t+3*t*t
        s2=a*a*ii+2*a*b*ij+b*b*jj
        excess+=float(weight)/2*s2/((1+s2)**.5+1)
    return length*excess
