import numpy as np
import pytest

from jpn_structural.constrained_modes import _refine_inverse_pair


def test_bordered_correction_recovers_independent_exact_diagonal_root():
    # K=diag(4,9), G=diag(2,1): inverse roots 1/2 and 1/9.
    # Start from an intentionally inaccurate approximation to the largest root.
    k=np.diag([4.,9.]);g=np.diag([2.,1.]);scale=np.array([2.,3.])
    ks=k/np.outer(scale,scale);gs=g/np.outer(scale,scale)
    v=np.array([1.,1e-4]);v/=np.linalg.norm(v)
    corrected,mu,steps=_refine_inverse_pair(k,g,ks,gs,scale,v,.4999)
    assert 1<=steps<=3
    assert 1/mu==pytest.approx(2.,rel=1e-12)
    p=corrected/scale
    assert np.linalg.norm(k@p-2*g@p)/(np.linalg.norm(k@p)+2*np.linalg.norm(g@p))<=1e-8


def test_an_exact_pair_is_retained_without_newton_or_mode_change():
    k=np.diag([4.,9.]);g=np.diag([2.,1.]);scale=np.array([2.,3.])
    v,mu,steps=_refine_inverse_pair(k,g,k/np.outer(scale,scale),g/np.outer(scale,scale),scale,np.array([1.,0.]),.5)
    np.testing.assert_array_equal(v,[1.,0.]);assert mu==.5 and steps==0
