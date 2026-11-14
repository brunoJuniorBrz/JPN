"""Bootstrap the unchanged section worker with symmetric sparse ordering.

I-section Lagrange matrices develop excessive LU fill with default COLAMD.
Only SuperLU's permutation changes: same matrix, RHS, exact factorization cache,
mesh/refinement and native residual/multiplier checks. No C1 engine file edited.
The native worker still installs and verifies its original OS memory cap BEFORE
SciPy is imported, and still owns parsing, dispatch, errors and output limits.
"""
from pathlib import Path
import runpy
import sys

engine = Path(__file__).resolve().parents[1]/'engine'
sys.path.insert(0, str(engine))
import local_mixed_worker  # noqa: E402

original_limit = local_mixed_worker.memory_limit


def limited_symmetric_ordering():
    limits = original_limit()
    import scipy.sparse.linalg as sparse

    def factorized(matrix):
        return sparse.splu(matrix, permc_spec='MMD_AT_PLUS_A').solve

    sparse.factorized = factorized
    return limits


local_mixed_worker.memory_limit = limited_symmetric_ordering
runpy.run_path(str(engine/'section_worker.py'), run_name='__main__')
