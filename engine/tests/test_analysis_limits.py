"""INT-1c: combinations limited by the single-envelope result budget (not by a fixed 10), solution_mode, same hash."""
import json
import itertools
import pytest
from jpn_structural.analysis_limits import (OUTPUT_BYTES, bytes_per_combination, combination_limit, fixed_bytes,
                                           MAX_CASES, MAX_COMBINATIONS)
from jpn_structural.frame3d_model import input_hash
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError

SRC = 'INT-1c synthetic portal frame'


def portal(combos, frames_extra=0):
    nodes = [dict(id=i, x_m=x, y_m=0., z_m=z) for i, (x, z) in zip('ABCD', [(0, 0), (0, 4), (6, 4), (6, 0)])]
    members = [dict(id=i, start=s, end=e, kind='frame', material='M', section='S', rotation_deg=0.,
                    release_start=[False]*6, release_end=[False]*6) for i, s, e in [('C1', 'A', 'B'), ('BM', 'B', 'C'), ('C2', 'D', 'C')]]
    cases = [dict(id=c, source=SRC) for c in ('G', 'Q', 'W1', 'W2')]
    return dict(schema_version='jpn.mixed3d/3', units='SI', theory='linear-elastic-frame-axial',
                project=dict(id='INT1C', revision='1', source=SRC), nodes=nodes, members=members,
                materials=[dict(id='M', e_pa=200e9, g_pa=200e9/2.6, nu=.3, source=SRC, revision='1')],
                sections=[dict(id='S', area_m2=2e-3, iy_m4=8e-6, iz_m4=8e-6, j_m4=1e-7, source=SRC, revision='1')],
                supports=[dict(node=n, restrained=[True]*6) for n in 'AD'], cases=cases,
                nodal_loads=[dict(node='B', case='W1', fx_n=1000., fy_n=0., fz_n=0., mx_nm=0., my_nm=0., mz_nm=0.),
                             dict(node='C', case='W2', fx_n=-1500., fy_n=0., fz_n=0., mx_nm=0., my_nm=0., mz_nm=0.)],
                combinations=combos, self_weight=None, local_axes='jpn-z-up/1',
                member_loads=[dict(id='g'+m+c, member=m, case=c, coordinate_system='global', force_per_length_n_m=[0., 0., -q], source=SRC, revision='1')
                              for m in ('BM',) for c, q in (('G', 2000.), ('Q', 3000.))])


def many(n):
    out = []
    for k, f in zip(range(n), itertools.cycle([(1.25, 1.5, 0, 0), (1.25, 0, 1.4, 0), (1.25, 0, 0, 1.4), (1.0, .7, .3, 0), (1.0, 0, 0, .3), (1.35, 1.5, .84, 0)])):
        out.append(dict(id=f'K{k:03d}', factors=dict(G=f[0]+k*1e-3, Q=float(f[1]), W1=float(f[2]), W2=float(f[3]))))
    return out


def test_thirty_plus_combinations_in_one_execution_with_one_hash():
    raw = portal(many(36))
    result = analyze_mixed3d_v3(raw)
    assert len(result['combinations']) == 36 and result['input_sha256'] == input_hash(raw)
    assert all(c['equilibrium']['relative_residual'] < 1e-8 for c in result['combinations'].values())
    assert len(json.dumps(result)) < OUTPUT_BYTES


def test_derived_limit_follows_model_size_and_matches_real_output():
    # estimate is conservative against the real size of one combination (4 nodes, 3 frame members)
    result = analyze_mixed3d_v3(portal(many(1)))
    real = len(json.dumps(result['combinations']['K000'], separators=(',', ':')))
    assert real < bytes_per_combination(4, 3, 0)
    # and the whole response stays under the budget the limit was derived from
    n = combination_limit(4, 3, 0, member_loads=2)
    assert n == MAX_COMBINATIONS and 36 <= n
    big = combination_limit(132, 207, 36)
    assert 1 <= big < 10                                           # a very large model: the 2 MB output cap binds
    assert combination_limit(150, 320, 0) < combination_limit(30, 40, 0) < MAX_COMBINATIONS or combination_limit(30, 40, 0) == MAX_COMBINATIONS
    assert fixed_bytes(0) < fixed_bytes(10, 50, 50)


def test_limit_is_enforced_with_an_actionable_message():
    with pytest.raises(AnalysisError, match='limite'):
        analyze_mixed3d_v3(portal(many(MAX_COMBINATIONS+1)))
    cases = portal(many(2))
    cases['cases'] = cases['cases']+[dict(id=f'X{i}', source=SRC) for i in range(MAX_CASES)]
    with pytest.raises(AnalysisError):
        analyze_mixed3d_v3(cases)


def numbers(result):
    out = []
    for cid in sorted(result['combinations']):
        c = result['combinations'][cid]
        for nid in sorted(c['nodes']):
            out += c['nodes'][nid]['translation_m']+c['nodes'][nid]['reaction_force_n']
        for mid in sorted(c['members']):
            out += c['members'][mid]['end_actions_local']
    return out


def test_solution_modes_give_identical_linear_numbers_and_keep_old_hashes():
    base = portal(many(12))
    plain = analyze_mixed3d_v3(base)
    assert plain['input_sha256'] == input_hash(base) and 'solution_mode' not in plain       # existing /3 requests unchanged
    sup = analyze_mixed3d_v3({**base, 'solution_mode': 'linear-superposition'})
    per = analyze_mixed3d_v3({**base, 'solution_mode': 'per-combination'})
    assert sup['input_sha256'] == per['input_sha256'] == input_hash({**base, 'solution_mode': 'linear-superposition'}) or \
        (sup['input_sha256'] == input_hash({**base, 'solution_mode': 'linear-superposition'}) and per['input_sha256'] == input_hash({**base, 'solution_mode': 'per-combination'}))
    a, b, c = numbers(plain), numbers(sup), numbers(per)
    assert len(a) == len(b) == len(c)
    for x, y, z in zip(a, b, c):
        assert abs(x-y) <= 1e-12*max(1., abs(x)) and abs(x-z) <= 1e-9*max(1., abs(x))        # superposition vs one solve per combination
    assert per['solution_mode'] == 'per-combination' and sup['solution_mode'] == 'linear-superposition'
    with pytest.raises(AnalysisError, match='UNSUPPORTED_SOLUTION_MODE|solution_mode'):
        analyze_mixed3d_v3({**base, 'solution_mode': 'second-order'})


def chain(nodes, combos):
    raw = portal(combos)
    raw['nodes'] = [dict(id=f'N{i}', x_m=float(i), y_m=0., z_m=0.) for i in range(nodes)]
    raw['members'] = [dict(id=f'M{i}', start=f'N{i}', end=f'N{i+1}', kind='frame', material='M', section='S', rotation_deg=0.,
                           release_start=[False]*6, release_end=[False]*6) for i in range(nodes-1)]
    raw['supports'] = [dict(node='N0', restrained=[True]*6), dict(node=f'N{nodes-1}', restrained=[True]*6)]
    raw['nodal_loads'] = [dict(node='N1', case=c, fx_n=0., fy_n=0., fz_n=-1000., mx_nm=0., my_nm=0., mz_nm=0.) for c in ('W1', 'W2')]
    raw['member_loads'] = [dict(id=f'g{c}', member='M2', case=c, coordinate_system='global', force_per_length_n_m=[0., 0., -q], source=SRC, revision='1') for c, q in (('G', 2000.), ('Q', 3000.))]
    return raw


def test_large_model_derived_limit_is_exact_and_the_real_result_fits_under_the_cap():
    from jpn_structural.analysis_limits import combination_limit as limit
    allowed = limit(120, 119, 0, 2)
    assert 4 <= allowed < 36
    ok = analyze_mixed3d_v3(chain(120, many(allowed)))
    size = len(json.dumps(ok))
    assert size < OUTPUT_BYTES                                       # the derived limit really keeps the response under 2 MB
    with pytest.raises(AnalysisError, match='limite derivado'):
        analyze_mixed3d_v3(chain(120, many(allowed+1)))
