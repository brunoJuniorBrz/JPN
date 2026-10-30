from copy import deepcopy

import numpy as np
import pytest

from jpn_structural import analyze, parse_request
from .cases import seeded_case, scaled_load, triangle, bar
from .checks import compare, assert_physics


@pytest.mark.parametrize("seed", range(12))
def test_translation_and_member_orientation_invariance(seed):
    data = seeded_case(seed)
    expected = analyze(data)
    moved = deepcopy(data)
    for node in moved["nodes"]:
        node["x_m"] += 1000
        node["y_m"] -= 500
    for member in moved["members"]:
        member["start"], member["end"] = member["end"], member["start"]
    moved["nodes"].reverse()
    moved["members"].reverse()
    compare(analyze(moved), expected)


@pytest.mark.parametrize("seed", range(12))
def test_superposition_and_load_reversal(seed):
    data = seeded_case(seed)
    original = analyze(data)
    for factor in (-1, 2, .25):
        scaled = analyze(scaled_load(data, factor))
        for name, node in original["nodes"].items():
            for field, value in node.items():
                np.testing.assert_allclose(scaled["nodes"][name][field], factor*value, rtol=1e-9, atol=1e-8 if field.endswith("_n") else 1e-13)
        for name, member in original["members"].items():
            assert scaled["members"][name]["axial_n"] == pytest.approx(factor*member["axial_n"], rel=1e-9, abs=1e-8)
        assert scaled["diagnostics"]["strain_energy_j"] == pytest.approx(factor**2*original["diagnostics"]["strain_energy_j"], rel=1e-9)


@pytest.mark.parametrize("seed", range(8))
def test_load_split_and_sum(seed):
    data = seeded_case(seed)
    a, b = deepcopy(data), deepcopy(data)
    cut = len(data["loads"])//2
    a["loads"] = data["loads"][:cut]
    b["loads"] = data["loads"][cut:]
    ra, rb, total = analyze(a), analyze(b), analyze(data)
    for name, node in total["nodes"].items():
        for field, value in node.items():
            np.testing.assert_allclose(value, ra["nodes"][name][field]+rb["nodes"][name][field], rtol=1e-9, atol=1e-8 if field.endswith("_n") else 1e-13)
    for name in total["members"]:
        assert total["members"][name]["axial_n"] == pytest.approx(ra["members"][name]["axial_n"]+rb["members"][name]["axial_n"], rel=1e-9, abs=1e-8)


@pytest.mark.parametrize("seed", range(8))
def test_rigidity_scaling(seed):
    data = seeded_case(seed)
    original = analyze(data)
    for member in data["members"]:
        member["e_pa"] *= 3
        member["area_m2"] *= 2
    r = analyze(data)
    for name, node in original["nodes"].items():
        for field, value in node.items():
            np.testing.assert_allclose(r["nodes"][name][field], value/6 if field.endswith("_m") else value, rtol=1e-9, atol=1e-8 if field.endswith("_n") else 1e-13)
    for name in r["members"]:
        assert r["members"][name]["axial_n"] == pytest.approx(original["members"][name]["axial_n"], rel=1e-9, abs=1e-8)


@pytest.mark.parametrize("factor", [1e-6, 1e-3, 1, 1e3, 1e6])
def test_uniform_geometry_scale(factor):
    data = triangle()
    original = analyze(data)
    for node in data["nodes"]:
        node["x_m"] *= factor
        node["y_m"] *= factor
    r = analyze(data)
    for name, node in original["nodes"].items():
        for field, value in node.items():
            assert r["nodes"][name][field] == pytest.approx(value*factor if field.endswith("_m") else value, rel=1e-9, abs=1e-9 if field.endswith("_n") else 1e-20)
    assert_physics(data, r)


@pytest.mark.parametrize("seed", range(8))
def test_reflection_rotates_vectors_and_preserves_axial(seed):
    data = seeded_case(seed)
    original = analyze(data)
    for node in data["nodes"]:
        node["x_m"] *= -1
    for load in data["loads"]:
        load["fx_n"] *= -1
    r = analyze(data)
    for name, node in original["nodes"].items():
        for field, value in node.items():
            sign = -1 if field in ("ux_m", "rx_n") else 1
            assert r["nodes"][name][field] == pytest.approx(sign*value, rel=1e-9, abs=1e-8 if field.endswith("_n") else 1e-13)
    for name in r["members"]:
        assert r["members"][name]["axial_n"] == pytest.approx(original["members"][name]["axial_n"], rel=1e-9, abs=1e-8)


def test_reciprocity_maxwell_betti():
    a = triangle()
    b = triangle()
    a["loads"] = [{"node": "2", "fx_n": 1000, "fy_n": 0}]
    b["loads"] = [{"node": "1", "fx_n": 2000, "fy_n": 0}]
    ra, rb = analyze(a), analyze(b)
    assert 1000*rb["nodes"]["2"]["ux_m"] == pytest.approx(2000*ra["nodes"]["1"]["ux_m"], rel=1e-12)


def test_multiple_load_entries_accumulate_and_hash_tracks_input():
    data = bar()
    initial = deepcopy(data)
    data["loads"] *= 2
    assert analyze(data)["members"]["M0"]["axial_n"] == pytest.approx(20000)
    assert parse_request(data).digest() != parse_request(initial).digest()
    result = analyze(initial)
    assert initial == bar()  # input was not mutated
    assert result == analyze(parse_request(initial))
    assert result["input_sha256"] == parse_request(initial).digest()
