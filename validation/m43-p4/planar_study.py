"""Systematic P3 physical-end refinement within unchanged application limits."""
from pathlib import Path
import json
import math
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/"engine"))
from tests.test_corotational_planar import request
from jpn_structural.corotational_planar import run_mesh, validate_request


def physical_ends(mesh):
    answer = mesh["combinations"]["C"]
    out = {}
    for parent in {m["parent_member"] for m in mesh["numerical_member_mapping"]}:
        children = sorted((m for m in mesh["numerical_member_mapping"] if m["parent_member"] == parent), key=lambda m: m["start_fraction"])
        rows = answer["members"]
        out[parent] = np.array(rows[children[0]["id"]]["end_actions_global"][:6]+
                               rows[children[-1]["id"]]["end_actions_global"][6:])
    return out


def study(runner=run_mesh):
    cases = []
    for ratio in (0., .1, .2, .4):
        data = validate_request(request("sway", ratio=ratio, coarse=24))
        levels, previous, previous_delta = [], None, None
        for n in (6, 12, 24, 48):
            mesh = runner(data, n)
            ends = physical_ends(mesh)
            row = dict(subdivisions=n, nodes=mesh["node_count"], members=mesh["member_count"],
                       physical_end_actions={k: v.tolist() for k, v in ends.items()},
                       physical_nodes={p["id"]: mesh["combinations"]["C"]["nodes"][p["id"]] for p in data["nodes"]},
                       scaled_condition=mesh["elastic_scaled_condition"])
            if previous is not None:
                differences = [(float(abs(v[i]-previous[k][i])/max(1., abs(v[i]))), k, i,
                                float(v[i]), float(previous[k][i]), float(abs(v[i]-previous[k][i])))
                               for k, v in ends.items() for i in range(12)]
                worst = max(differences)
                delta = max(abs(ends[k]-previous[k]).max() for k in ends)
                row.update(refinement_error=worst[0], worst_parent=worst[1], worst_component=worst[2],
                           fine_value=worst[3], coarse_value=worst[4], absolute_difference=worst[5],
                           maximum_absolute_end_difference=float(delta), criterion_met=bool(worst[0] <= 1e-4))
                if previous_delta:
                    row["observed_absolute_order"] = math.log(previous_delta/delta, 2)
                previous_delta = delta
            levels.append(row)
            previous = ends
        cases.append(dict(compression_scale_of_reference_column=ratio, levels=levels))
        last = levels[-1]
        print(f"P={ratio:g}: error={last['refinement_error']:.9g}, culprit={last['worst_parent']}[{last['worst_component']}], fine={last['fine_value']:.9g}, delta={last['absolute_difference']:.9g}, order={last.get('observed_absolute_order')}", flush=True)
    return cases


if __name__ == "__main__":
    result = dict(schema_version="jpn.m43-p4-planar-study/1", formulation="unchanged P3", cases=study(),
                  operational_limits=dict(nodes=150, members=320), production_enabled=False)
    path = ROOT/"validation/m43-p4/p3-planar-baseline.json"
    path.write_text(json.dumps(result, indent=2, allow_nan=False)+"\n", encoding="utf-8")
