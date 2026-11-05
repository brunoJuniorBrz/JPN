"""Fault injection AFTER the real native solve; exercise the actual acceptance gate.

This proves a check vulnerability, not that PyNite naturally makes this error.
The injected residual and the supported load remain inside the input contract.
"""
import numpy as np
import pytest
from Pynite import FEModel3D

from jpn_structural.frame_pdelta import analyze_frame_pdelta
from jpn_structural.model import AnalysisError
from jpn_structural.reduced_equilibrium import reduced_equilibrium
from .test_frame_pdelta import column


@pytest.mark.parametrize('supported_load', [0., 1e9])
def test_real_native_result_with_corrupted_free_displacement_is_rejected(monkeypatch, supported_load):
    raw = column(8, .2)
    load = dict(raw['model']['nodal_loads'][0], node='N0', fx_n=0., fz_n=supported_load)
    raw['model']['nodal_loads'].append(load)
    native = FEModel3D.analyze_PDelta

    def corrupt_after_real_solve(model, *args, **kwargs):
        native(model, *args, **kwargs)
        # Return an intentionally bad free displacement while retaining the
        # unmodified native nodal state, exposing the adapter's own residual gate.
        model._D['TESTE-1'][model.nodes['N8'].ID*6, 0] += 1e-9

    monkeypatch.setattr(FEModel3D, 'analyze_PDelta', corrupt_after_real_solve)
    with pytest.raises(AnalysisError, match='Initial-stress tangent/load residual') as caught:
        analyze_frame_pdelta(raw)
    assert caught.value.code == 'NONCONVERGENCE'


def test_supported_load_does_not_change_real_valid_solution():
    raw = column(8, .2)
    a = analyze_frame_pdelta(raw)['combinations']['TESTE-1']
    raw['model']['nodal_loads'].append(dict(raw['model']['nodal_loads'][0], node='N0', fx_n=0., fz_n=1e9))
    b = analyze_frame_pdelta(raw)['combinations']['TESTE-1']
    np.testing.assert_array_equal(a['nodes']['N8']['translation_m'], b['nodes']['N8']['translation_m'])
    assert b['tangent_relative_residual'] == pytest.approx(a['tangent_relative_residual'], abs=1e-15)


@pytest.mark.parametrize('length', [.001, 1., 1000.])
@pytest.mark.parametrize('supported_load', [0., 1e12])
def test_reduced_normalizer_matches_exact_reference_and_force_moment_units(length, supported_load):
    k = np.eye(6)
    u = np.array([0., 1., 0., 0., length, 0.])
    p = np.array([supported_load, 0., 0., 1e12*length, 0., 0.])
    residual, audit = reduced_equilibrium(k, u, p, [1, 4], length)
    assert audit['relative_residual'] == 1.
    assert audit['scaled_absolute_residual_n'] == pytest.approx(2**.5)
    assert residual[1] == 1. and residual[4] == length


def test_all_restrained_has_no_free_equation_and_nonfinite_never_passes():
    assert reduced_equilibrium(np.eye(6), np.zeros(6), np.ones(6), [], 1.)[1]['relative_residual'] == 0.
    with pytest.raises(AnalysisError):
        reduced_equilibrium(np.eye(6), np.array([float('nan')]*6), np.ones(6), [1], 1.)
