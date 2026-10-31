"""Independent audit evidence: analytical beam and exact frame subdivision.

Run from repository root with the installed engine and one BLAS thread.
The analytic reference does not import or reconstruct a stiffness matrix.
"""
import copy
import json
from pathlib import Path
import numpy as np
from jpn_structural.frame3d import analyze_frame3d

root = Path(__file__).resolve().parents[3]
beam = json.loads((root / 'engine/examples/spatial-adapted-tee.json').read_text(encoding='utf-8'))
r = analyze_frame3d(beam)['combinations']['TESTE-1']
force, a, length, ei = -1000., 2., 4., 200e9 * 8e-5
reference = dict(c_translation_z_m=force * a**3 / (3 * ei),
                 b_translation_z_m=force * a**2 * (3 * length - a) / (6 * ei),
                 c_rotation_y_rad=-force * a**2 / (2 * ei),
                 b_rotation_y_rad=-force * a**2 / (2 * ei),
                 reaction_z_n=-force, reaction_moment_y_nm=force * a)
actual = dict(c_translation_z_m=r['nodes']['C']['translation_m'][2],
              b_translation_z_m=r['nodes']['B']['translation_m'][2],
              c_rotation_y_rad=r['nodes']['C']['rotation_rad'][1],
              b_rotation_y_rad=r['nodes']['B']['rotation_rad'][1],
              reaction_z_n=r['nodes']['A']['force_n'][2],
              reaction_moment_y_nm=r['nodes']['A']['moment_nm'][1])
comparisons = {k: dict(reference=v, actual=actual[k], absolute_error=abs(actual[k] - v)) for k, v in reference.items()}
for k in reference:
    np.testing.assert_allclose(actual[k], reference[k], rtol=1e-10, atol=1e-12)

roof = json.loads((root / 'engine/examples/spatial-adapted-roof.json').read_text(encoding='utf-8'))
baseline = analyze_frame3d(roof)['combinations']['TESTE-1']
refined = copy.deepcopy(roof)
m = refined['members'][0]
nodes = {n['id']: n for n in refined['nodes']}
middle = dict(id='AUDIT-MIDPOINT', **{k: (nodes[m['start']][k] + nodes[m['end']][k]) / 2 for k in ('x_m', 'y_m', 'z_m')})
refined['nodes'].append(middle)
first, second = copy.deepcopy(m), copy.deepcopy(m)
first.update(id=m['id'] + ':AUDIT1', end=middle['id'], release_end=[False] * 6)
second.update(id=m['id'] + ':AUDIT2', start=middle['id'], release_start=[False] * 6)
refined['members'] = [first, second] + refined['members'][1:]
new = analyze_frame3d(refined)['combinations']['TESTE-1']
maxima = {}
for field in ('translation_m', 'rotation_rad', 'force_n', 'moment_nm'):
    maxima[field] = max(float(np.max(np.abs(np.array(baseline['nodes'][n][field]) - new['nodes'][n][field]))) for n in baseline['nodes'])
    for n in baseline['nodes']:
        np.testing.assert_allclose(new['nodes'][n][field], baseline['nodes'][n][field], rtol=1e-8, atol=1e-7 if field in ('force_n', 'moment_nm') else 1e-11)
print(json.dumps(dict(status='passed', analytical_beam=comparisons, beam_stations=r['members']['BEAM:S1']['stations'],
                     subdivision=dict(original_nodes=len(roof['nodes']), original_segments=len(roof['members']), refined_nodes=len(refined['nodes']), refined_segments=len(refined['members']), max_absolute_changes=maxima),
                     roof_equilibrium=baseline['equilibrium']), indent=2, allow_nan=False))
