"""Request-local exact-key cache around the unchanged sectionproperties kernel.

Its native cache constructs/hashes twelve numpy scalars on every call. Reuse
the original result for byte-identical coordinates and quadrature positions.
The same SciPy direct factorization is also reused for byte-identical CSC
matrices and different RHS, within one mesh. Native multiplier/residual
checks remain active. No mesh, equation or convergence gate is changed.
"""
from contextlib import contextmanager
from threading import RLock

_lock=RLock()


@contextmanager
def exact_shape_cache():
    from sectionproperties.analysis import fea,solver
    from scipy.sparse.linalg import factorized
    with _lock:
        original=fea.shape_function
        original_solve=solver.sp_solve
        values={};factors={};statistics={'hits':0,'misses':0,'factorizations':0,'linear_reuses':0}
        def shape_function(coords,gauss_point):
            # Native shape_function also ignores quadrature weight (gp[0]);
            # integration still applies that weight in the unchanged caller.
            key=(coords.shape,coords.dtype.str,coords.tobytes(),tuple(gauss_point[1:]))
            if key in values:
                statistics['hits']+=1
                return values[key]
            statistics['misses']+=1
            result=original(coords=coords,gauss_point=gauss_point)
            values[key]=result
            return result
        def linear(A,b,**kwargs):
            # Only cache the same SciPy direct backend used by the library.
            # Keep its native Lagrange-multiplier error checks untouched.
            if kwargs or getattr(A,'format',None)!='csc' or b.ndim!=1:
                return original_solve(A,b,**kwargs)
            key=(A.shape,A.dtype.str,A.data.tobytes(),A.indices.tobytes(),A.indptr.tobytes())
            if key not in factors:
                factors[key]=factorized(A)
                statistics['factorizations']+=1
            else:statistics['linear_reuses']+=1
            return factors[key](b)
        fea.shape_function=shape_function
        if original_solve is solver.spsolve:solver.sp_solve=linear
        try:yield statistics
        finally:
            fea.shape_function=original
            solver.sp_solve=original_solve
            values.clear()
            factors.clear()
