"""Pointwise reuse of existing resistance procedures; never a continuous field.

Member lengths remain physical lengths for slenderness/capacity. Constant-vector
legacy evaluations are only section evaluations at each supplied station. Checks
that require a continuous load pattern are explicitly blocked afterwards.
"""
import copy
import math
import sys
from .frame3d_model import obj, number, text, fail, input_hash

COMPONENTS = ('nN', 'vyN', 'vzN', 'tNm', 'myNm', 'mzNm')


def analyze_stations(raw, evaluate, steel=False):
    fields = raw.get('station_demands')
    if raw.get('fields') != [] or type(fields) is not list or not 1 <= len(fields) <= 320:
        fail('SECOND_ORDER_STATIONS_REQUIRED', 'Use exclusively traced station demands.')
    points, cursor, ids, models = [], 0., set(), set()
    for f in fields:
        obj(f, 'segment_id offset_m length_m stations', 'station segment')
        text(f['segment_id'], 'segment id')
        if f['segment_id'] in ids:
            fail('DUPLICATE_ID', 'Repeated physical segment.')
        ids.add(f['segment_id'])
        number(f['offset_m'], 0, 1e6, 'offset'); number(f['length_m'], 1e-8, 1e6, 'length')
        if not math.isclose(f['offset_m'], cursor, rel_tol=1e-12, abs_tol=1e-10):
            fail('DISCONNECTED_MODEL', 'Station segments must cover the original member.')
        cursor += f['length_m']
        rows = f['stations']
        if type(rows) is not list or len(rows) not in (2, 5):
            fail('SECOND_ORDER_STATIONS_REQUIRED', 'Two axial or five frame stations required.')
        for i, row in enumerate(rows):
            obj(row, 'u forces', 'station'); number(row['u'], 0, 1, 'station coordinate')
            if row['u'] != i/(len(rows)-1):
                fail('SECOND_ORDER_STATIONS_REQUIRED', 'Missing or reordered station.')
            obj(row['forces'], ' '.join(COMPONENTS), 'station forces')
            for k, value in row['forces'].items():
                if value is not None:
                    number(value, -1e15, 1e15, k)
            values = row['forces']
            if values['nN'] is None or any(v is None for v in values.values()) != all(values[k] is None for k in COMPONENTS[1:]):
                fail('INCOMPLETE_FORCE_FIELD', 'Complete concurrent vector required.')
            model = 'axial' if values['myNm'] is None else 'frame'
            if len(rows) != (2 if model == 'axial' else 5):
                fail('SECOND_ORDER_STATIONS_REQUIRED', 'Station count differs from the physical element.')
            models.add(model)
            points.append(dict(segment_id=f['segment_id'], position_m=f['offset_m']+row['u']*f['length_m'],
                               segment_position_m=row['u']*f['length_m'], combination_id=raw['combination_id'], forces=values))
    if len(models) != 1:
        fail('INCONSISTENT_FORCE_MODEL', 'Mixed physical types within one original member.')
    outputs = []
    for p in points:
        request = copy.deepcopy(raw)
        del request['station_demands']
        request['fields'] = [dict(segment_id=p['segment_id'], offset_m=0., length_m=cursor,
                                  forces={k: None if v is None else [v] for k, v in p['forces'].items()})]
        out = evaluate(request)
        for check in out['checks']:
            if check.get('governing') is not None:
                check['governing'] = p
        outputs.append(out)
    result = copy.deepcopy(outputs[0])
    checks = {}
    for out in outputs:
        for c in out['checks']:
            previous = checks.get(c['id'])
            if previous is None or c['status'] == 'BLOCKED' or (previous['status'] != 'BLOCKED' and (c.get('utilization') or 0) > (previous.get('utilization') or 0)):
                checks[c['id']] = c
        result['capacities'].update(out['capacities'])
    def blocked(key, reason):
        checks[key] = dict(id=key, status='BLOCKED', reason=reason, utilization=None, governing=None)
    ns = [p['forces']['nN'] for p in points]
    uniform = max(ns)-min(ns) <= 128*sys.float_info.epsilon*max(1., *map(abs, ns))
    if not steel and not uniform:
        for key in ('compression', 'combined-9.9'):
            if key in checks:
                blocked(key, 'SECOND_ORDER_UNIFORM_N_REQUIRED: the original member does not have uniform axial force.')
    my_max = max(abs(p['forces']['myNm'] or 0) for p in points)
    if steel and my_max > 128*sys.float_info.epsilon*max(1., my_max):
        for key in ('my', 'combined-5.5.1.2'):
            if key in checks:
                blocked(key, 'SECOND_ORDER_CB_FIELD_REQUIRED: station samples do not certify the continuous moment field for Cb.')
        result['capacities'].pop('my', None)
    blocked('second-order-station-coverage', 'SECOND_ORDER_CONTINUOUS_EXTREMA_PENDING: checks cover supplied concurrent stations only; no continuous extrema or member approval.')
    # No mode receives an implicit approval merely because all samples pass.
    result['checks'] = list(checks.values())
    result['status'] = 'FAIL' if any(c['status'] == 'FAIL' for c in checks.values()) else 'BLOCKED'
    result['input_sha256'] = input_hash(raw)
    result['remaining'].append('SECOND_ORDER_CONTINUOUS_EXTREMA_PENDING: station-only resistance; global stability and member approval remain blocked.')
    return result
