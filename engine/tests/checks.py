"""Assertions based on statics, kinematics and work, not JPN diagnostics."""

import math
import numpy as np


def assert_physics(data, result):
    nodes = {n["id"]: n for n in data["nodes"]}
    balance = {key: np.zeros(2) for key in nodes}
    loads = {key: np.zeros(2) for key in nodes}
    work = 0
    energy_twice = 0
    reference = next(iter(nodes.values()))
    resultant = np.zeros(2)
    moment = 0
    scale = 0
    for load in data["loads"]:
        loads[load["node"]] += [load["fx_n"], load["fy_n"]]
    for key, node in nodes.items():
        r = result["nodes"][key]
        external = loads[key] + [r["rx_n"], r["ry_n"]]
        balance[key] += external
        resultant += external
        moment += (node["x_m"]-reference["x_m"])*external[1] - (node["y_m"]-reference["y_m"])*external[0]
        work += external @ [r["ux_m"], r["uy_m"]]
        scale += sum(abs(external)) + sum(abs(loads[key]))
    for member in data["members"]:
        a, b = nodes[member["start"]], nodes[member["end"]]
        dx, dy = b["x_m"]-a["x_m"], b["y_m"]-a["y_m"]
        length = math.hypot(dx, dy)
        direction = np.array([dx, dy])/length
        ni = result["nodes"][member["start"]]
        nj = result["nodes"][member["end"]]
        extension = direction @ [nj["ux_m"]-ni["ux_m"], nj["uy_m"]-ni["uy_m"]]
        axial = result["members"][member["id"]]["axial_n"]
        np.testing.assert_allclose(axial, member["e_pa"]*member["area_m2"]*extension/length, rtol=1e-9, atol=1e-7)
        balance[member["start"]] += axial*direction
        balance[member["end"]] -= axial*direction
        energy_twice += axial*extension
    span = max(math.dist((n["x_m"], n["y_m"]), (reference["x_m"], reference["y_m"])) for n in nodes.values())
    for value in balance.values():
        assert max(abs(value)) <= 1e-9 * max(scale, 1e-100)
    assert max(abs(resultant)) <= 1e-9 * max(scale, 1e-100)
    assert abs(moment) <= 1e-9 * max(scale*span, 1e-100)
    np.testing.assert_allclose(energy_twice, work, rtol=1e-9, atol=1e-12)
    for s in data["supports"]:
        for field in ("ux_m", "uy_m"):
            if s[field] is not None:
                assert result["nodes"][s["node"]][field] == s[field]


def compare(actual, expected):
    maxima = {"displacement_m": 0.0, "reaction_n": 0.0, "axial_n": 0.0}
    for name, node in expected["nodes"].items():
        for field, value in node.items():
            key = "displacement_m" if field.endswith("_m") else "reaction_n"
            atol = 1e-11 if key == "displacement_m" else 1e-5
            np.testing.assert_allclose(actual["nodes"][name][field], value, rtol=1e-7, atol=atol, err_msg=f"{name}.{field}")
            maxima[key] = max(maxima[key], abs(actual["nodes"][name][field]-value))
    for name, member in expected["members"].items():
        value = member["axial_n"]
        np.testing.assert_allclose(actual["members"][name]["axial_n"], value, rtol=1e-7, atol=1e-5, err_msg=name)
        maxima["axial_n"] = max(maxima["axial_n"], abs(actual["members"][name]["axial_n"]-value))
    return maxima
