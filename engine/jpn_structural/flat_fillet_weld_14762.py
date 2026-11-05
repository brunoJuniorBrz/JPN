"""NBR 14762:2010 §10.2.3: straight flat-surface fillet-weld subset.

One direct force parallel OR normal to a single planar fillet weld. The model
excludes eccentricity, groups, rotations, moment, combined force directions,
fatigue, weld installation quality and resistance of the full connected joint.
It must never release structural or fabrication approval.
"""
import hashlib
import json
from .single_bolt_14762 import _keys, _num, _string, _error, _check


def check_flat_fillet_weld(raw):
    _keys(raw, 'schema_version units connection_id combination_id source revision load_source '
               'hypothesis length_mm leg1_mm leg2_mm thickness1_mm thickness2_mm '
               'base_ultimate_mpa weld_ultimate_mpa force_n direction', 'weld')
    if raw['schema_version'] != 'jpn.flat-fillet-nbr14762/1' or raw['units'] != 'mm-MPa-N':
        _error('UNSUPPORTED_MODEL', 'Flat fillet mm-MPa-N contract required')
    if raw['hypothesis'] != 'single-flat-fillet-lap-joint-direct-concentric':
        _error('UNSUPPORTED_MODEL', 'Only one direct single planar lap-fillet weld')
    for k in ('connection_id', 'combination_id', 'source', 'revision', 'load_source'):
        _string(raw[k], k)
    if raw['direction'] not in ('parallel-to-weld', 'normal-to-weld'):
        _error('UNSUPPORTED_LOAD_STATE', 'Combined/oblique/eccentric force not supported')
    L = _num(raw['length_mm'], 'weld length', .1, 1e5)
    t1 = _num(raw['thickness1_mm'], 'sheet thickness 1', .1, 4.75)
    t2 = _num(raw['thickness2_mm'], 'sheet thickness 2', .1, 4.75)
    w1 = _num(raw['leg1_mm'], 'weld leg 1', .1, t1)
    w2 = _num(raw['leg2_mm'], 'weld leg 2', .1, t2)
    fu = _num(raw['base_ultimate_mpa'], 'metal base ultimate', 1, 2000)
    fw = _num(raw['weld_ultimate_mpa'], 'weld ultimate', 1, 3000)
    demand = _num(raw['force_n'], 'force', 0, 1e9)
    t = min(t1, t2)
    throat = .7*min(w1, w2)
    if raw['direction'] == 'parallel-to-weld':
        if L/t < 25:
            base = (1-.01*(L/t))*t*L*fu/1.65
            branch='parallel-short'
        else:
            base = .75*t*L*fu/2.00
            branch='parallel-long'
    else:
        base=t*L*fu/1.55
        branch='normal'
    capacities = [('base-metal', base, '10.2.3(a)' if branch.startswith('parallel') else '10.2.3(b)')]
    if t>2.5:
        capacities.append(('weld-metal', .75*throat*L*fw/1.65, '10.2.3(c)'))
    checks=[_check(key,demand,value,clause) for key,value,clause in capacities]
    status='FAIL-ISOLATED-CHECKS' if any(c['status']=='FAIL' for c in checks) else 'PASS-ISOLATED-CHECKS-ONLY'
    return dict(schema_version='jpn.flat-fillet-nbr14762-result/1',standard='ABNT NBR 14762:2010',units='N',
                input_sha256=hashlib.sha256(json.dumps(raw,sort_keys=True,ensure_ascii=False,
                                                    separators=(',',':'),allow_nan=False).encode()).hexdigest(),
                connection_id=raw['connection_id'],combination_id=raw['combination_id'],
                branch=branch,throat_mm=throat,checks=checks,status=status,
                joint_all_limit_states_verified=False,structure_approved=False,fabrication_approved=False,
                remaining=['Actual weld group/geometry and all joint load paths not verified.',
                           'Weld installation, procedure and other relevant limit states not verified.',
                           'Eccentricity, combined loading and complete structure not supported.'])
