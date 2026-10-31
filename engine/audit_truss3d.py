"""Reproduce PR #14 reference errors and a bounded 100-node axial benchmark.

Validation utility only; not an HTTP service or mixed structural solver.
Run with OPENBLAS_NUM_THREADS=OMP_NUM_THREADS=MKL_NUM_THREADS=1.
"""
import copy
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import sys
import time
import tracemalloc
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from jpn_structural.truss3d import analyze_truss3d
from benchmark_spatial import peak_rss
from tests.test_truss3d import tetra
from tests.truss3d_reference import tripod, tripod_analytic, pynite_truss


def grid():
    p = tripod()
    p['nodes'], p['members'], p['supports'], p['loads'] = [], [], [], []
    for i in range(5):
        for j in range(5):
            for k in range(4):
                nid = f'N{i}-{j}-{k}'
                p['nodes'].append(dict(id=nid, x_m=i * 2., y_m=j * 3., z_m=k * 4.))
                # Explicit synthetic lateral supports at EVERY node; no inferred
                # brace or stiffness. X fixed only at the start of each chain.
                p['supports'].append(dict(node=nid, restrained=[i == 0, True, True]))
                if i == 4:
                    p['loads'].append(dict(node=nid, fx_n=1000., fy_n=0., fz_n=0.))
                for a, b, c, active in [(i - 1, j, k, i > 0), (i, j - 1, k, j > 0), (i, j, k - 1, k > 0)]:
                    if active:
                        p['members'].append(dict(id=f'M{len(p["members"])}', start=f'N{a}-{b}-{c}', end=nid,
                                                 e_pa=200e9, area_m2=.01, source='Synthetic benchmark only', revision='1'))
    p['project']['source'] = '100-node benchmark with all Y/Z translations explicitly restrained'
    return p


def audit():
    comparisons = []
    for name, p in [('tripod-analytic', tripod()), ('tetrahedron', tetra())]:
        r, ref = analyze_truss3d(p), pynite_truss(p)
        errors = {key: max(float(np.max(np.abs(np.array(r['nodes'][n][key]) - ref['nodes'][n][key]))) for n in ref['nodes']) for key in ('translation_m', 'reaction_n')}
        errors['axial_n'] = max(abs(r['members'][m]['axial_n'] - ref['members'][m]) for m in ref['members'])
        assert errors['translation_m'] < 1e-12 and errors['reaction_n'] < 1e-6 and errors['axial_n'] < 1e-6
        entry = dict(case=name, input_sha256=r['input_sha256'], max_absolute_pynite_errors=errors,
                     diagnostics=r['diagnostics'], nodes=r['nodes'], members=r['members'])
        if name == 'tripod-analytic':
            exact = tripod_analytic(p)
            entry['analytical'] = dict(tip_translation_m=exact['u'].tolist(), axial_n=exact['axial'],
                                       max_translation_error_m=float(np.max(np.abs(exact['u'] - r['nodes']['TIP']['translation_m']))),
                                       max_axial_error_n=max(abs(f - r['members'][m]['axial_n']) for m, f in exact['axial'].items()))
        comparisons.append(entry)
    p = grid(); tracemalloc.start(); started = time.perf_counter(); r = analyze_truss3d(p)
    elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
    expected = 1000 * 8 / (200e9 * .01)
    for j in range(5):
        for k in range(4):
            np.testing.assert_allclose(r['nodes'][f'N4-{j}-{k}']['translation_m'], [expected, 0, 0], rtol=1e-10, atol=1e-16)
    assert elapsed < 20
    return dict(status='passed', environment=dict(python=platform.python_version(), platform=platform.platform(),
                dependencies={p: version(p) for p in ('numpy', 'scipy', 'PyNiteFEA', 'pytest')},
                threads={v: os.environ.get(v) for v in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS')}),
                comparisons=comparisons, benchmark=dict(nodes=len(p['nodes']), members=len(p['members']),
                supports=len(p['supports']), free_dofs=r['diagnostics']['free_dofs'], elapsed_seconds=elapsed,
                peak_traced_bytes=peak, process_peak_rss_bytes=peak_rss(), scaled_condition=r['diagnostics']['scaled_condition'],
                relative_equilibrium_residual=r['diagnostics']['relative_equilibrium_residual'], input_sha256=r['input_sha256'],
                expected_max_translation_m=expected, input_bytes=len(json.dumps(p).encode()), output_bytes=len(json.dumps(r).encode())))


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2, allow_nan=False))
