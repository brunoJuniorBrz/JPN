"""Opt-in P7 path over the unchanged P6 research pilot (process-private patch only).

`use_kernel('python')` keeps the P6 reference exactly. `use_kernel('compiled')` swaps
ONLY the element evaluation (assembly tangent/forces and the line-search residual) for
the Numba kernel. Newton, criteria, equilibrium/stability audits, guards and outputs
are the P6 objects themselves. Nothing here is reachable from production.
"""
from functools import partial
import numpy as np

from experiments.m43_p6 import pilot as p6
from experiments.m43_p6 import element as reference
from experiments.m43_p6.newton import newton, physical_attempts
from . import compiled

KERNEL = 'python'


def _compiled_trial(elements, q, dimension):
    if dimension != 3: raise ValueError('P6 is spatial only; never project to a plane')
    force = np.zeros(len(q))
    for row in elements:
        force[row['dofs']] += compiled.internal_force(row['coordinates'], q[row['dofs']], row['ea'], row['eiy'],
                                                      row['eiz'], row['gj'], row['basis'])
    return force, None, None, None


def use_kernel(name):
    global KERNEL
    if name == 'python':
        p6.solver.spatial_element = reference.element_response
        p6.solver.newton = partial(newton, assemble=p6.solver.assemble, trial_assemble=p6.trial_assemble)
    elif name == 'compiled':
        p6.solver.spatial_element = compiled.element_response
        p6.solver.newton = partial(newton, assemble=p6.solver.assemble, trial_assemble=_compiled_trial)
    else:
        raise ValueError('Unknown kernel')
    KERNEL = name


def single_mesh_study(request, subdivisions):
    """P6 single-mesh study; 16 subdivisions allowed ONLY as a research refinement level."""
    if subdivisions in (2, 3, 4, 6, 8):
        out = p6.single_mesh_study(request, subdivisions)
    elif subdivisions == 16 and request.get('dimensionality') == 3:
        data = p6.solver.validate_request(request)
        p6.equilibrium_audits.clear(); physical_attempts.clear()
        mesh = p6.solver.run_mesh(data, subdivisions, 3)
        from jpn_structural.frame3d_model import input_hash
        controls = {'material_curvature': reference.MATERIAL_CURVATURE, 'subdivisions': subdivisions,
                    'paired_historical_acceptance': False}
        out = dict(schema_version='jpn.m43-p6-single-mesh-study/1', input_sha256=input_hash(request),
                   experimental_input_sha256=input_hash({'request': request, 'controls': controls}),
                   experimental_controls=controls, candidate=mesh, equilibrium_audits=list(p6.equilibrium_audits),
                   newton_physical_attempts=list(physical_attempts), production_enabled=False,
                   computed_structural_approval=False, fabrication_release=False, release_gate='NOT_READY_BLOCKED')
    else:
        raise ValueError('Explicit spatial refinement-study domain required')
    out['experimental_controls']['element_kernel'] = KERNEL
    return out
