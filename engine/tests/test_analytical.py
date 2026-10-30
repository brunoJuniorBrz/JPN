from copy import deepcopy
import math

import numpy as np
import pytest

from jpn_structural import analyze
from .cases import bar, triangle, model
from .checks import assert_physics


@pytest.mark.parametrize("force", [10000, -10000, 0, 1e-12])
def test_bar_pl_over_ea(force):
    data = bar()
    data["loads"][0]["fx_n"] = force
    r = analyze(data)
    assert r["nodes"]["1"]["ux_m"] == pytest.approx(force*2/(200e9*1e-3), rel=1e-12, abs=1e-30)
    assert r["members"]["M0"]["axial_n"] == pytest.approx(force, rel=1e-12, abs=1e-25)
    assert r["nodes"]["0"]["rx_n"] == pytest.approx(-force, rel=1e-12, abs=1e-25)
    assert_physics(data, r)


def test_triangle_statics_and_virtual_work_displacement():
    data = triangle()
    r = analyze(data)
    ea = 200e9*1e-3
    np.testing.assert_allclose([r["members"][f"M{i}"]["axial_n"] for i in range(3)], [5000, -5000*math.sqrt(2), -5000*math.sqrt(2)], rtol=1e-12)
    assert r["nodes"]["0"]["ry_n"] == pytest.approx(5000)
    assert r["nodes"]["1"]["ry_n"] == pytest.approx(5000)
    assert r["nodes"]["1"]["ux_m"] == pytest.approx(10000/ea)
    assert r["nodes"]["2"]["ux_m"] == pytest.approx(5000/ea)
    assert r["nodes"]["2"]["uy_m"] == pytest.approx(-10000*(math.sqrt(2)+.5)/ea)
    assert_physics(data, r)


def test_asymmetric_triangle_reactions_from_moments():
    data = triangle()
    data["nodes"][2].update(x_m=.4, y_m=1.7)
    data["loads"][0].update(fx_n=3000, fy_n=-8000)
    r = analyze(data)
    right = (8000*.4 + 3000*1.7)/2
    assert r["nodes"]["0"]["rx_n"] == pytest.approx(-3000)
    assert r["nodes"]["1"]["ry_n"] == pytest.approx(right)
    assert r["nodes"]["0"]["ry_n"] == pytest.approx(8000-right)
    assert_physics(data, r)


def test_load_on_support_is_subtracted_from_reaction():
    data = bar()
    data["loads"].append({"node": "0", "fx_n": 1700, "fy_n": -400})
    r = analyze(data)
    assert r["nodes"]["0"]["rx_n"] == pytest.approx(-11700)
    assert r["nodes"]["0"]["ry_n"] == pytest.approx(400)
    assert_physics(data, r)


def test_prescribed_settlement_without_free_dofs():
    data = bar()
    data["loads"] = []
    data["supports"][1]["ux_m"] = .001
    r = analyze(data)
    assert r["diagnostics"]["free_dofs"] == 0
    assert r["members"]["M0"]["axial_n"] == pytest.approx(100000)
    assert r["nodes"]["0"]["rx_n"] == pytest.approx(-100000)
    assert r["nodes"]["1"]["rx_n"] == pytest.approx(100000)
    assert_physics(data, r)


@pytest.mark.parametrize("segments", [1, 2, 4, 8, 16, 32])
def test_bar_mesh_refinement_exact_axial_solution(segments):
    data = model([(2*i/segments, 0) for i in range(segments+1)], [(i, i+1) for i in range(segments)],
                 [(0, 0, 0)] + [(i, None, 0) for i in range(1, segments+1)], [(segments, 10000, 0)])
    r = analyze(data)
    assert r["nodes"][str(segments)]["ux_m"] == pytest.approx(.0001, rel=1e-11)
    for member in r["members"].values():
        assert member["axial_n"] == pytest.approx(10000, rel=1e-11)
    assert_physics(data, r)


def test_two_bars_in_series_different_stiffness():
    data = model([(0, 0), (1, 0), (3, 0)], [(0, 1), (1, 2)], [(0, 0, 0), (1, None, 0), (2, None, 0)], [(2, 4000, 0)])
    data["members"][1]["area_m2"] *= 2
    r = analyze(data)
    assert r["nodes"]["1"]["ux_m"] == pytest.approx(2e-5)
    assert r["nodes"]["2"]["ux_m"] == pytest.approx(4e-5)
    assert_physics(data, r)


def test_support_settlement_with_free_dofs_rhs_coupling():
    data = triangle()
    data["supports"][0]["ux_m"] = .0004
    data["supports"][1]["uy_m"] = -.0002
    r = analyze(data)
    original = analyze(triangle())
    # Rigid rotation theta = -0.0002/2 plus horizontal translation.
    for node in data["nodes"]:
        a, b = r["nodes"][node["id"]], original["nodes"][node["id"]]
        assert a["ux_m"] == pytest.approx(b["ux_m"] + .0004 + .0001*node["y_m"])
        assert a["uy_m"] == pytest.approx(b["uy_m"] - .0001*node["x_m"])
    assert_physics(data, r)
