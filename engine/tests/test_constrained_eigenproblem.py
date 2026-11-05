"""Independent diagonal spectra and coordinate-change adversarial controls."""
import numpy as np
import pytest

from jpn_structural.constrained_modes import constrained_eigenpair
from jpn_structural.model import AnalysisError


@pytest.mark.parametrize('factor', [1e-10, 1., 1e10])
@pytest.mark.parametrize('change', [np.eye(3), np.array([[1.,.1,2.],[0.,2.,3.],[0.,0.,.3]])])
def test_null_geometric_direction_and_nonorthogonal_modal_coordinates(factor, change):
    # Exact generalized spectrum: infinity, 3, 8. A zero geometric-work
    # direction is not a negative-energy mode and must not become the metric.
    elastic = np.diag([2.,9.,16.])*factor
    geometric = np.diag([0.,3.,2.])*factor
    critical, mode, audit = constrained_eigenpair(elastic, geometric, change)
    assert critical == pytest.approx(3., rel=1e-12)
    assert abs(mode[0])+abs(mode[2]) <= 1e-10*abs(mode[1])
    assert audit['projected_relative_residual'] <= 1e-8


def test_constraint_subspace_matches_exact_rayleigh_ritz_solution():
    # Admissible u=(a,b,a). Energies: 18*a²+9*b² and 2*a²+3*b²;
    # exact constrained eigenvalues are 9 and 3. No production oracle used.
    basis = np.array([[1.,0.],[0.,1.],[1.,0.]])
    critical, _, audit = constrained_eigenpair(np.diag([2.,9.,16.]), np.diag([0.,3.,2.]), basis)
    assert critical == pytest.approx(3., rel=1e-13)
    assert audit['modal_rank'] == 2


@pytest.mark.parametrize('kind', ['rank', 'negative-elastic', 'zero-geometric', 'nan'])
def test_unresolvable_or_incompatible_spectra_fail_closed(kind):
    k, g, r = np.eye(3), np.eye(3), np.eye(3)
    if kind == 'rank':r[:,1] = r[:,0]
    elif kind == 'negative-elastic':k[0,0] = -1.
    elif kind == 'zero-geometric':g[:] = 0.
    else:k[0,0] = np.nan
    with pytest.raises(AnalysisError):
        constrained_eigenpair(k,g,r)
