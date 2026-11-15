"""Isolated physical-basis bridge, C1 snapshot 2f215534; no production adapter."""
import importlib.util
from pathlib import Path
import numpy as np
import pytest
from scipy.linalg import block_diag
from . import element

path=Path(__file__).resolve().parents[2]/'validation/m43-p6/c1_snapshot.py'
spec=importlib.util.spec_from_file_location('jpn_structural._c1_p6_snapshot',path)
c1=importlib.util.module_from_spec(spec);spec.loader.exec_module(c1)

@pytest.mark.parametrize('direction',[[1.,0.,0.],[1.,2.,.7]])
@pytest.mark.parametrize('roll',[0.,30.,90.])
def test_explicit_c1_basis_response_and_reversed_member(monkeypatch,direction,roll):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    start=np.array([.3,-.4,.2]);direction=np.array(direction);direction/=np.linalg.norm(direction)
    coordinates=np.array([start,start+2*direction]);B=c1.rolled(c1.reference_basis(*coordinates),roll)
    transform=block_diag(B.T,B.T,B.T,B.T)
    local=np.array([0,0,0,0,0,0,1e-4,2e-4,-1e-4,2e-4,-3e-4,1e-4])
    props=(2e8,2e4,7e4,8e3)
    reference=element.element_response(np.array([[0.,0.,0.],[2.,0.,0.]]),local,*props,np.eye(3))
    q=transform@local
    actual=element.element_response(coordinates,q,*props,B)
    np.testing.assert_allclose(actual['energy'],reference['energy'],rtol=1e-10,atol=1e-9)
    for k in ('force','physical_end_actions'):
        np.testing.assert_allclose(actual[k],transform@reference[k],rtol=1e-9,atol=1e-6)
    np.testing.assert_allclose(actual['tangent'],transform@reference['tangent']@transform.T,rtol=1e-9,atol=1e-6)
    # Reversing the axis requires reversing the signed roll to keep the SAME
    # anisotropic physical section, not blindly reusing its numeric roll.
    reverse=c1.rolled(c1.reference_basis(*coordinates[::-1]),-roll)
    np.testing.assert_allclose(reverse,np.diag([-1.,-1.,1.])@B,atol=1e-14)
    reversed_result=element.element_response(coordinates[::-1],q.reshape(2,6)[::-1].ravel(),*props,reverse)
    np.testing.assert_allclose(reversed_result['physical_end_actions'].reshape(2,6),actual['physical_end_actions'].reshape(2,6)[::-1],rtol=1e-9,atol=1e-6)
