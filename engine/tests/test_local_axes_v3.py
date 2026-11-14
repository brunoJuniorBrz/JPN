"""C1: Z-up local axes (jpn.mixed3d/3) against closed-form references.

Independent reference, with no PyNite or JPN basis code: an Euler-Bernoulli
cantilever under tip force F and full-span UDL q, resolved on the DECLARED
principal axes e_y, e_z (y horizontal, z in the member's vertical plane, both
rolled by theta). Displacement along e_y is governed by Iz and along e_z by Iy:

    u_tip = sum_k [ (F.e_k) L^3/(3 E I_k) + (q.e_k) L^4/(8 E I_k) ] e_k  +  axial term
"""
from copy import deepcopy
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from jpn_structural.local_axes import CONVENTION, legacy_axis_ambiguity, offset_deg, reference_basis
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError

E, G, AREA, IY, IZ, J = 200e9, 200e9/2.6, 2e-3, 8e-6, 1e-6, 1e-7
SOURCE = "C1 closed-form reference; synthetic"
FORCE, UDL = np.array([120., -230., -340.]), np.array([12., -23., -34.])


def spin(v, degrees):
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    return np.array([c*v[0]-s*v[1], s*v[0]+c*v[1], v[2]])


def cantilever(direction, roll=0., azimuth=0., reverse=False, version=3, iy=IY, iz=IZ, length=3.):
    """Fixed at ROOT, free at TIP; loads follow the model when it is spun about Z."""
    x = spin(np.array(direction, dtype=float)/np.linalg.norm(direction), azimuth)
    root, tip = np.array([1., 2., 3.]), np.array([1., 2., 3.])+length*x
    start, end = ("TIP", "ROOT") if reverse else ("ROOT", "TIP")
    raw = dict(schema_version=f"jpn.mixed3d/{version}", units="SI", theory="linear-elastic-frame-axial",
               project=dict(id="C1", revision="1", source=SOURCE),
               nodes=[dict(id=k, x_m=float(p[0]), y_m=float(p[1]), z_m=float(p[2])) for k, p in (("ROOT", root), ("TIP", tip))],
               members=[dict(id="B", start=start, end=end, kind="frame", material="M", section="S", rotation_deg=float(roll),
                             release_start=[False]*6, release_end=[False]*6)],
               materials=[dict(id="M", e_pa=E, g_pa=G, nu=.3, source=SOURCE, revision="1")],
               sections=[dict(id="S", area_m2=AREA, iy_m4=iy, iz_m4=iz, j_m4=J, source=SOURCE, revision="1")],
               supports=[dict(node="ROOT", restrained=[True]*6)], cases=[dict(id="L", source=SOURCE)],
               nodal_loads=[dict(node="TIP", case="L", **dict(zip(("fx_n", "fy_n", "fz_n"), map(float, spin(FORCE, azimuth)))), mx_nm=0., my_nm=0., mz_nm=0.)],
               combinations=[dict(id="C", factors=dict(L=1.))],
               member_loads=[dict(id="q", member="B", case="L", coordinate_system="global",
                                  force_per_length_n_m=list(map(float, spin(UDL, azimuth))), source=SOURCE, revision="1")],
               self_weight=None)
    if version == 3:
        raw["local_axes"] = CONVENTION
    return raw, x, length


def closed_form(x, length, roll, azimuth, iy=IY, iz=IZ):
    """Declared principal axes built here from first principles, not from the engine."""
    horizontal = np.cross([0., 0., 1.], x)
    ey = np.array([0., 1., 0.]) if np.linalg.norm(horizontal) < 1e-12 else horizontal/np.linalg.norm(horizontal)
    ez = np.cross(x, ey)
    c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    ey, ez = c*ey+s*ez, -s*ey+c*ez
    f, q = spin(FORCE, azimuth), spin(UDL, azimuth)
    u = ((f@x)*length/(E*AREA)+(q@x)*length**2/(2*E*AREA))*x
    for axis, inertia in ((ey, iz), (ez, iy)):
        u = u+((f@axis)*length**3/(3*E*inertia)+(q@axis)*length**4/(8*E*inertia))*axis
    return u


def tip(raw):
    analyze = analyze_mixed3d_v3 if raw["schema_version"].endswith("/3") else analyze_loaded_mixed3d
    return np.array(analyze(raw)["combinations"]["C"]["nodes"]["TIP"]["translation_m"])


DIRECTIONS = {"horizontal-x": (1, 0, 0), "horizontal-y": (0, 1, 0), "horizontal-skew": (2, 3, 0), "slope-xz": (10, 0, 1),
              "slope-yz": (0, 10, 1), "slope-yz-tiny": (0, 1, 1e-5), "slope-skew": (2, 3, 1), "steep-skew": (-2, -3, 4),
              "downhill": (3, -1, -2), "vertical-up": (0, 0, 1), "vertical-down": (0, 0, -1)}


@pytest.mark.parametrize("name", DIRECTIONS)
@pytest.mark.parametrize("roll", [0., 17., 90., -23., 180.])
@pytest.mark.parametrize("reverse", [False, True])
def test_tip_displacement_matches_closed_form_for_every_direction_roll_and_end_order(name, roll, reverse):
    raw, x, length = cantilever(DIRECTIONS[name], roll=roll, reverse=reverse)
    # The declared reference follows the member's own start->end axis. Reversing
    # the ends of a non-vertical member keeps the physical section; for a vertical
    # one it mirrors z_ref, which the closed form reproduces with the same rule.
    member_x = -x if reverse else x
    np.testing.assert_allclose(tip(raw), closed_form(member_x, length, roll, 0.), rtol=2e-9, atol=1e-13)


@pytest.mark.parametrize("name", [n for n in DIRECTIONS if not n.startswith("vertical")])
@pytest.mark.parametrize("roll", [0., 17., 90.])
def test_reversing_the_ends_does_not_change_the_physical_response(name, roll):
    forward, backward = (tip(cantilever(DIRECTIONS[name], roll=r, reverse=rev)[0]) for r, rev in ((roll, False), (-roll, True)))
    # Same physical section: seen from the other end, a right-hand roll changes sign.
    np.testing.assert_allclose(backward, forward, rtol=2e-9, atol=1e-13)


@pytest.mark.parametrize("name", ["horizontal-x", "slope-xz", "slope-skew", "steep-skew"])
@pytest.mark.parametrize("azimuth", [30., 90., 135., 270.])
@pytest.mark.parametrize("roll", [0., 17.])
def test_spinning_structure_and_loads_about_global_z_spins_the_response(name, azimuth, roll):
    base = tip(cantilever(DIRECTIONS[name], roll=roll)[0])
    turned = tip(cantilever(DIRECTIONS[name], roll=roll, azimuth=azimuth)[0])
    np.testing.assert_allclose(turned, spin(base, azimuth), rtol=2e-9, atol=1e-13)


def test_zero_roll_means_iy_resists_gravity_in_every_plan_direction_and_slope():
    for azimuth in (0., 30., 90., 135., 180., 270.):
        for rise in (0., 6e-5, .6):
            a, b = np.array([0., 0., 3.]), np.array([*spin(np.array([6., 0., 0.]), azimuth)[:2], 3.+rise])
            mid = (a+b)/2
            hinge = [False, False, False, False, True, True]
            member = lambda i, s, e, **k: dict(dict(id=i, start=s, end=e, kind="frame", material="M", section="S", rotation_deg=0.,
                                                    release_start=[False]*6, release_end=[False]*6), **k)
            raw = dict(schema_version="jpn.mixed3d/3", local_axes=CONVENTION, units="SI", theory="linear-elastic-frame-axial",
                       project=dict(id="C1", revision="1", source=SOURCE),
                       nodes=[dict(id=k, x_m=float(p[0]), y_m=float(p[1]), z_m=float(p[2])) for k, p in (("A", a), ("M", mid), ("B", b))],
                       members=[member("B1", "A", "M", release_start=hinge), member("B2", "M", "B", release_end=hinge)],
                       materials=[dict(id="M", e_pa=E, g_pa=G, nu=.3, source=SOURCE, revision="1")],
                       sections=[dict(id="S", area_m2=AREA, iy_m4=IY, iz_m4=IZ, j_m4=J, source=SOURCE, revision="1")],
                       supports=[dict(node=n, restrained=[True]*6) for n in "AB"], cases=[dict(id="G", source=SOURCE)], nodal_loads=[],
                       combinations=[dict(id="C", factors=dict(G=1.))], self_weight=None,
                       member_loads=[dict(id="q"+i, member=i, case="G", coordinate_system="global", force_per_length_n_m=[0., 0., -100.],
                                          source=SOURCE, revision="1") for i in ("B1", "B2")])
            u = np.array(analyze_mixed3d_v3(raw)["combinations"]["C"]["nodes"]["M"]["translation_m"])
            length = float(np.linalg.norm(b-a)); cosine = 6./length
            normal = 5*100*cosine*length**4/(384*E*IY)        # simply supported, load component normal to the axis
            lateral = abs(-u[0]*math.sin(math.radians(azimuth))+u[1]*math.cos(math.radians(azimuth)))
            assert lateral < 1e-12
            # Axial shortening of the inclined member adds O(1e-7 m); bending governs.
            assert abs(u[2]) == pytest.approx(normal*cosine, rel=2e-4)


def test_legacy_contracts_keep_their_numbers_and_the_documented_defect_is_reproduced():
    # Same member and declared roll: /2 answers with the weak axis once the member leaves the XZ plane.
    weak, strong = tip(cantilever((0, 10, 1), version=2)[0]), tip(cantilever((0, 10, 1))[0])
    raw, x, length = cantilever((0, 10, 1))
    np.testing.assert_allclose(strong, closed_form(x, length, 0., 0.), rtol=2e-9, atol=1e-13)
    np.testing.assert_allclose(weak, closed_form(x, length, 90., 0.), rtol=2e-9, atol=1e-13)   # i.e. a 90 degree physical roll
    assert abs(weak[2]/strong[2]) > 5
    # Where both conventions coincide, /3 reproduces /2 exactly.
    for direction in ((1, 0, 0), (10, 0, 1), (0, 0, 1)):
        np.testing.assert_allclose(tip(cantilever(direction)[0]), tip(cantilever(direction, version=2)[0]), rtol=1e-12, atol=1e-15)


def test_ambiguity_guard_flags_only_members_whose_physical_axes_depend_on_global_direction():
    flagged = lambda direction, **k: legacy_axis_ambiguity(cantilever(direction, version=2, **k)[0])
    for direction in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (2, 3, 0), (10, 0, 1), (-10, 0, 1), (0, 0, 1), (0, 0, -1)):
        assert flagged(direction) == []
    for direction in ((0, 10, 1), (0, 1, 1e-5), (2, 3, 1), (-2, -3, 4), (1e-3, 0, 1)):
        assert flagged(direction) == ["B"]
        assert flagged(direction, iy=IY, iz=IY) == []        # equal inertias: nothing to confuse


def test_v3_contract_is_explicit_and_fails_closed():
    raw = cantilever((2, 3, 1))[0]
    result = analyze_mixed3d_v3(raw)
    assert result["schema_version"] == "jpn.mixed3d-result/3" and result["solver"]["adapter"] == "jpn-mixed3d/3"
    row = result["local_axes"]["members"]["B"]
    assert result["local_axes"]["convention"] == CONVENTION and row["declared_rotation_deg"] == 0.
    basis = np.array(row["global_to_local"])
    np.testing.assert_allclose(basis, reference_basis((1., 2., 3.), np.array([1., 2., 3.])+np.array([2., 3., 1.])), atol=1e-12)
    np.testing.assert_allclose(basis@basis.T, np.eye(3), atol=1e-12)
    assert basis[1][2] == pytest.approx(0., abs=1e-12) and basis[2][2] > 0           # y horizontal, z upward
    assert row["solver_rotation_deg"] == pytest.approx(offset_deg((1., 2., 3.), (3., 5., 4.)))
    assert result["combinations"]["C"]["equilibrium"]["relative_residual"] <= 1e-8
    for change, code in ((dict(local_axes="pynite"), "AXIS_CONVENTION_REQUIRED"), (dict(schema_version="jpn.mixed3d/2"), "UNSUPPORTED_MODEL")):
        with pytest.raises(AnalysisError) as error:
            analyze_mixed3d_v3({**deepcopy(raw), **change})
        assert error.value.code == code
    missing = deepcopy(raw); missing.pop("local_axes")
    with pytest.raises(AnalysisError):
        analyze_mixed3d_v3(missing)
    with pytest.raises(AnalysisError) as error:                 # /2 does not accept the new field either
        analyze_loaded_mixed3d({**deepcopy(raw), "schema_version": "jpn.mixed3d/2"})
    assert error.value.code == "INVALID_INPUT"
    with pytest.raises(AnalysisError) as error:                 # 0.06 degrees from vertical: no reference is invented
        analyze_mixed3d_v3(cantilever((1e-3, 0, 1))[0])
    assert error.value.code == "AXIS_REFERENCE_NEAR_VERTICAL"
    assert analyze_mixed3d_v3(deepcopy(raw))["input_sha256"] == result["input_sha256"] != analyze_mixed3d_v3(cantilever((2, 3, 1), roll=1.)[0])["input_sha256"]


WORKER = Path(__file__).resolve().parents[1]/"local_mixed_worker.py"


def worker(raw, *flags):
    done = subprocess.run([sys.executable, "-I", "-X", "utf8", str(WORKER), *flags], input=json.dumps(raw).encode(), capture_output=True, timeout=60)
    return done.returncode, json.loads(done.stdout)


def test_real_worker_runs_v3_and_refuses_ambiguous_legacy_requests_without_results():
    code, out = worker(cantilever((0, 10, 1))[0], "--joint-actions")
    assert code == 0 and out["result"]["schema_version"] == "jpn.mixed3d-result/3"
    assert out["joint_actions"]["input_sha256"] == out["result"]["input_sha256"]
    code, out = worker(cantilever((0, 10, 1), version=2)[0])
    assert code == 2 and out["error"]["code"] == "AXIS_CONVENTION_AMBIGUOUS" and "result" not in out
    code, out = worker(cantilever((10, 0, 1), version=2)[0])
    assert code == 0 and out["result"]["schema_version"] == "jpn.mixed3d-result/2"
