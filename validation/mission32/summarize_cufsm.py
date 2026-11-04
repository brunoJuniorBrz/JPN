"""Derive compact native-executable fixtures and convergence from raw audit."""
import argparse
import hashlib
import json
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--fixture',type=Path,required=True)
p.add_argument('--summary',type=Path,required=True);args=p.parse_args()
raw=args.input.read_bytes();data=json.loads(raw);assert not data['failures']
selected=[];groups={}
for index,row in enumerate(data['results']):
    key=json.dumps(row['geometry'],sort_keys=True)
    group=groups.setdefault(key,{})
    if index%66<64:
        group.setdefault((row['arc'],row['flat']),[]).append(row)
    if index%66 in (0,15,39,64):
        selected.append({**{k:row[k] for k in ['geometry','arc','flat','wavelength_mm']},
            'families':{f:{k:v[k] for k in ['cufsm_stress_mpa','cufsm_mode']} for f,v in row['families'].items()}})
fixture=dict(source_commit=data['cufsm_commit'],source_runtime='GNU Octave 11.3.0',
    raw_audit_sha256=hashlib.sha256(raw).hexdigest(),cases=selected,reference='Original CUFSM matrices and modal bases; Cholesky-whitened energy eigensolve')
args.fixture.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf8')
curves=[]
for key,meshes in groups.items():
    history=[]
    for mesh,rows in meshes.items():
        families={}
        for family in ['local','distortional']:
            minimum=min(enumerate(rows),key=lambda v:v[1]['families'][family]['jpn_stress_mpa'])
            i,row=minimum
            families[family]=dict(half_wave_number=i+1,wavelength_mm=row['wavelength_mm'],
                jpn_stress_mpa=row['families'][family]['jpn_stress_mpa'],
                original_cufsm_stress_mpa=row['families'][family]['cufsm_stress_mpa'],
                governing_energy_accumulation_bound=row['families'][family]['diagnostics']['energy_accumulation_bound'])
        history.append(dict(mesh=mesh,families=families))
    changes={f:abs(history[-1]['families'][f]['jpn_stress_mpa']-history[-2]['families'][f]['jpn_stress_mpa'])/history[-1]['families'][f]['jpn_stress_mpa'] for f in ['local','distortional']}
    curves.append(dict(geometry=json.loads(key),refinements=history,relative_changes=changes,
        mesh_target_met=max(changes.values())<=.001,
        governing_energy_target_met=max(v['governing_energy_accumulation_bound'] for v in history[-1]['families'].values())<=.001))
summary={k:data[k] for k in ['cases','versions','cufsm_commit','maxima','failures']}
summary.update(eigenpairs=2*data['cases'],fixture_cases=len(selected),discrete_curves=curves,
    certified_spectrum_tail=False,approved_for_fabrication=False)
args.summary.write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
print(json.dumps(summary))
