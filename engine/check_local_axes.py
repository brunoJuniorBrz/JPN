"""Reproducible C1 evidence: legacy /2 versus jpn.mixed3d/3 against closed form.

    python engine/check_local_axes.py            # prints JSON
    python engine/check_local_axes.py --scan engine/examples

Read-only: analyses synthetic beams and scans request files; writes nothing.
"""
import glob
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jpn_structural.local_axes import CONVENTION, legacy_axis_ambiguity, offset_deg  # noqa: E402
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d  # noqa: E402
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3  # noqa: E402

E, IY, IZ, SOURCE = 200e9, 8e-6, 1e-6, "C1 evidence; synthetic simply supported beam, 6 m, 100 N/m gravity"


def beam(azimuth, rise, version):
    a = np.array([0., 0., 3.])
    b = np.array([6*math.cos(math.radians(azimuth)), 6*math.sin(math.radians(azimuth)), 3.+rise])
    b = np.where(abs(b) < 1e-12, 0., b)
    hinge = [False, False, False, False, True, True]
    member = lambda i, s, e, **k: dict(dict(id=i, start=s, end=e, kind="frame", material="M", section="S", rotation_deg=0.,
                                            release_start=[False]*6, release_end=[False]*6), **k)
    raw = dict(schema_version=f"jpn.mixed3d/{version}", units="SI", theory="linear-elastic-frame-axial",
               project=dict(id="C1", revision="1", source=SOURCE),
               nodes=[dict(id=k, x_m=float(p[0]), y_m=float(p[1]), z_m=float(p[2])) for k, p in (("A", a), ("M", (a+b)/2), ("B", b))],
               members=[member("B1", "A", "M", release_start=hinge), member("B2", "M", "B", release_end=hinge)],
               materials=[dict(id="M", e_pa=E, g_pa=E/2.6, nu=.3, source=SOURCE, revision="1")],
               sections=[dict(id="S", area_m2=2e-3, iy_m4=IY, iz_m4=IZ, j_m4=1e-7, source=SOURCE, revision="1")],
               supports=[dict(node=n, restrained=[True]*6) for n in "AB"], cases=[dict(id="G", source=SOURCE)], nodal_loads=[],
               combinations=[dict(id="C", factors=dict(G=1.))], self_weight=None,
               member_loads=[dict(id="q"+i, member=i, case="G", coordinate_system="global", force_per_length_n_m=[0., 0., -100.],
                                  source=SOURCE, revision="1") for i in ("B1", "B2")])
    if version == 3:
        raw["local_axes"] = CONVENTION
    u = np.array((analyze_mixed3d_v3 if version == 3 else analyze_loaded_mixed3d)(raw)["combinations"]["C"]["nodes"]["M"]["translation_m"])
    lateral = abs(-u[0]*math.sin(math.radians(azimuth))+u[1]*math.cos(math.radians(azimuth)))
    length = float(np.linalg.norm(b-a))
    return dict(vertical_mm=float(u[2]*1000), lateral_mm=float(lateral*1000), offset_deg=offset_deg(a, b),
                legacy_guard=legacy_axis_ambiguity(raw) if version == 2 else None,
                closed_form_iy_mm=-5*100*(6/length)**2*length**4/(384*E*IY)*1000, closed_form_iz_mm=-5*100*(6/length)**2*length**4/(384*E*IZ)*1000)


def scan(folder):
    rows = []
    for path in sorted(glob.glob(os.path.join(folder, "*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        model = data.get("model", data) if isinstance(data, dict) else None
        if not isinstance(model, dict) or not all(k in model for k in ("nodes", "members", "sections")):
            continue
        try:
            flagged = legacy_axis_ambiguity(model)
        except Exception as exc:  # report, never hide, a file this scan cannot interpret
            rows.append(dict(file=os.path.basename(path), error=type(exc).__name__)); continue
        rows.append(dict(file=os.path.basename(path), frame_members=sum(m.get("kind") == "frame" for m in model["members"]), ambiguous=flagged))
    return rows


if __name__ == "__main__":
    if "--scan" in sys.argv:
        print(json.dumps(scan(sys.argv[sys.argv.index("--scan")+1]), indent=1))
    else:
        print(json.dumps([dict(azimuth_deg=az, rise_m=rise, legacy_v2=beam(az, rise, 2), z_up_v3=beam(az, rise, 3))
                          for az in (0, 30, 90, 135, 180, 270) for rise in (0., 6e-5, .6)], indent=1))
