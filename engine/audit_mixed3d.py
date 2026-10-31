"""Reproduce independent mixed-model references and a measured spatial benchmark.

Audit utility only. No changes to UI, HTTP executors or earlier solver contracts.
"""
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
from jpn_structural.mixed3d import analyze_mixed3d
from benchmark_spatial import peak_rss
from tests.test_mixed3d import beam_and_axial
from tests.mixed3d_reference import spatial_chain, chain_force_method, axial_free_joint, axial_joint_statics


def grid():
    p = beam_and_axial(); frame, axial = p['members']
    p['nodes'], p['members'], p['supports'], p['nodal_loads'] = [], [], [], []
    for i in range(7):
        for j in range(7):
            base, top = f'B{i}-{j}', f'T{i}-{j}'
            p['nodes'] += [dict(id=base, x_m=i * 2.5, y_m=j * 4., z_m=0.), dict(id=top, x_m=i * 2.5, y_m=j * 4., z_m=3.)]
            p['supports'].append(dict(node=base, restrained=[True] * 6))
            p['members'].append({**frame, 'id': f'COL{i}-{j}', 'start': base, 'end': top})
            p['nodal_loads'].append(dict(node=top, case='L', fx_n=50., fy_n=-20., fz_n=-500., mx_nm=5., my_nm=-3., mz_nm=2.))
            if i: p['members'].append({**frame, 'id': f'GX{i}-{j}', 'start': f'T{i-1}-{j}', 'end': top})
            if j: p['members'].append({**frame, 'id': f'GY{i}-{j}', 'start': f'T{i}-{j-1}', 'end': top})
            if i and j: p['members'].append({**axial, 'id': f'AX{i}-{j}', 'start': f'T{i-1}-{j-1}', 'end': top})
    p['project']['source'] = 'Synthetic 3D benchmark: all 49 column bases explicitly fixed; nodal forces and moments declared'
    return p


def audit():
    p = spatial_chain(); exact = chain_force_method(p, 'LC'); output = analyze_mixed3d(p); c = output['combinations']['LC']
    values = np.array([c['nodes'][n]['translation_m'] + c['nodes'][n]['rotation_rad'] for n in ['A', 'B', 'C', 'D']])
    axes = [np.eye(3), np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]]), np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])]
    action_errors = []
    for i, basis in enumerate(axes):
        actual = (np.array(c['members'][f'F{i}']['end_actions_local']).reshape(4, 3) @ basis).ravel()
        action_errors.append(float(np.max(np.abs(actual - exact['end_actions'][i]))))
    reaction = c['nodes']['A']['reaction_force_n'] + c['nodes']['A']['reaction_moment_nm']
    errors = dict(translation_m=float(np.max(np.abs(values[:, :3] - exact['u'][:, :3]))),
                  rotation_rad=float(np.max(np.abs(values[:, 3:] - exact['u'][:, 3:]))),
                  base_force_moment=float(np.max(np.abs(reaction - exact['reaction']))),
                  axial_n=max(abs(c['members'][f'S{i}']['axial_n'] - n) for i, n in enumerate(exact['tension'])),
                  frame_force_moment=max(action_errors),
                  energy_j=abs(float(exact['external'] @ values[1:].ravel()) / 2 - exact['energy']))
    assert errors['translation_m'] < 1e-11 and errors['rotation_rad'] < 1e-11
    assert max(errors[k] for k in ['base_force_moment', 'axial_n', 'frame_force_moment']) < 1e-6
    chain = dict(reference='Independent force method/virtual work; exact Gauss integration; no PyNite matrix', errors=errors,
                 expected_displacements=exact['u'].tolist(), expected_axial_n=exact['tension'].tolist(),
                 expected_base_reactions=exact['reaction'].tolist(), expected_energy_j=exact['energy'],
                 input_sha256=output['input_sha256'], equilibrium=c['equilibrium'], result=c)
    p = axial_free_joint(); ref = axial_joint_statics(p); output = analyze_mixed3d(p); c = output['combinations']['LC']
    joint = dict(reference='Joint statics plus independent cantilever and axial compatibility formulas',
                 free_dofs=output['diagnostics']['free_dofs'],
                 expected_frame_tip=ref['u_b'].tolist(), expected_axial_joint_translation=ref['u_c'].tolist(),
                 expected_axial_n=ref['tension'].tolist(),
                 max_translation_error_m=float(np.max(np.abs(c['nodes']['C']['translation_m'] - ref['u_c']))),
                 input_sha256=output['input_sha256'], result=c)
    p = grid(); tracemalloc.start(); started = time.perf_counter(); output = analyze_mixed3d(p)
    elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
    assert elapsed < 30
    return dict(status='passed', environment=dict(python=platform.python_version(), platform=platform.platform(),
                dependencies={p: version(p) for p in ['numpy', 'scipy', 'PyNiteFEA', 'pytest']},
                threads={v: os.environ.get(v) for v in ['OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS']}),
                chain=chain, axial_joint=joint, benchmark=dict(nodes=len(p['nodes']),
                frames=sum(m['kind'] == 'frame' for m in p['members']), axials=sum(m['kind'] == 'axial' for m in p['members']),
                elapsed_seconds=elapsed, peak_traced_bytes=peak, process_peak_rss_bytes=peak_rss(),
                diagnostics=output['diagnostics'], input_bytes=len(json.dumps(p).encode()), output_bytes=len(json.dumps(output).encode()),
                input_sha256=output['input_sha256'], equilibrium=output['combinations']['LC']['equilibrium']))


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2, allow_nan=False))
