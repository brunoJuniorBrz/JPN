"""Independent matrix-differentiation check of the proposed material field."""
import numpy as np
import pytest
from scipy.spatial.transform import Rotation
from . import element
from .material_curvature import energy as material_energy
from .dual import variables
from .test_pilot import X,PARAM
from . import test_pilot as historical_checks

@pytest.mark.parametrize('length',[1.,2.,6.])
def test_material_curvature_against_matrix_so3_derivative(length):
    # U = 1/(2 L0) INT_0^1 (GJ v1^2 + EIy v2^2 + EIz v3^2) du with v = vee(R^T R,u), unscaled.
    # (The former '/2' and missing 1/(2 L0) agreed only at L0 = 2 m; see test_material_curvature_oracle.py.)
    li=np.array([.012,.02,-.025]);lj=np.array([-.01,-.015,.03])
    rotations=[Rotation.from_rotvec(r) for r in (li,lj)]
    directors=[r.apply([1.,0.,0.]) for r in rotations]
    slopes=[d[1:]/d[0] for d in directors]
    rolls=[2*np.arctan2(r.as_quat()[0],r.as_quat()[3]) for r in rotations]
    def frame(u):
        a,b=(1-4*u+3*u*u)*slopes[0]+(-2*u+3*u*u)*slopes[1]
        t=np.array([1.,a,b]);t/=np.linalg.norm(t)
        y=np.array([-t[1],1-t[1]**2/(1+t[0]),-t[1]*t[2]/(1+t[0])])
        z=np.cross(t,y);phi=(1-u)*rolls[0]+u*rolls[1]
        return np.column_stack([t,np.cos(phi)*y+np.sin(phi)*z,-np.sin(phi)*y+np.cos(phi)*z])
    expected=material_energy(length,li,lj,2e4,1e4,8e3,element.rotate,element.exponential,element.atan2,element.sin,element.cos)
    errors=[]
    for h in (1e-3,1e-4,1e-5):
        total=0.
        for point,weight in zip(*np.polynomial.legendre.leggauss(16)):
            u=(point+1)/2;R=frame(u);dR=(frame(u+h)-frame(u-h))/(2*h)
            K=R.T@dR;k=np.array([K[2,1],K[0,2],K[1,0]])
            total+=weight/2*(8e3*k[0]**2+2e4*k[1]**2+1e4*k[2]**2)/(2*length)
        errors.append(abs(total-expected))
    assert errors[1]<errors[0] and min(errors)<1e-7

@pytest.mark.parametrize('h',[1e-4,1e-5,1e-6])
def test_material_energy_gradient_hessian_sensitivity(monkeypatch,h):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    q=np.random.default_rng(73).normal(size=12)*1e-4
    d=np.random.default_rng(2).normal(size=12);d/=np.linalg.norm(d)
    r=element.element_response(X,q,*PARAM)
    a=element.energy_state(X,variables(q+h*d),*PARAM)[0]
    b=element.energy_state(X,variables(q-h*d),*PARAM)[0]
    ah=element.energy_state(X,variables(q+h/2*d),*PARAM)[0]
    bh=element.energy_state(X,variables(q-h/2*d),*PARAM)[0]
    coarse=(a.g-b.g)/(2*h);fine=(ah.g-bh.g)/h
    # Remove the O(h²) CENTRAL-DIFFERENCE truncation term only in this
    # independent derivative check. No solver force or benchmark is corrected.
    corrected=(4*fine-coarse)/3
    np.testing.assert_allclose(corrected,r['tangent']@d,rtol=1e-6,atol=1e-4)
    work=(4*(ah.v-bh.v)/h-(a.v-b.v)/(2*h))/3
    assert abs(work-r['force']@d)<1e-3
    if h==1e-4:
        error=np.max(abs(coarse-r['tangent']@d));refined=np.max(abs(fine-r['tangent']@d))
        assert 3.9<error/refined<4.1

@pytest.mark.parametrize('seed',range(8))
def test_material_physical_balance_and_ad_orders(monkeypatch,seed):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    historical_checks.test_gradient_tangent_and_physical_balance(seed)

@pytest.mark.parametrize('check',[
    historical_checks.test_finite_rigid_motion_objectivity,
    historical_checks.test_analytical_extension_and_torsion,
    historical_checks.test_tangent_detects_loss_of_stability_without_relaxing_gate,
])
def test_material_analytical_and_instability_controls(monkeypatch,check):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    check()
