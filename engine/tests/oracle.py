"""Independent PyNite assembly/results. Does not import the JPN solver.

Two-way Spring3D is an exact axial bar with ks=EA/L. Out-of-plane and
rotational DOFs are restrained to embed XY, with no extra in-plane supports.
An alternate reference uses released frame members to cross-check the spring
representation. Its synthetic G/I/J are test data and vanish from axial response.
"""

import math
from importlib.metadata import version

from Pynite import FEModel3D


def pynite_result(data, *, sparse=True, released_members=False):
    if version("PyNiteFEA") != "3.2.1":
        raise RuntimeError("Reference suite requires PyNiteFEA==3.2.1")
    fe = FEModel3D()
    points = {n["id"]: (n["x_m"], n["y_m"]) for n in data["nodes"]}
    supports = {s["node"]: s for s in data["supports"]}
    for name, (x, y) in points.items():
        fe.add_node(name, x, y, 0)
        s = supports.get(name, {"ux_m": None, "uy_m": None})
        fe.def_support(name, support_DX=s["ux_m"] is not None, support_DY=s["uy_m"] is not None,
                       support_DZ=True, support_RX=True, support_RY=True, support_RZ=True)
        for field, direction in (("ux_m", "DX"), ("uy_m", "DY")):
            if s[field] is not None:
                fe.def_node_disp(name, direction, s[field])
    for member in data["members"]:
        name, a, b = member["id"], member["start"], member["end"]
        if released_members:
            fe.add_material(name, member["e_pa"], member["e_pa"] / 2.6, .3, 0)
            fe.add_section(name, member["area_m2"], 1e-5, 1e-5, 1e-5)
            fe.add_member(name, a, b, name, name)
            fe.def_releases(name, Ryi=True, Rzi=True, Ryj=True, Rzj=True)
        else:
            length = math.dist(points[a], points[b])
            fe.add_spring(name, a, b, member["e_pa"] * member["area_m2"] / length)
    for load in data["loads"]:
        fe.add_node_load(load["node"], "FX", load["fx_n"], case="L")
        fe.add_node_load(load["node"], "FY", load["fy_n"], case="L")
    fe.add_load_combo("validation", {"L": 1})
    fe.analyze_linear(sparse=sparse, check_stability=True)
    members = fe.members if released_members else fe.springs
    return {
        "nodes": {name: {"ux_m": n.DX["validation"], "uy_m": n.DY["validation"],
                         "rx_n": n.RxnFX["validation"], "ry_n": n.RxnFY["validation"]} for name, n in fe.nodes.items()},
        # PyNite's i-end local axial is +compression; JPN is +tension.
        "members": {name: {"axial_n": -float(m.axial(0, "validation") if released_members else m.axial("validation"))} for name, m in members.items()},
    }
