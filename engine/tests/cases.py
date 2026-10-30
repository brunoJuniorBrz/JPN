"""Synthetic validation fixtures, never defaults for engineering projects."""

from copy import deepcopy
import random


def model(points, edges, supports, loads):
    return {
        "schema_version": "jpn.truss/1", "units": "SI",
        "nodes": [{"id": str(i), "x_m": x, "y_m": y} for i, (x, y) in enumerate(points)],
        "members": [{"id": f"M{i}", "start": str(a), "end": str(b), "e_pa": 200e9, "area_m2": 1e-3} for i, (a, b) in enumerate(edges)],
        "supports": [{"node": str(n), "ux_m": x, "uy_m": y} for n, x, y in supports],
        "loads": [{"node": str(n), "fx_n": x, "fy_n": y} for n, x, y in loads],
    }


def bar():
    return model([(0, 0), (2, 0)], [(0, 1)], [(0, 0, 0), (1, None, 0)], [(1, 10000, 0)])


def triangle():
    return model([(0, 0), (2, 0), (1, 1)], [(0, 1), (0, 2), (1, 2)], [(0, 0, 0), (1, None, 0)], [(2, 0, -10000)])


def seeded_case(seed):
    rng = random.Random(seed)
    family = seed % 4
    if family == 0:
        span = rng.uniform(1, 15)
        data = model([(0, 0), (span, 0), (span*rng.uniform(.15, .85), span*rng.uniform(.25, .8))],
                     [(0, 1), (0, 2), (1, 2)], [(0, 0, 0), (1, None, 0)], [])
    else:
        panels = rng.randint(2, 7)
        step = rng.uniform(.8, 2)
        points = [(i*step, 0) for i in range(panels+1)]
        points += [(i*step, rng.uniform(1, 2.5)) for i in range(panels+1)]
        offset = panels + 1
        edges = [(i, offset+i) for i in range(panels+1)]
        for i in range(panels):
            edges += [(i, i+1), (offset+i, offset+i+1), (i, offset+i+1)]
            if family == 2:
                edges += [(offset+i, i+1)]  # redundant bracing: compatibility matters
        supports = [(0, 0, 0), (panels, None, 0)]
        if family == 3:
            supports = [(0, 0, 0), (offset, 0, 0)]  # cantilever, two distinct anchorage nodes
        data = model(points, edges, supports, [])
    if seed % 5 == 0 and family != 3:
        data["supports"][1]["ux_m"] = 0  # two pins, statically indeterminate
    for member in data["members"]:
        member["e_pa"] = rng.uniform(150e9, 220e9)
        member["area_m2"] = rng.uniform(.002, .008)
    for node in data["nodes"]:
        data["loads"].append({"node": node["id"], "fx_n": rng.uniform(-1000, 1000), "fy_n": rng.uniform(-4000, 1000)})
    # Rotate by 90° including supports/loads, to exercise X rollers and vertical members.
    if seed % 2:
        for node in data["nodes"]:
            node["x_m"], node["y_m"] = -node["y_m"], node["x_m"]
        for load in data["loads"]:
            load["fx_n"], load["fy_n"] = -load["fy_n"], load["fx_n"]
        for support in data["supports"]:
            support["ux_m"], support["uy_m"] = support["uy_m"], support["ux_m"]
    return data


def scaled_load(data, factor):
    data = deepcopy(data)
    for load in data["loads"]:
        load["fx_n"] *= factor
        load["fy_n"] *= factor
    return data
