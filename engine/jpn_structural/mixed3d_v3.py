"""jpn.mixed3d/3: the /2 loading contract with an explicit Z-up axis reference.

Same linear solver, loads, limits and equilibrium gates as /2. The only
difference is the meaning of `rotation_deg`: it is measured from the JPN
reference of local_axes.py, not from PyNite's Y-up branches. /1 and /2 are
left numerically untouched.
"""
from copy import deepcopy

import numpy as np

from .frame3d_model import obj, fail, input_hash
from .local_axes import CONVENTION, offset_deg, reference_basis, rolled, wrap
from .mixed3d import validate_mixed3d
from .mixed3d_loads import analyze_loaded_mixed3d

KEYS = ('schema_version units theory project nodes members materials sections supports cases '
        'nodal_loads combinations member_loads self_weight local_axes')
BASIS_TOLERANCE = 1e-9


def analyze_mixed3d_v3(raw, *, _joint_actions=None):
    obj(raw, KEYS, 'modelo mixed3d/3')
    if raw['schema_version'] != 'jpn.mixed3d/3':
        fail('UNSUPPORTED_MODEL', 'Exigido jpn.mixed3d/3.')
    if raw['local_axes'] != CONVENTION:
        fail('AXIS_CONVENTION_REQUIRED', f"Declare local_axes='{CONVENTION}'; nenhuma referência de eixos é presumida.")
    data = deepcopy(raw)
    data.pop('local_axes')
    data['schema_version'] = 'jpn.mixed3d/2'
    # Strict topology/property validation before any angle is computed.
    probe = deepcopy(data); probe['schema_version'] = 'jpn.mixed3d/1'
    probe.pop('member_loads'); probe.pop('self_weight')
    cases = {c['id'] for c in probe['cases'] if type(c) is dict and type(c.get('id')) is str} if type(probe['cases']) is list else set()
    validate_mixed3d(probe, distributed_cases=cases)
    points = {n['id']: (n['x_m'], n['y_m'], n['z_m']) for n in data['nodes']}
    axes = {}
    for m in data['members']:
        if m['kind'] != 'frame':
            continue
        a, b = points[m['start']], points[m['end']]
        delta = offset_deg(a, b, m['id'])
        sent = wrap(m['rotation_deg']+delta)
        axes[m['id']] = dict(declared_rotation_deg=float(m['rotation_deg']), reference_offset_deg=delta,
                             solver_rotation_deg=sent, expected=rolled(reference_basis(a, b, m['id']), m['rotation_deg']))
        m['rotation_deg'] = sent
    sidecar = {}
    result = analyze_loaded_mixed3d(data, _joint_actions=sidecar)
    # The basis the solver ACTUALLY used must be the declared one. Never repaired.
    for mid, row in axes.items():
        used = np.asarray(sidecar['members'][mid]['global_to_local'], dtype=float)
        expected = row.pop('expected')
        if not np.isfinite(used).all() or float(np.max(abs(used-expected))) > BASIS_TOLERANCE:
            fail('AXIS_REALISATION_FAILED', f'{mid}: a base local usada pelo solver difere da referência declarada; sem resultado.')
        row['global_to_local'] = used.tolist()
    digest = input_hash(raw)
    result.update(schema_version='jpn.mixed3d-result/3', input_sha256=digest,
                  local_axes=dict(convention=CONVENTION, members=axes))
    result['solver']['adapter'] = 'jpn-mixed3d/3'
    result['assumptions'].append("Eixos locais 'jpn-z-up/1': y horizontal, z no plano vertical da barra; giro declarado pela mão direita em x.")
    if _joint_actions is not None:
        _joint_actions.update(sidecar)
        _joint_actions['input_sha256'] = digest
    return result
