"""Independent validation of inputs emitted by the TypeScript connectivity adapter.

Regenerate: JPN_EXPORT_ADAPTER_FIXTURES=1 vitest run spatial-connectivity.test.ts
No stiffness formulation or coordinate bases are copied into these references.
"""
import copy
import json
from pathlib import Path
import time
import numpy as np
import pytest
from jpn_structural.frame3d import analyze_frame3d
from jpn_structural.model import AnalysisError


def fixture(name):
    return json.loads((Path(__file__).parents[1] / f'examples/spatial-adapted-{name}.json').read_text(encoding='utf-8'))


def equilibrium_independent(p, r):
    forces = np.zeros(3); moments = np.zeros(3)
    for n in p['nodes']:
        reaction = r['nodes'][n['id']]
        f = np.array(reaction['force_n']); m = np.array(reaction['moment_nm'])
        for load in p['nodal_loads']:
            if load['node'] == n['id']:
                # These fixtures have a single explicit case with factor 1.
                f += [load[k] for k in ('fx_n', 'fy_n', 'fz_n')]
                m += [load[k] for k in ('mx_nm', 'my_nm', 'mz_nm')]
        forces += f
        moments += m + np.cross([n[k] for k in ('x_m', 'y_m', 'z_m')], f)
    np.testing.assert_allclose(forces, 0, atol=1e-6)
    np.testing.assert_allclose(moments, 0, atol=1e-5)


@pytest.mark.parametrize('sign', (-1, 1))
def test_segmented_cantilever_point_load_analytical(sign):
    p = fixture('tee'); p['nodal_loads'][0]['fz_n'] *= sign
    r = analyze_frame3d(p)['combinations']['TESTE-1']
    force = -1000 * sign; a = 2.; length = 4.
    ei = 200e9 * 8e-5
    assert r['nodes']['C']['translation_m'][2] == pytest.approx(force * a**3 / (3 * ei), rel=1e-10)
    assert r['nodes']['B']['translation_m'][2] == pytest.approx(force * a**2 * (3 * length - a) / (6 * ei), rel=1e-10)
    assert r['nodes']['B']['rotation_rad'][1] == pytest.approx(-force * a**2 / (2 * ei), rel=1e-10)
    assert r['nodes']['A']['force_n'][2] == pytest.approx(-force, rel=1e-10)
    assert r['nodes']['A']['moment_nm'][1] == pytest.approx(force * a, rel=1e-10)
    assert abs(r['members']['BEAM:S1']['stations'][0]['my_nm']) == pytest.approx(abs(force * a), rel=1e-10)
    assert np.linalg.norm(r['members']['BRANCH']['end_actions_local']) < 1e-6
    assert np.linalg.norm(r['members']['BEAM:S2']['end_actions_local']) < 1e-6
    equilibrium_independent(p, r)


def test_generated_roof_explicit_frames_equilibrium_scaling_and_stability():
    p = fixture('roof'); started = time.perf_counter(); result = analyze_frame3d(p)
    elapsed = time.perf_counter() - started
    assert len(p['nodes']) > 100 and len(p['members']) > 200
    assert elapsed < 20  # Same hard service wall-time budget, not a design criterion.
    r = result['combinations']['TESTE-1']; equilibrium_independent(p, r)
    assert result['diagnostics']['free_dofs'] > 600
    assert 1 <= result['diagnostics']['scaled_condition'] < 1e10
    assert max(np.linalg.norm(n['translation_m']) for n in r['nodes'].values()) > 0
    q = copy.deepcopy(p)
    for load in q['nodal_loads']:
        for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm'):
            load[k] *= -2
    scaled = analyze_frame3d(q)['combinations']['TESTE-1']
    for nid in r['nodes']:
        for quantity in ('translation_m', 'rotation_rad', 'force_n', 'moment_nm'):
            np.testing.assert_allclose(scaled['nodes'][nid][quantity], -2 * np.array(r['nodes'][nid][quantity]), rtol=1e-8, atol=1e-8)
    q['supports'] = []
    with pytest.raises(AnalysisError) as error:
        analyze_frame3d(q)
    assert error.value.code == 'UNSTABLE'
