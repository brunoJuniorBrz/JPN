from copy import deepcopy

import pytest

from jpn_structural import AnalysisError, analyze
from .cases import bar, triangle, seeded_case, model
from .checks import assert_physics, compare
from .oracle import pynite_result


@pytest.mark.parametrize("seed", range(1000))
def test_seeded_independent_pynite_and_physics(seed):
    data = seeded_case(seed)
    actual = analyze(data)
    compare(actual, pynite_result(data))
    assert_physics(data, actual)


@pytest.mark.parametrize("fixture", [bar, triangle, lambda: seeded_case(2), lambda: seeded_case(3)])
@pytest.mark.parametrize("sparse", [True, False])
def test_released_frame_member_reference(fixture, sparse):
    data = fixture()
    compare(analyze(data), pynite_result(data, sparse=sparse, released_members=True))


@pytest.mark.parametrize("fixture", [bar, triangle, lambda: seeded_case(2), lambda: seeded_case(3)])
def test_prescribed_displacements_pynite(fixture):
    data = fixture()
    data["supports"][0]["ux_m"] = .0001
    data["supports"][0]["uy_m"] = -.0002
    compare(analyze(data), pynite_result(data))
    assert_physics(data, analyze(data))


@pytest.mark.parametrize("data", [
    model([(0, 0), (2, 0)], [(0, 1)], [(0, 0, 0)], [(1, 0, -1000)]),
    model([(0, 0), (2, 0), (2, 1), (0, 1)], [(0, 1), (1, 2), (2, 3), (3, 0)], [(0, 0, 0), (1, None, 0)], [(2, 1000, 0)]),
    {**triangle(), "supports": []},
])
def test_both_reject_internal_or_rigid_mechanisms(data):
    with pytest.raises(AnalysisError, match="stiffness|mechanism|motion"):
        analyze(data)
    # PyNite reports instability as a general Exception, or numerical failure;
    # do not count input/model-building failures as successful rejection.
    with pytest.raises(Exception, match="(?i)unstable|singular|instability"):
        pynite_result(data)
