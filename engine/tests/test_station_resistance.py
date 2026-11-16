import copy
import pytest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec


def reference_member(name):
    spec = spec_from_file_location(name, Path(__file__).with_name(name+'.py'))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.member


cold_member = reference_member('test_coldformed_design')
steel_member = reference_member('test_steel_i_design')
from jpn_structural.coldformed_design import analyze_coldformed_design
from jpn_structural.steel_i_design import analyze_steel_i_design
from jpn_structural.model import AnalysisError


def sampled(raw):
    out = copy.deepcopy(raw)
    f = out['fields'][0]
    out['fields'] = []
    out['station_demands'] = [dict(segment_id=f['segment_id'], offset_m=0, length_m=f['length_m'],
        stations=[dict(u=i/4, forces={k: None if v is None else v[0] for k, v in f['forces'].items()}) for i in range(5)])]
    return out


@pytest.mark.parametrize('steel', [False, True])
def test_exact_concurrent_sample_governs_without_continuous_approval(steel):
    raw = steel_member({'mzNm': [100.]}) if steel else cold_member()
    if not steel:
        raw['fields'][0]['forces'] = dict(nN=[0.], vyN=[0.], vzN=[0.], tNm=[0.], myNm=[0.], mzNm=[100.])
    evaluate = analyze_steel_i_design if steel else analyze_coldformed_design
    baseline = evaluate(raw)
    request = sampled(raw)
    request['station_demands'][0]['stations'][2]['forces']['mzNm'] = 170.
    out = evaluate(request)
    key = 'mz' if steel else 'mz_positive'
    b = next(c for c in baseline['checks'] if c['id'] == key)
    c = next(c for c in out['checks'] if c['id'] == key)
    assert c['utilization'] == pytest.approx(1.7*b['utilization'], rel=1e-12)
    assert c['governing']['position_m'] == request['station_demands'][0]['length_m']/2
    assert c['governing']['forces']['mzNm'] == 170.
    assert any(c['id'] == 'second-order-station-coverage' and c['status'] == 'BLOCKED' for c in out['checks'])
    assert out['computed_structural_approval'] is False
    assert out['approved_for_fabrication'] is False


def test_steel_cb_is_blocked_instead_of_using_an_invented_constant_moment_diagram():
    out = analyze_steel_i_design(sampled(steel_member({'myNm': [100.]})))
    check = next(c for c in out['checks'] if c['id'] == 'my')
    assert check['status'] == 'BLOCKED'
    assert 'SECOND_ORDER_CB_FIELD_REQUIRED' in check['reason']
    assert 'my' not in out['capacities']


@pytest.mark.parametrize('change', [
    lambda r: r['station_demands'][0]['stations'].pop(),
    lambda r: r['station_demands'][0]['stations'][1]['forces'].update(vyN=None),
    lambda r: r['station_demands'][0]['stations'][1].update(u=.9),
    lambda r: r.update(fields=cold_member()['fields']),
])
def test_missing_mixed_or_reordered_vectors_are_refused(change):
    raw = sampled(cold_member())
    change(raw)
    with pytest.raises(AnalysisError):
        analyze_coldformed_design(raw)
