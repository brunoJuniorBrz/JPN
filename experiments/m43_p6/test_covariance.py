import numpy as np
import pytest
from scipy.spatial.transform import Rotation
from . import element

@pytest.mark.parametrize('rotation',[[.23,-.18,.12],[-.17,.21,.16],[.12,.09,-.28]])
def test_loaded_state_objectivity_and_physical_wrench_covariance(monkeypatch,rotation):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    x=np.array([[0.,0.,0.],[2.,0.,0.]])
    q=np.array([.00001,0,0,.001,-.002,.0003,.0001,.0003,-.0002,-.001,.001,.0004])
    params=(2e8,2e4,7e4,8e3,np.eye(3));a=element.element_response(x,q,*params)
    G=Rotation.from_rotvec(rotation);t=np.array([.3,-.2,.1]);m=q.reshape(2,6).copy()
    m[:,:3]=G.apply(x+m[:,:3])+t-x
    m[:,3:]=(G*Rotation.from_rotvec(m[:,3:])).as_rotvec()
    b=element.element_response(x,m.ravel(),*params)
    assert abs(a['energy']-b['energy'])<1e-9
    expected=G.apply(a['physical_end_actions'].reshape(4,3))
    np.testing.assert_allclose(b['physical_end_actions'].reshape(4,3),expected,rtol=1e-10,atol=1e-6)

def test_node_reversal_and_equivalent_section_axis_relabelling(monkeypatch):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    x=np.array([[0.,0.,0.],[2.,0.,0.]]);q=np.random.default_rng(27).normal(size=12)*1e-4
    props=(2e8,2e4,7e4,8e3)
    a=element.element_response(x,q,*props,np.eye(3))
    b=element.element_response(x[::-1],q.reshape(2,6)[::-1].ravel(),*props,np.diag([-1.,-1.,1.]))
    assert abs(a['energy']-b['energy'])<1e-10
    np.testing.assert_allclose(a['physical_end_actions'].reshape(2,6)[::-1],b['physical_end_actions'].reshape(2,6),rtol=1e-10,atol=1e-7)
    # Rotate section axes 90 degrees AND exchange Iy/Iz: same physical tensor.
    basis=Rotation.from_rotvec([np.pi/2,0,0]).as_matrix().T
    c=element.element_response(x,q,props[0],props[2],props[1],props[3],basis)
    assert abs(a['energy']-c['energy'])<1e-10
    np.testing.assert_allclose(a['physical_end_actions'],c['physical_end_actions'],rtol=1e-10,atol=1e-7)
