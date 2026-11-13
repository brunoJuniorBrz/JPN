"""Process-private P6 experiment. No production import, route or shared patch.

Load historical P4 modules in private namespaces. Only residual trial assembly
uses first derivatives. Newton tangent, recovery, equilibrium, all gates and
the stored energy remain the historical implementation.
"""
import importlib.util
from pathlib import Path
import sys
import json,hashlib
import numpy as np
from . import dual

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

energy=private('energy',ROOT/'engine/jpn_structural/spatial_corotational.py')
for name in ('value','variables','sin','cos','atan2'): setattr(energy,name,getattr(dual,name))
solver=private('frame',ROOT/'engine/jpn_structural/p4_frame.py')

def trial_assemble(elements,q,dimension):
    if dimension!=3: raise ValueError('P6 is spatial only; never project to a plane')
    force=np.zeros(len(q))
    for row in elements:
        e,_=energy.energy_state(row['coordinates'],dual.variables(q[row['dofs']]),row['ea'],row['eiy'],row['eiz'],row['gj'],row['basis'])
        force[row['dofs']]+=e.g
    return force,None,None,None

# Derive a private function from the exact archived Newton source. Assert the
# single surgical substitution rather than maintain a drifting solver fork.
import inspect
source=inspect.getsource(solver.newton)
old='trial_internal, _, _, _ = assemble(elements, trial, dimension)'
assert source.count(old)==1
exec(compile(source.replace(old,'trial_internal, _, _, _ = trial_assemble(elements, trial, dimension)'),__file__,'exec'),
     {**solver.__dict__,'trial_assemble':trial_assemble},namespace:={})
solver.newton=namespace['newton']

def run(request):
    if request.get('dimensionality')!=3: raise ValueError('Explicit spatial P4 input required')
    answer=solver.analyze_p4_frame(request)
    answer['experimental_execution']='P6 first-order AD line search; unchanged P4 energy/tangent/acceptance'
    return answer
