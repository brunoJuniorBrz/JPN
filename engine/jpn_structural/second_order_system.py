"""Reuse elastic factors and exploit the bandwidth of the mixed tangent."""
import numpy as np
from scipy.linalg import (cho_factor, cho_solve, cholesky_banded,
                          cho_solve_banded, eig_banded, eigh)
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import reverse_cuthill_mckee

from .frame3d_model import fail

BAND_THRESHOLD = 96


def _reorder(scaled):
    rows, cols = np.nonzero(scaled)
    graph = csr_matrix((np.ones(len(rows),dtype=bool),(rows,cols)),shape=scaled.shape)
    order = reverse_cuthill_mckee(graph,symmetric_mode=True)
    inverse = np.argsort(order)
    bandwidth = int(np.max(np.abs(inverse[rows]-inverse[cols])))
    if bandwidth >= len(order)//3:
        return None
    storage = np.zeros((bandwidth+1,len(order)))
    for diagonal in range(bandwidth+1):
        storage[diagonal,:len(order)-diagonal] = scaled[order[diagonal:],order[:len(order)-diagonal]]
    return order,storage


def factor_system(matrix, free):
    """Return a reusable solve with the same scaled positive-tangent guards."""
    if not np.isfinite(matrix).all():
        fail("NUMERICAL_FAILURE","Nonfinite matrix/load.")
    epsilon = np.finfo(float).eps
    if np.linalg.norm(matrix-matrix.T)>128*len(matrix)*epsilon*max(np.linalg.norm(matrix),1e-30):
        fail("NUMERICAL_FAILURE","Nonsymmetric assembled energy matrix.")
    if not len(free):
        return lambda force: (np.zeros_like(force),1.)
    k = matrix[np.ix_(free,free)]
    diag = np.diag(k)
    if np.any(diag<=0):
        fail("UNSTABLE","Nonpositive tangent diagonal; no postbuckling result.")
    scale = np.sqrt(diag)
    scaled = k/scale[:,None]/scale[None,:]
    band = _reorder(scaled) if len(free)>=BAND_THRESHOLD else None
    if band is None:
        eig = eigh(scaled,eigvals_only=True,check_finite=False)
        smallest,largest = eig[0],eig[-1]
    else:
        order,storage = band
        smallest,largest = [
            eig_banded(storage,lower=True,eigvals_only=True,select="i",select_range=(i,i),check_finite=False)[0]
            for i in (0,len(free)-1)
        ]
    if smallest<=10*len(free)*epsilon*largest:
        fail("UNSTABLE","Mechanism or unstable tangent; no stiffness added.")
    condition = float(largest/smallest)
    if condition>1e10:
        fail("ILL_CONDITIONED","Scaled tangent exceeds 1e10.")
    if band is None:
        factor = cho_factor(scaled,check_finite=False)
    else:
        # Banded factor keeps the structural sparsity. The eigenvalue audit
        # above is independent of the solve and includes negative directions.
        factor = cholesky_banded(storage,lower=True,check_finite=False)

    def solve(force):
        if not np.isfinite(force).all():
            fail("NUMERICAL_FAILURE","Nonfinite matrix/load.")
        rhs = force[free]/scale
        displacement = np.zeros(len(matrix))
        if band is None:
            displacement[free] = cho_solve(factor,rhs,check_finite=False)/scale
        else:
            displacement[free[order]] = cho_solve_banded((factor,True),rhs[order],check_finite=False)/scale[order]
        return displacement,condition

    return solve
