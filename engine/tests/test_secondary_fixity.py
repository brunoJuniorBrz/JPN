"""C2: the unchanged mechanism gate decides the purlin-fixity counterfactual.

Two pinned-base portals joined only by purlins. No stiffness, support or
tolerance is introduced; only declared end releases differ between variants.
"""
from copy import deepcopy
from math import sqrt

import pytest

from jpn_structural.mixed3d import analyze_mixed3d
from jpn_structural.model import AnalysisError

SOURCE = "C2 synthetic stability reference; not a site model"
HINGE = [False, False, False, False, True, True]


def shed(purlin_release=None, braced=False):
    points = dict(B1=(0, 0, 0), T1=(0, 0, 4), B2=(6, 0, 0), T2=(6, 0, 4),
                  B3=(0, 5, 0), T3=(0, 5, 4), B4=(6, 5, 0), T4=(6, 5, 4))
    def frame(name, start, end, section="MAIN", release=None):
        return dict(id=name, start=start, end=end, kind="frame", material="M", section=section, rotation_deg=0.,
                    release_start=list(release or [False]*6), release_end=list(release or [False]*6))
    members = [frame("C1", "B1", "T1"), frame("C2", "B2", "T2"), frame("C3", "B3", "T3"), frame("C4", "B4", "T4"),
               frame("R1", "T1", "T2"), frame("R2", "T3", "T4"),
               frame("P1", "T1", "T3", "PURLIN", purlin_release), frame("P2", "T2", "T4", "PURLIN", purlin_release)]
    if braced:
        members += [dict(id=name, start=a, end=b, kind="axial", e_pa=200e9, area_m2=5e-4, source=SOURCE, revision="1")
                    for name, a, b in (("X1", "B1", "T3"), ("X2", "B2", "T4"))]
    section = lambda name, a, iy, iz, j: dict(id=name, area_m2=a, iy_m4=iy, iz_m4=iz, j_m4=j, source=SOURCE, revision="1")
    return dict(schema_version="jpn.mixed3d/1", units="SI", theory="linear-elastic-frame-axial",
                project=dict(id="C2", revision="1", source=SOURCE),
                nodes=[dict(id=k, x_m=float(x), y_m=float(y), z_m=float(z)) for k, (x, y, z) in points.items()], members=members,
                materials=[dict(id="M", e_pa=200e9, g_pa=200e9/2.6, nu=.3, source=SOURCE, revision="1")],
                sections=[section("MAIN", 4e-3, 4e-5, 4e-5, 1e-6), section("PURLIN", 6e-4, 8e-7, 1e-7, 2e-9)],
                supports=[dict(node=n, restrained=[True, True, True, False, False, True]) for n in ("B1", "B2", "B3", "B4")],
                cases=[dict(id="W", source=SOURCE)],
                nodal_loads=[dict(node=n, case="W", fx_n=0., fy_n=1000., fz_n=0., mx_nm=0., my_nm=0., mz_nm=0.) for n in ("T1", "T2")],
                combinations=[dict(id="C", factors=dict(W=1.))])


def test_rigid_purlins_alone_make_an_unbraced_shed_look_stable():
    combo = analyze_mixed3d(shed())["combinations"]["C"]
    assert combo["equilibrium"]["relative_residual"] <= 1e-8
    # Statics: 1 kN at 4 m per line, resisted only by the two end moments of one purlin.
    assert max(abs(combo["members"]["P1"]["end_actions_local"][i]) for i in (4, 5, 10, 11)) == pytest.approx(2000., rel=1e-3)


def test_same_shed_is_a_mechanism_once_purlin_bending_is_released():
    with pytest.raises(AnalysisError) as error:
        analyze_mixed3d(shed(HINGE))
    assert error.value.code == "UNSTABLE"


def test_declared_axial_bracing_keeps_the_released_shed_stable_with_exact_brace_force():
    combo = analyze_mixed3d(shed(HINGE, braced=True))["combinations"]["C"]
    assert combo["equilibrium"]["relative_residual"] <= 1e-8
    for name in ("X1", "X2"):
        assert abs(combo["members"][name]["axial_n"]) == pytest.approx(1000*sqrt(41)/5, rel=1e-9)
    assert all(abs(combo["members"]["P1"]["end_actions_local"][i]) < 1e-6 for i in (4, 5, 10, 11))
    reactions = [sum(combo["nodes"][n]["reaction_force_n"][k] for n in ("B1", "B2", "B3", "B4")) for k in range(3)]
    assert reactions == pytest.approx([0., -2000., 0.], abs=1e-6)


def test_counterfactual_changes_only_purlin_bending_releases():
    declared, released = shed(), shed(HINGE)
    for a, b in zip(declared["members"], released["members"]):
        if a["id"] in ("P1", "P2"):
            assert (b["release_start"], b["release_end"]) == (HINGE, HINGE)
            b = dict(deepcopy(b), release_start=a["release_start"], release_end=a["release_end"])
        assert a == b
    assert {k: v for k, v in declared.items() if k != "members"} == {k: v for k, v in released.items() if k != "members"}
