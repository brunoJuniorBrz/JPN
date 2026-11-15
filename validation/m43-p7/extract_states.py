"""Freeze per-element converged SPATIAL states (meshes 4 and 8) for the equivalence tests.

Reads the benchmark's raw worker outputs; element inputs are rebuilt exactly like
validation/m43-p6/kinematic_study.py (coordinates, translations+rotation vectors, basis).
    python validation/m43-p7/extract_states.py
"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'.tools/m43-p7/benchmark'

states = []
for mesh in (4, 8):
    data = json.loads((SOURCE/f'spatial-{mesh}-compiled-0.json').read_text())
    assert data['execution']['status'] == 'diagnostic'
    cand = data['execution']['diagnostic']['candidate']; model = cand['analysis_model']; answer = cand['combinations']['C']
    nodes = {n['id']: n for n in model['nodes']}; mats = {m['id']: m for m in model['materials']}
    secs = {s['id']: s for s in model['sections']}
    for member in model['members']:
        names = [member['start'], member['end']]; s = secs[member['section']]; m = mats[member['material']]
        states.append(dict(mesh=mesh, member=member['id'],
                           x=[[nodes[n][k] for k in ('x_m', 'y_m', 'z_m')] for n in names],
                           q=[v for n in names for v in answer['nodes'][n]['translation_m']+answer['nodes'][n]['rotation_rad']],
                           ea=m['e_pa']*s['area_m2'], eiy=m['e_pa']*s['iy_m4'], eiz=m['e_pa']*s['iz_m4'],
                           gj=m['g_pa']*s['j_m4'], basis=answer['members'][member['id']]['reference_basis']))
(ROOT/'validation/m43-p7/converged-states.json').write_text(json.dumps(dict(
    source='P7 benchmark, SPATIAL single meshes 4 and 8, compiled kernel, material curvature on',
    states=states), indent=0))
print(len(states), 'states')
