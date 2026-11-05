"""Isolated NBR 14762:2010 §10.3 bolt/component checks, not a joint approval.

Scope: ONE through-bolt in ONE bearing-type single-shear connection between
TWO flat steel parts, direct concentric transfer, round STANDARD hole on both
parts, no other bolts/holes, no eccentricity, moment, slip-critical behavior,
prying, washers/anchors, end notches or composite load paths.  All parts <=
4.75 mm; all input lengths mm, strengths MPa = N/mm², forces N.

This module does not verify the actual JPN project geometry, load distribution,
block shear, sheet buckling, welds, bases, or member stability. Never release a
complete joint/structure/fabrication on the result of this isolated check.
"""
import hashlib
import json
import math

SCHEMA = 'jpn.single-bolt-nbr14762/1'


class BoltCheckError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _error(code, message):
    raise BoltCheckError(code, message)


def _keys(record, names, name):
    if type(record) is not dict or set(record) != set(names.split()):
        _error('INVALID_INPUT', f'{name}: expected exact keys {names}')


def _num(value, name, low=0, high=1e10, nonzero=True):
    if type(value) not in (float, int) or not math.isfinite(value) or not low <= value <= high or (nonzero and value == 0):
        _error('INVALID_INPUT', f'{name}: finite value outside supported domain')
    return float(value)


def _string(value, name):
    if type(value) is not str or not value.strip() or len(value) > 1000:
        _error('INVALID_INPUT', f'{name}: nonblank source/identifier required')
    return value


def _check(key, demand, capacity, clause):
    if not math.isfinite(capacity) or capacity <= 0:
        _error('NUMERICAL_FAILURE', 'Nonfinite/nonpositive resistance')
    u = demand/capacity
    if not math.isfinite(u):
        _error('NUMERICAL_FAILURE', 'Nonfinite utilization')
    return {'mode': key, 'demand_n': demand, 'resistance_n': capacity,
            'utilization': u, 'status': 'PASS' if u <= 1 else 'FAIL', 'clause': clause}


def check_single_bolt(raw):
    """Return isolated bolt, plate tear-out/bearing, and interaction checks.

    A PASS means ONLY that the enumerated checks passed for the declared
    hypothetical one-bolt model. No structural/fabrication approval is issued.
    """
    _keys(raw, 'schema_version units connection_id combination_id source revision '
               'load_source hypothesis bolt plates demand axial_member', 'connection')
    if raw['schema_version'] != SCHEMA or raw['units'] != 'mm-MPa-N':
        _error('UNSUPPORTED_MODEL', 'Single-bolt mm-MPa-N contract required')
    for k in ('connection_id', 'combination_id', 'source', 'revision', 'load_source'):
        _string(raw[k], k)
    if raw['hypothesis'] != 'one-bolt-two-plates-concentric-single-shear-bearing-type':
        _error('UNSUPPORTED_MODEL', 'Only one direct concentric bearing-type bolt with one shear plane')
    b = raw['bolt']
    _keys(b, 'diameter_mm ultimate_mpa threads_in_shear_plane grade_class source revision', 'bolt')
    d = _num(b['diameter_mm'], 'diameter', 6, 36)
    fub = _num(b['ultimate_mpa'], 'bolt ultimate', 1, 3000)
    for k in ('source', 'revision'):
        _string(b[k], k)
    if b['grade_class'] not in ('qualified-structural', 'unqualified'):
        _error('INVALID_INPUT', 'Declare bolt qualification status explicitly')
    if type(b['threads_in_shear_plane']) is not bool:
        _error('INVALID_INPUT', 'Bolt thread position must be boolean')
    demand = raw['demand']
    _keys(demand, 'tension_n shear_n', 'bolt force demand')
    t_force = _num(demand['tension_n'], 'bolt tension', 0, 1e9, nonzero=False)
    v_force = _num(demand['shear_n'], 'bolt shear', 0, 1e9, nonzero=False)
    if not (t_force > 0 or v_force > 0):
        _error('INVALID_INPUT', 'At least one nonzero per-bolt design load required')
    if type(raw['axial_member']) is not dict:
        _error('INVALID_INPUT', 'Declare applicability of 10.1 axial-member minimum')
    ax = raw['axial_member']
    _keys(ax, 'applies design_resistance_n', 'axial-member minimum')
    if type(ax['applies']) is not bool:
        _error('INVALID_INPUT', 'Axial member applicability must be explicit')
    if ax['applies']:
        mr = _num(ax['design_resistance_n'], 'axial member resistance', 1, 1e12)
        if not v_force:
            _error('UNSUPPORTED_LOAD_STATE', 'Axial member transfer requires declared bolt shear force')
        required_v = max(v_force, 0.5*mr)
    else:
        if ax['design_resistance_n'] is not None:
            _error('INVALID_INPUT', 'No axial-member strength may be declared when inapplicable')
        required_v = v_force
    parts = raw['plates']
    if type(parts) is not list or len(parts) != 2:
        _error('UNSUPPORTED_MODEL', 'Exactly two connected flat parts required')
    names = set()
    plate_data = []
    max_hole = d + (0.8 if d < 12.5 else 1.5)
    for p in parts:
        _keys(p, 'id thickness_mm yield_mpa ultimate_mpa hole_diameter_mm '
                 'edge_in_shear_direction_mm edge_transverse_mm source revision', 'connected part')
        ident = _string(p['id'], 'plate ID')
        if ident in names:
            _error('INVALID_INPUT', 'Duplicate connected part')
        names.add(ident)
        for k in ('source', 'revision'):
            _string(p[k], k)
        thick = _num(p['thickness_mm'], 'sheet thickness', .1, 4.75)
        fy = _num(p['yield_mpa'], 'sheet yield', 1, 2000)
        fu = _num(p['ultimate_mpa'], 'sheet ultimate', fy, 2000)
        hole = _num(p['hole_diameter_mm'], 'hole diameter', d, max_hole)
        e_load = _num(p['edge_in_shear_direction_mm'], 'edge in force direction', .1, 100000)
        e_trans = _num(p['edge_transverse_mm'], 'transverse edge', .1, 100000)
        if e_load - hole/2 < d or e_trans - hole/2 < d:
            _error('INVALID_GEOMETRY', f'{ident}: free edge clearance below nominal bolt diameter')
        plate_data.append((ident, thick, fu, e_load))
    area = math.pi*d*d/4
    ft = .75*area*fub/1.35
    fv = (.4 if b['threads_in_shear_plane'] else .5)*area*fub/1.35
    checks = [_check('bolt-tension', t_force, ft, '10.3.6'),
              _check('bolt-shear', required_v, fv, '10.3.7')]
    if t_force and required_v:
        ut, uv = t_force/ft, required_v/fv
        ratio = ut*ut + uv*uv if b['grade_class'] == 'qualified-structural' else ut+uv
        checks.append({'mode': 'bolt-tension-shear-interaction', 'demand': ratio,
                       'limit': 1., 'utilization': ratio,
                       'status': 'PASS' if ratio <= 1 else 'FAIL', 'clause': '10.3.8'})
    if required_v:
        for name, thick, fu, e in plate_data:
            tear = thick*e*fu/1.45
            bearing = (.183*thick+1.53)*d*thick*fu/1.55
            checks.extend((_check(name+':edge-tearout', required_v, tear, '10.3.4'),
                           _check(name+':bearing', required_v, bearing, '10.3.5')))
    fail = any(x['status'] == 'FAIL' for x in checks)
    return {
        'schema_version': 'jpn.single-bolt-nbr14762-result/1',
        'standard': 'ABNT NBR 14762:2010', 'units': 'N',
        'input_sha256': hashlib.sha256(json.dumps(raw, sort_keys=True, ensure_ascii=False,
                                                 separators=(',', ':'), allow_nan=False).encode()).hexdigest(),
        'connection_id': raw['connection_id'], 'combination_id': raw['combination_id'],
        'source': raw['source'], 'revision': raw['revision'],
        'basis': 'direct concentric single-shear one-bolt thin-sheet calculation',
        'required_shear_n': required_v, 'bolt_area_mm2': area,
        'checks': checks, 'status': 'FAIL-ISOLATED-CHECKS' if fail else 'PASS-ISOLATED-CHECKS-ONLY',
        'joint_all_limit_states_verified': False, 'structure_approved': False,
        'fabrication_approved': False,
        'remaining': ['Physical as-built/JPN joint and actual load path not verified.',
                      'Plate net rupture, block shear and possible additional states not verified.',
                      'Overall building actions, stability and foundations not verified.'],
    }
