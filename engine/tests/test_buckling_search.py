"""Independent plate energy, scale invariance and adversarial search controls."""
import math

import pytest

from jpn_structural.buckling_search import refine_wavelength_valleys
from jpn_structural.model import AnalysisError


def test_off_grid_plate_minimum_from_exact_kirchhoff_energy():
    # Isotropic simply supported plate: k=(b/a+a/b)^2, minimum k=4 at a=b.
    # The expected minimum is an analytical stationary point, not our optimizer.
    E, nu, t, b = 200000., .3, 1., 173.
    constant = math.pi**2*E/(12*(1-nu**2))*(t/b)**2
    result = refine_wavelength_valleys(lambda a:constant*(b/a+a/b)**2,
                                       [40., 80., 120., 240., 480., 960.])
    assert result['best']['half_wavelength_mm'] == pytest.approx(b, rel=1e-4)
    assert result['best']['value'] == pytest.approx(4*constant, rel=1e-8)
    assert result['best']['value'] < min(result['initial_values'])
    assert not result['global_minimum_certified']


def test_multiple_sampled_valleys_and_change_of_length_scale():
    def objective(a):
        x = math.log(a)
        return 2+(x-math.log(10))**2*(x-math.log(1000))**2
    grid = [1., 5., 20., 100., 500., 2000., 10000.]
    result = refine_wavelength_valleys(objective, grid)
    assert len(result['refined_valleys']) == 2
    assert result['best']['value'] == pytest.approx(2., abs=1e-8)
    scaled = refine_wavelength_valleys(lambda a:objective(a/10), [a*10 for a in grid])
    assert scaled['best']['value'] == pytest.approx(result['best']['value'], rel=1e-9)
    assert result['evaluation_count'] <= 120


def test_monotone_curve_and_unseen_valleys_do_not_certify_global_minimum():
    out = refine_wavelength_valleys(lambda a:1+1/a, [1., 10., 100.])
    assert out['boundary_is_initial_best']
    assert out['status'] == 'no-sampled-interior-valley'
    assert not out['physical_integer_wave_spectrum_verified']


@pytest.mark.parametrize('grid', [[1.,1.,2.], [3.,2.,1.], [1.,2.], [0.,1.,2.], [1.,2.,float('nan')]])
def test_invalid_search_domains_fail_controlled(grid):
    with pytest.raises(AnalysisError):
        refine_wavelength_valleys(lambda a:1+a*a, grid)


def test_budget_exhaustion_and_invalid_eigenvalues_are_not_convergence():
    with pytest.raises(AnalysisError, match='evaluations'):
        refine_wavelength_valleys(lambda a:1+(a-2)**2, [1.,2.,3.], max_evaluations=3)
    for bad in (0., -1., float('nan'), float('inf')):
        with pytest.raises(AnalysisError):
            refine_wavelength_valleys(lambda a:bad, [1.,2.,3.])
