import numpy as np
import pytest
from . import element,material_curvature,arc

@pytest.mark.parametrize('seed',range(12))
def test_reused_inverse_jets_preserve_full_response(monkeypatch,seed):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    x=np.array([[0.,0.,0.],[2.,0.,0.]])
    q=np.random.default_rng(seed).normal(size=12)*1e-4
    args=(x,q,2e8,2e4,7e4,8e3,np.eye(3))
    monkeypatch.setattr(material_curvature,'REUSE_RECIPROCALS',False)
    a=element.element_response(*args)
    monkeypatch.setattr(material_curvature,'REUSE_RECIPROCALS',True)
    b=element.element_response(*args)
    for k in ('energy','force','tangent','physical_end_actions'):
        np.testing.assert_array_equal(a[k],b[k])

@pytest.mark.parametrize('seed',range(4))
def test_same_state_quadrature_8_16_32(monkeypatch,seed):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',True)
    x=np.array([[0.,0.,0.],[2.,0.,0.]])
    q=np.random.default_rng(seed+10).normal(size=12)*1e-4
    answers=[]
    for n in (8,16,32):
        p,w=np.polynomial.legendre.leggauss(n)
        monkeypatch.setattr(material_curvature,'POINTS',p);monkeypatch.setattr(material_curvature,'WEIGHTS',w)
        monkeypatch.setattr(arc,'POINTS',p);monkeypatch.setattr(arc,'WEIGHTS',w)
        answers.append(element.element_response(x,q,2e8,2e4,7e4,8e3,np.eye(3)))
    for a in answers[1:]:
        for k in ('energy','force','tangent','physical_end_actions'):
            np.testing.assert_allclose(a[k],answers[0][k],rtol=1e-12,atol=1e-7)
