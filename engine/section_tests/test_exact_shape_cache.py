import numpy as np
import pytest
from sectionproperties.analysis import fea,solver
from scipy.sparse import csc_matrix
from jpn_structural.section_shape_cache import exact_shape_cache


def test_exact_coordinates_match_native_and_in_place_changes_do_not_reuse_stale_values():
    coords=np.array([[0.,2.,0.,1.,1.,0.],[0.,0.,2.,0.,1.,1.]])
    point=fea.gauss_points(n=4)[0];native=fea.shape_function
    expected=native(coords=coords,gauss_point=point)
    with exact_shape_cache() as statistics:
        first=fea.shape_function(coords,point)
        second=fea.shape_function(coords.copy(),point.copy())
        for a,b in zip(first,expected):np.testing.assert_array_equal(a,b)
        assert first is second
        coords[0]+=10.
        moved=fea.shape_function(coords,point)
        for a,b in zip(moved,native(coords=coords,gauss_point=point)):np.testing.assert_array_equal(a,b)
        assert statistics=={'hits':1,'misses':2,'factorizations':0,'linear_reuses':0}
    assert fea.shape_function is native


def test_restores_native_kernel_after_an_exception():
    native=fea.shape_function;solve=solver.sp_solve
    with pytest.raises(ValueError),exact_shape_cache():raise ValueError('controlled test')
    assert fea.shape_function is native
    assert solver.sp_solve is solve


def test_reuses_exact_matrix_factorization_for_distinct_rhs_and_detects_mutation():
    matrix=csc_matrix([[4.,1.],[1.,3.]])
    native=solver.sp_solve
    with exact_shape_cache() as statistics:
        for rhs in [np.array([1.,0.]),np.array([0.,1.])]:
            np.testing.assert_allclose(solver.sp_solve(matrix,rhs),native(matrix,rhs),rtol=1e-15,atol=0.)
        matrix.data[0]+=1.
        rhs=np.array([1.,2.])
        np.testing.assert_allclose(solver.sp_solve(matrix,rhs),native(matrix,rhs),rtol=1e-15,atol=0.)
        assert statistics['factorizations']==2 and statistics['linear_reuses']==1
