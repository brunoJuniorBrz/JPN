"""Explicit synthetic P4 references. No inferred stiffness or physical support."""
from copy import deepcopy
from .test_corotational_planar import request as p3_request, rehash


def request(kind="cantilever", dimension=3, ratio=.1, horizontal=1000., coarse=1):
    base_kind = "cantilever" if kind == "torsion" else kind
    raw = p3_request(base_kind, ratio=ratio, horizontal=horizontal, coarse=coarse)
    raw.update(schema_version="jpn.second-order-frame/3", analysis_type="experimental-p4-corotational-diagnostic",
               dimensionality=dimension, formulation="xz-hermite-arc/1" if dimension == 2 else "spatial-quaternion-arc/1")
    if dimension == 3 and kind in ("cantilever", "sway"):
        # Explicit loads in two directions; not two independently solved planes.
        for load in raw["model"]["nodal_loads"]:
            if load["case"] == "H": load["fy_n"] = .6*load["fx_n"]
        raw["model"]["sections"][0]["iz_m4"] *= 2.
    if kind == "torsion":
        model = raw["model"]
        model["nodes"].append(dict(id="ARM", x_m=1., y_m=0., z_m=4.))
        arm = deepcopy(model["members"][0])
        arm.update(id="PHYSICAL-ARM", start="T0", end="ARM")
        model["members"].append(arm)
        for load in model["nodal_loads"]:
            if load["case"] == "H":
                load.update(node="ARM", fx_n=0., fy_n=horizontal)
    rehash(raw)
    return raw
