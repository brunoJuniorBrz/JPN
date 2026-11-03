import math
import numpy as np
import pytest
from scipy.linalg import eigh
from jpn_structural.member_buckling import global_compression
from jpn_structural.model import AnalysisError


@pytest.mark.parametrize('offset,warping',[(0.,1e-10),(.02,1e-10),(-.02,1e-10),(.2,1e-9),(.02,1e-6)])
def test_closed_normative_root_against_independent_three_dof_energy_eigenproblem(offset,warping):
    E,G,A,Iy,Iz,J,L=200e9,200e9/2.6,.001,8e-6,1.2e-6,2e-9,2.
    p=global_compression(E,G,A,Iy,Iz,J,warping,offset,L,L,L)
    r2=(Iy+Iz)/A+offset**2
    # Independent Vlasov-column generalized eigenproblem, rather than copying
    # the implemented rationalized quadratic root. Coordinates: v,z, r0*twist.
    K=np.diag([math.pi**2*E*Iy/L**2,math.pi**2*E*Iz/L**2,(G*J+math.pi**2*E*warping/L**2)/r2])
    H=np.array([[1.,0.,offset/math.sqrt(r2)],[0.,1.,0.],[offset/math.sqrt(r2),0.,1.]])
    expected=eigh(K,H,eigvals_only=True)[0]
    assert p['global_n']==pytest.approx(expected,rel=2e-13)
    assert p['global_n']<=min(p['flexure_z_n'],p['flexure_y_n'],p['torsion_n'])


def test_global_units_geometry_scaling_and_uncoupled_euler_limit():
    args=[200e9,200e9/2.6,.001,8e-6,1.2e-6,2e-9,1e-6,0.,2.,2.,2.]
    p=global_compression(*args);assert p['global_n']==pytest.approx(math.pi**2*200e9*1.2e-6/4)
    s=1000.;scaled=args.copy()
    for i,power in [(2,2),(3,4),(4,4),(5,4),(6,6),(7,1),(8,1),(9,1),(10,1)]:scaled[i]*=s**power
    q=global_compression(*scaled);assert q['global_n']==pytest.approx(p['global_n']*s*s,rel=2e-14)


@pytest.mark.parametrize('i,value',[(0,0),(2,-1),(5,float('nan')),(8,0),(10,-1)])
def test_incompatible_or_degenerate_properties_rejected(i,value):
    args=[200e9,200e9/2.6,.001,8e-6,1.2e-6,2e-9,1e-10,.02,2.,2.,2.];args[i]=value
    with pytest.raises(AnalysisError):global_compression(*args)
