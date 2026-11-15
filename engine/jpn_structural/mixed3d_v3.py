"""jpn.mixed3d/3: the /2 loading contract with an explicit Z-up axis reference.

Linear analysis preserves the /2 solver and declares roll from the JPN
reference. Experimental second order requires an explicit opt-in and uses
a separate result path. Legacy inputs and hashes are preserved.
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


SOLUTION_MODES = ('linear-superposition', 'per-combination')


def analyze_mixed3d_v3(raw, *, _joint_actions=None):
    """`solution_mode` (optional, /3 only; absent = 'linear-superposition', hashes of existing /3 requests unchanged):
    'linear-superposition' solves once and superposes the load cases per combination; 'per-combination' solves every
    combination as its own model. In this LINEAR engine both give the same numbers (tested); second order requires the latter and uses the M43 mixed core."""
    if type(raw) is dict and 'analysis_order' in raw:
        if raw['analysis_order'] != 'second-order' or raw.get('solution_mode') != 'per-combination':
            fail('UNSUPPORTED_ANALYSIS_ORDER', "Second-order analysis requires solution_mode='per-combination'.")
        from .mixed3d_second_order import analyze_second_order_v3
        return analyze_second_order_v3(raw,_joint_actions)
    mode = raw.get('solution_mode', 'linear-superposition') if type(raw) is dict else None
    if type(raw) is dict and 'solution_mode' in raw:
        if mode not in SOLUTION_MODES:
            fail('UNSUPPORTED_SOLUTION_MODE', f"solution_mode deve ser um de {', '.join(SOLUTION_MODES)}.")
        if mode == 'per-combination':
            return _per_combination(raw, _joint_actions)
        raw_core = {k: v for k, v in raw.items() if k != 'solution_mode'}
        result = analyze_mixed3d_v3(raw_core, _joint_actions=_joint_actions)
        result['input_sha256'] = input_hash(raw)
        result['solution_mode'] = mode
        return result
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


def _per_combination(raw, joint_actions):
    """One independent linear analysis per combination, merged into one result under the hash of the FULL request."""
    core = {k: v for k, v in raw.items() if k != 'solution_mode'}
    obj(core, KEYS, 'modelo mixed3d/3')
    merged = None
    sidecars = []
    for combination in core['combinations']:
        single = deepcopy(core)
        single['combinations'] = [combination]
        side = {} if joint_actions is not None else None
        part = analyze_mixed3d_v3(single, _joint_actions=side)
        if merged is None:
            merged = part
        else:
            merged['combinations'].update(part['combinations'])
            merged['diagnostics']['elapsed_seconds'] += part['diagnostics']['elapsed_seconds']
            merged['diagnostics']['scaled_condition'] = max(merged['diagnostics']['scaled_condition'], part['diagnostics']['scaled_condition'])
        sidecars.append(side)
    digest = input_hash(raw)
    merged['input_sha256'] = digest
    merged['solution_mode'] = 'per-combination'
    merged['assumptions'].append("solution_mode='per-combination': cada combinação foi resolvida como modelo próprio (análise linear: mesmos números da superposição).")
    if joint_actions is not None and sidecars and sidecars[0] is not None:
        joint_actions.update(sidecars[0])
        for side in sidecars[1:]:
            joint_actions['combinations'].update(side['combinations'])
        joint_actions['input_sha256'] = digest
    return merged
