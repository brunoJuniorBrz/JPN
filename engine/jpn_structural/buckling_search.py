"""Bounded diagnostic refinement of sampled wavelength valleys.

The continuous signature and L/m integer-wave member spectrum are DIFFERENT
domains. This diagnostic never replaces the finite-member critical values,
certifies a global minimum or feeds a resistant approval.
"""
import math

from scipy.optimize import minimize_scalar

from .frame3d_model import fail, number


def refine_wavelength_valleys(evaluate, wavelengths, *, max_evaluations=120, relative_coordinate_target=1e-4):
    if type(wavelengths) is not list or not 3 <= len(wavelengths) <= 64:
        fail('INPUT_LIMIT', '3 to 64 explicit initial wavelengths required.')
    if type(max_evaluations) is not int or not len(wavelengths) <= max_evaluations <= 120:
        fail('INPUT_LIMIT', 'At most 120 objective evaluations, including the initial grid.')
    number(relative_coordinate_target, 1e-6, .01, 'relative log-coordinate target')
    for value in wavelengths:
        number(value, .001, 1e6, 'half wavelength mm')
    if any(a >= b for a, b in zip(wavelengths, wavelengths[1:])):
        fail('INVALID_INPUT', 'Initial wavelengths must be strictly increasing.')
    cache = {}

    def objective(log_length):
        length = math.exp(log_length)
        if log_length not in cache:
            if len(cache) >= max_evaluations:
                fail('BUCKLING_SEARCH_LIMIT', 'Evaluation budget exhausted; no minimum admitted.')
            value = float(evaluate(length))
            if not math.isfinite(value) or value <= 0:
                fail('NUMERICAL_FAILURE', 'Nonfinite/nonpositive buckling objective.')
            cache[log_length] = value
        return cache[log_length]

    grid = [math.log(value) for value in wavelengths]
    initial = [objective(x) for x in grid]
    brackets = [i for i in range(1, len(grid)-1)
                if initial[i] <= min(initial[i-1], initial[i+1])
                and initial[i] < max(initial[i-1], initial[i+1])]
    refined = []
    for i in brackets:
        remaining = max_evaluations-len(cache)
        if remaining < 3:
            fail('BUCKLING_SEARCH_LIMIT', 'Insufficient evaluations to refine all sampled valleys.')
        result = minimize_scalar(objective, bounds=(grid[i-1], grid[i+1]), method='bounded',
            options=dict(xatol=math.log1p(relative_coordinate_target)/3, maxiter=remaining))
        if not result.success:
            fail('BUCKLING_SEARCH_LIMIT', 'Bounded optimizer did not converge within its coordinate/evaluation limits.')
        refined.append(dict(half_wavelength_mm=math.exp(float(result.x)), value=float(result.fun),
                            initial_bracket_mm=[wavelengths[i-1], wavelengths[i+1]]))
    best_x = min(cache, key=cache.get)
    return dict(schema_version='jpn.wavelength-refinement/1',
        status='refined-sampled-valleys' if refined else 'no-sampled-interior-valley',
        best=dict(half_wavelength_mm=math.exp(best_x), value=cache[best_x]),
        initial_grid_mm=wavelengths, initial_values=initial, refined_valleys=refined,
        evaluations=[dict(half_wavelength_mm=math.exp(x), value=y) for x, y in sorted(cache.items())],
        evaluation_count=len(cache), relative_coordinate_target=relative_coordinate_target,
        optimizer='scipy.optimize.minimize_scalar/bounded/log-wavelength',
        boundary_is_initial_best=min(range(len(initial)), key=initial.__getitem__) in (0, len(initial)-1),
        global_minimum_certified=False, physical_integer_wave_spectrum_verified=False,
        normative_resistance_verified=False, approved_for_fabrication=False)
