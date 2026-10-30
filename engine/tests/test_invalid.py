from copy import deepcopy
from dataclasses import replace
import json
import subprocess
import sys

import pytest

from jpn_structural import AnalysisError, analyze, parse_request
from .cases import bar, triangle, model


def assert_rejected(data, code):
    with pytest.raises(AnalysisError) as exc:
        analyze(data)
    assert exc.value.code == code


@pytest.mark.parametrize("field", ["e_pa", "area_m2"])
@pytest.mark.parametrize("bad", [0, -1, float("inf"), float("nan"), True, "200000000000", None, 10**1000])
def test_invalid_member_properties(field, bad):
    data = bar()
    data["members"][0][field] = bad
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("field", ["x_m", "y_m"])
@pytest.mark.parametrize("bad", [float("inf"), -float("inf"), float("nan"), False, "1", None])
def test_invalid_coordinates(field, bad):
    data = bar()
    data["nodes"][0][field] = bad
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("field", ["fx_n", "fy_n"])
@pytest.mark.parametrize("bad", [float("inf"), float("nan"), False, "100", None])
def test_invalid_loads(field, bad):
    data = bar()
    data["loads"][0][field] = bad
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("field", ["ux_m", "uy_m"])
@pytest.mark.parametrize("bad", [float("inf"), float("nan"), True, "0"])
def test_invalid_supports(field, bad):
    data = bar()
    data["supports"][0][field] = bad
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("collection", ["nodes", "members", "supports"])
def test_duplicate_identifiers_or_supports(collection):
    data = bar()
    data[collection].append(deepcopy(data[collection][0]))
    assert_rejected(data, "INVALID_INPUT")


def test_reversed_duplicate_member():
    data = triangle()
    data["members"].append({**data["members"][0], "id": "reverse", "start": "1", "end": "0"})
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("collection,field", [("members", "start"), ("members", "end"), ("loads", "node"), ("supports", "node")])
def test_unknown_references(collection, field):
    data = bar()
    data[collection][0][field] = "missing"
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("bad", ["", "  ", "a"*101, 3, [], None])
def test_invalid_node_ids(bad):
    data = bar()
    data["nodes"][0]["id"] = bad
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("collection", ["nodes", "members", "supports", "loads"])
def test_unknown_fields_are_not_ignored(collection):
    data = bar()
    data[collection][0]["unimplemented"] = 1
    assert_rejected(data, "INVALID_INPUT")


@pytest.mark.parametrize("field,bad", [("units", "mm,kN"), ("schema_version", "jpn.truss/2")])
def test_no_silent_unit_or_schema_conversion(field, bad):
    data = bar()
    data[field] = bad
    assert_rejected(data, "UNSUPPORTED_MODEL")


@pytest.mark.parametrize("bad", [None, [], "", 5, {}])
def test_invalid_root(bad):
    assert_rejected(bad, "INVALID_INPUT")


@pytest.mark.parametrize("field,limit", [("nodes", 200), ("members", 1000), ("supports", 200), ("loads", 1000)])
def test_resource_limits(field, limit):
    data = bar()
    data[field] = data[field] * (limit+1)
    assert_rejected(data, "INVALID_INPUT")


def test_empty_model_self_member_and_empty_support():
    data = bar()
    data["members"] = []
    assert_rejected(data, "INVALID_INPUT")
    data = bar()
    data["members"][0]["end"] = "0"
    assert_rejected(data, "INVALID_INPUT")
    data = bar()
    data["supports"][0].update(ux_m=None, uy_m=None)
    assert_rejected(data, "INVALID_INPUT")


def test_dataclass_cannot_bypass_validation():
    data = parse_request(bar())
    invalid = replace(data, members=(replace(data.members[0], area_m2=-1),))
    assert_rejected(invalid, "INVALID_INPUT")


@pytest.mark.parametrize("distance", [0, 1e-16])
def test_zero_or_numerically_zero_length(distance):
    data = bar()
    data["nodes"][1]["x_m"] = distance
    # At origin any positive isolated bar is scale-representable; add an offset
    # so 1e-16 is below the coordinate resolution and must be rejected.
    data["nodes"][0]["y_m"] = data["nodes"][1]["y_m"] = 1
    assert_rejected(data, "INVALID_GEOMETRY")


def test_isolated_node_even_when_fully_restrained():
    data = triangle()
    data["nodes"].append({"id": "isolated", "x_m": 4, "y_m": 7})
    data["supports"].append({"node": "isolated", "ux_m": 0, "uy_m": 0})
    assert_rejected(data, "INVALID_GEOMETRY")


@pytest.mark.parametrize("loaded", [False, True])
def test_mechanisms_are_rejected_even_without_loads(loaded):
    data = triangle()
    data["members"].pop()
    if not loaded:
        data["loads"] = []
    assert_rejected(data, "UNSTABLE")


def test_collinear_triangle_is_singular():
    data = triangle()
    data["nodes"][2]["y_m"] = 0
    assert_rejected(data, "UNSTABLE")


def test_nearly_collinear_triangle_is_not_accepted():
    data = triangle()
    data["nodes"][2]["y_m"] = 1e-6
    assert_rejected(data, "ILL_CONDITIONED")


def test_shallow_triangle_that_passes_condition_limit_exceeds_small_motion_limit():
    data = triangle()
    data["nodes"][2]["y_m"] = 1e-5
    assert_rejected(data, "MODEL_LIMIT")


@pytest.mark.parametrize("e,area", [(1e308, 1e308), (1e-300, 1e-300)])
def test_unrepresentable_stiffness(e, area):
    data = bar()
    data["members"][0].update(e_pa=e, area_m2=area)
    assert_rejected(data, "NUMERICAL_FAILURE")


def test_extreme_load_outside_linear_model():
    data = bar()
    data["loads"][0]["fx_n"] = 1e10
    assert_rejected(data, "MODEL_LIMIT")


def test_disconnected_free_component():
    data = model([(0, 0), (1, 0), (3, 0), (4, 1)], [(0, 1), (2, 3)], [(0, 0, 0), (1, None, 0)], [])
    assert_rejected(data, "UNSTABLE")


@pytest.mark.parametrize("payload", ["{}", "[]", "not json", '{"units":"SI","units":"SI"}', "["*2000, " "*1_000_001, "1"*5000])
def test_cli_errors_have_no_fake_result(payload):
    completed = subprocess.run([sys.executable, "-m", "jpn_structural"], input=payload, text=True, capture_output=True)
    assert completed.returncode == 2, completed.stderr
    response = json.loads(completed.stdout)
    assert response["status"] == "error"
    assert "nodes" not in response and "members" not in response


def test_cli_unstable_error_and_valid_result():
    data = triangle()
    data["supports"] = []
    completed = subprocess.run([sys.executable, "-m", "jpn_structural"], input=json.dumps(data), text=True, capture_output=True)
    assert completed.returncode == 2
    assert json.loads(completed.stdout)["error"]["code"] == "UNSTABLE"
    data = triangle()
    completed = subprocess.run([sys.executable, "-m", "jpn_structural"], input=json.dumps(data), text=True, capture_output=True)
    assert completed.returncode == 0, completed.stderr
    response = json.loads(completed.stdout)
    assert response == analyze(data)
