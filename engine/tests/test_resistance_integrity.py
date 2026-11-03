"""Adversarial missing-result controls; absent components are never zeros."""
from copy import deepcopy

import pytest

from jpn_structural.coldformed_design import analyze_coldformed_design
from jpn_structural.model import AnalysisError
from .test_coldformed_design import member


@pytest.mark.parametrize('component', ['vyN', 'vzN', 'tNm', 'myNm', 'mzNm'])
def test_partial_frame_vector_is_not_admitted_as_an_axial_result(component):
    raw = member()
    raw['fields'][0]['forces'][component] = None
    with pytest.raises(AnalysisError) as caught:
        analyze_coldformed_design(raw)
    assert caught.value.code == 'INCOMPLETE_FORCE_FIELD'


def test_original_member_cannot_switch_between_frame_and_axial_kinematics():
    raw = member()
    first = raw['fields'][0]
    first['length_m'] = 1.
    second = deepcopy(first)
    second.update(segment_id='F2', offset_m=1.)
    second['forces'] = {key: ([-10000.] if key == 'nN' else None)
                        for key in second['forces']}
    raw['fields'].append(second)
    with pytest.raises(AnalysisError) as caught:
        analyze_coldformed_design(raw)
    assert caught.value.code == 'INCONSISTENT_FORCE_MODEL'


def test_real_axial_null_components_remain_absent_and_conditional():
    raw = member()
    raw['fields'][0]['forces'] = {
        key: ([1000.] if key == 'nN' else None)
        for key in raw['fields'][0]['forces']}
    raw['critical'] = {key: None for key in raw['critical']}
    raw['study']['minimum_search'] = 'not-required-pure-tension'
    result = analyze_coldformed_design(raw)
    assert result['status'] == 'CONDITIONAL-EXTERNAL-INPUTS'
    assert result['checks'][0]['governing']['forces']['myNm'] is None
    assert not result['approved_for_fabrication']
