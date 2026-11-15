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

from functools import partial
from . import element as full
from .newton import newton,physical_attempts
energy=full
solver=private('frame',ROOT/'engine/jpn_structural/p4_frame.py')
solver.spatial_element=full.element_response
solver.energy_state=full.energy_state
equilibrium_audits=[]
historical_equilibrium=solver.equilibrium
def recorded_equilibrium(data,nodes,loads):
    answer=historical_equilibrium(data,nodes,loads)
    equilibrium_audits.append({'node_count':len(data['nodes']),**answer})
    return answer
solver.equilibrium=recorded_equilibrium

def trial_assemble(elements,q,dimension):
    if dimension!=3: raise ValueError('P6 is spatial only; never project to a plane')
    force=np.zeros(len(q))
    for row in elements:
        e,_=energy.energy_state(row['coordinates'],dual.variables(q[row['dofs']]),row['ea'],row['eiy'],row['eiz'],row['gj'],row['basis'])
        force[row['dofs']]+=e.g
    return force,None,None,None

solver.newton=partial(newton,assemble=solver.assemble,trial_assemble=trial_assemble)

def run(request):
    equilibrium_audits.clear()
    physical_attempts.clear()
    if request.get('dimensionality')!=3: raise ValueError('Explicit spatial P4 input required')
    answer=solver.analyze_p4_frame(request)
    answer['schema_version']='jpn.m43-p6-experimental/1'
    answer['formulation']='spatial-director-hermite-arc/p6-experimental'
    answer['solver']['name']='JPN-P6 isolated experiment'
    answer['experimental_execution']='P6 director-Hermite length and first-order AD line search; unchanged acceptance gates'
    controls={'material_curvature':full.MATERIAL_CURVATURE,'quadrature_points':8}
    answer['experimental_controls']=controls
    from .diagnostics import refinement_components
    answer['governing_refinement_components']=refinement_components(answer)
    answer['equilibrium_audits']=list(equilibrium_audits)
    answer['newton_physical_attempts']=list(physical_attempts)
    from jpn_structural.frame3d_model import input_hash
    answer['experimental_input_sha256']=input_hash({'physical_request':request,'controls':controls})
    if full.MATERIAL_CURVATURE:
        answer['formulation']='spatial-director-material-curvature/p6-experimental'
        answer['experimental_execution']='Opt-in material-curvature energy; assumed mean axial extension remains unverified'
    return answer

def single_mesh_study(request,subdivisions):
    """Additional P6 study, NOT the historical paired-mesh contract.

    Each raw mesh is executed once under the same guards; results are never
    extrapolated. Historical request, geometry and acceptance remain intact.
    """
    if request.get('dimensionality')!=3 or subdivisions not in (2,3,4,6,8):raise ValueError('Explicit spatial refinement-study domain required')
    data=solver.validate_request(request)
    equilibrium_audits.clear();physical_attempts.clear()
    mesh=solver.run_mesh(data,subdivisions,3)
    from jpn_structural.frame3d_model import input_hash
    controls={'material_curvature':full.MATERIAL_CURVATURE,'subdivisions':subdivisions,'paired_historical_acceptance':False}
    return dict(schema_version='jpn.m43-p6-single-mesh-study/1',input_sha256=input_hash(request),
        experimental_input_sha256=input_hash({'request':request,'controls':controls}),experimental_controls=controls,
        candidate=mesh,equilibrium_audits=list(equilibrium_audits),newton_physical_attempts=list(physical_attempts),
        production_enabled=False,computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')
