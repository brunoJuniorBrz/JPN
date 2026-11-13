"""Process-private P6 experiment. No production import, route or shared patch.

Load historical P4 modules in private namespaces. Only residual trial assembly
uses first derivatives. Director-Hermite arc length is differentiated at both
orders; recovery/equilibrium and all historical acceptance gates are preserved.
"""
import importlib.util
from pathlib import Path
import sys
import json,hashlib
import numpy as np
from . import dual
from .arc import extension as hermite_extension

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
baseline=json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text())
for path,expected in baseline['source_sha256_lf'].items():
    assert hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==expected, 'Historical source changed: '+path

def private(name, path):
    spec=importlib.util.spec_from_file_location('jpn_structural._p6_'+name,path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

import inspect
def spatial_kernel(name):
    module=private(name,ROOT/'engine/jpn_structural/spatial_corotational.py')
    source=inspect.getsource(module.energy_state)
    old='arc_extension = length0/30*sum(2*local_i[k]**2-local_i[k]*local_j[k]+2*local_j[k]**2 for k in (1, 2))'
    assert source.count(old)==1
    module.hermite_extension=hermite_extension
    exec(compile(source.replace(old,'arc_extension = hermite_extension(length, local_i, local_j, rotate, exponential)'),__file__,'exec'),module.__dict__)
    return module

full=spatial_kernel('full')
energy=spatial_kernel('energy')
for name in ('value','variables','sin','cos','atan2'): setattr(energy,name,getattr(dual,name))
solver=private('frame',ROOT/'engine/jpn_structural/p4_frame.py')
solver.spatial_element=full.element_response
solver.energy_state=full.energy_state

def trial_assemble(elements,q,dimension):
    if dimension!=3: raise ValueError('P6 is spatial only; never project to a plane')
    force=np.zeros(len(q))
    for row in elements:
        e,_=energy.energy_state(row['coordinates'],dual.variables(q[row['dofs']]),row['ea'],row['eiy'],row['eiz'],row['gj'],row['basis'])
        force[row['dofs']]+=e.g
    return force,None,None,None

# Derive a private function from the exact archived Newton source. Assert the
# single surgical substitution rather than maintain a drifting solver fork.
source=inspect.getsource(solver.newton)
old='trial_internal, _, _, _ = assemble(elements, trial, dimension)'
assert source.count(old)==1
exec(compile(source.replace(old,'trial_internal, _, _, _ = trial_assemble(elements, trial, dimension)'),__file__,'exec'),
     {**solver.__dict__,'trial_assemble':trial_assemble},namespace:={})
solver.newton=namespace['newton']

def run(request):
    if request.get('dimensionality')!=3: raise ValueError('Explicit spatial P4 input required')
    answer=solver.analyze_p4_frame(request)
    answer['schema_version']='jpn.m43-p6-experimental/1'
    answer['formulation']='spatial-director-hermite-arc/p6-experimental'
    answer['solver']['name']='JPN-P6 isolated experiment'
    answer['experimental_execution']='P6 director-Hermite length and first-order AD line search; unchanged acceptance gates'
    return answer
