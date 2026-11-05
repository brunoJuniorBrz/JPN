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


def test_refinement_targets_original_pencil_despite_scaled_rounding():
    # A few ulps of symmetric scaled rounding shift the inverse root
    # along a soft direction. Refining that rounded pencil cannot correct
    # the residual of the original matrices. K has exact eigenvector [1,-1].
    k=np.array([[1.,1.-1e-8],[1.-1e-8,1.]])
    g=np.eye(2);ks=k.copy()
    ks[0,1]=ks[1,0]=k[0,1]+4*np.spacing(k[0,1])
    root=1.-k[0,1];rounded_root=1.-ks[0,1]
    v=np.array([1.,-1.])/np.sqrt(2*rounded_root)
    corrected,mu,steps=_refine_inverse_pair(k,g,ks,g,np.ones(2),v,1/rounded_root)
    assert 1<=steps<=3
    assert 1/mu==pytest.approx(root,rel=1e-8)
    assert np.linalg.norm(k@corrected-g@corrected/mu)/(np.linalg.norm(k@corrected)+np.linalg.norm(g@corrected)/mu)<=1e-8
