"""Independent extensible Euler cantilever bifurcation, no tolerance changes."""
import numpy as np
from scipy.linalg import eigvalsh
from scipy.optimize import brentq
from . import element

def test_critical_load_refines_towards_extensible_euler_reference(monkeypatch):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    L,EA,EI,GJ=2.,2e8,1e4,8e3
    euler=np.pi**2*EI/(4*L**2)
    # Continuous Kirchhoff small lateral perturbation: P*(1-P/EA)=Euler.
    exact=2*euler/(1+np.sqrt(1-4*euler/EA))
    roots=[]
    for n in (1,2,4):
        coords=np.column_stack([np.linspace(0,L,n+1),np.zeros((n+1,2))])
        def tangent(P):
            q=np.zeros((n+1,6));q[:,0]=-P/EA*coords[:,0]
            K=np.zeros((6*(n+1),)*2)
            for i in range(n):
                dofs=np.arange(6*i,6*i+12)
                r=element.element_response(coords[i:i+2],q[i:i+2].ravel(),EA,EI,EI,GJ,np.eye(3))
                K[np.ix_(dofs,dofs)]+=r['tangent']
            return K[6:,6:]
        K0=tangent(0.)
        def lowest(P):return eigvalsh(tangent(P),K0,subset_by_index=(0,0))[0]
        assert lowest(.95*exact)>0
        assert lowest(1.05*exact)<0
        roots.append(brentq(lowest,.95*exact,1.05*exact,xtol=1e-7))
    errors=abs(np.array(roots)-exact)
    assert np.all(errors[1:]<errors[:-1])
    assert errors[-1]/exact<1e-4
    assert np.log(errors[0]/errors[1])/np.log(2)>3.5
