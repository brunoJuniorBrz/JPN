"""Adversarial and analytic checks of isolated 3-translation spatial trusses."""
import copy
import numpy as np
import pytest

from jpn_structural.model import AnalysisError
from jpn_structural.truss3d import analyze_truss3d


def beam(axis=0, sign=1, reverse=False):
    a = [0., 0., 0.]
    b = [0., 0., 0.]
    b[axis] = 2.
    load = [0., 0., 0.]
    load[axis] = 1000. * sign
    constrained_b = [True, True, True]
    constrained_b[axis] = False
    return {
        "schema_version": "jpn.truss3d/1", "units": "SI", "theory": "linear-elastic-axial",
        "project": {"id": "P-1", "revision": "r1", "source": "analytical-fixture"},
        "case": {"id": "LC-1", "source": "explicit analytical test force"},
        "nodes": [{"id": "A", "x_m": a[0], "y_m": a[1], "z_m": a[2]},
                  {"id": "B", "x_m": b[0], "y_m": b[1], "z_m": b[2]}],
        "members": [{"id": "AB", "start": "B" if reverse else "A", "end": "A" if reverse else "B",
                     "e_pa": 200e9, "area_m2": 0.01, "source": "test", "revision": "1"}],
        "supports": [{"node": "A", "restrained": [True, True, True]},
                     {"node": "B", "restrained": constrained_b}],
        "loads": [{"node": "B", "fx_n": load[0], "fy_n": load[1], "fz_n": load[2]}],
    }


@pytest.mark.parametrize("axis", [0, 1, 2])
@pytest.mark.parametrize("sign", [-1, 1])
@pytest.mark.parametrize("reverse", [False, True])
def test_axial_analytical_force_displacement_and_reactions(axis, sign, reverse):
    p = beam(axis, sign, reverse)
    r = analyze_truss3d(p)
    expected = sign * 1000. * 2 / (200e9 * 0.01)
    np.testing.assert_allclose(r["nodes"]["B"]["translation_m"][axis], expected, rtol=1e-12)
    np.testing.assert_allclose(r["nodes"]["A"]["reaction_n"][axis], -sign * 1000., atol=1e-8)
    np.testing.assert_allclose(r["members"]["AB"]["axial_n"], sign * 1000., atol=1e-7)
    assert r["diagnostics"]["relative_equilibrium_residual"] < 1e-12
    assert r["schema_version"] == "jpn.truss3d-result/1"
    assert "rotation_rad" not in r["nodes"]["B"]


def tetra():
    p = beam()
    p["nodes"] = [dict(id=n, x_m=x, y_m=y, z_m=z) for n, (x, y, z) in {
        "A": (0., 0., 0.), "B": (1., 0., 0.), "C": (0., 1., 0.), "D": (0., 0., 1.)}.items()]
    p["members"] = [dict(id=a+b, start=a, end=b, e_pa=200e9, area_m2=.01,
                         source="test", revision="1") for a, b in
                    [("A", "B"), ("A", "C"), ("A", "D"), ("B", "C"), ("B", "D"), ("C", "D")]]
    p["supports"] = [dict(node="A", restrained=[True, True, True]),
                     dict(node="B", restrained=[False, True, True]),
                     dict(node="C", restrained=[False, False, True])]
    p["loads"] = [{"node": "D", "fx_n": 100, "fy_n": 200, "fz_n": -1000}]
    return p


def test_tetra_3d_equilibrium_superposition_and_orientation():
    p = tetra()
    r = analyze_truss3d(p)
    assert r["diagnostics"]["free_dofs"] == 6
    assert r["diagnostics"]["relative_equilibrium_residual"] < 1e-10
    assert np.linalg.norm(r["nodes"]["D"]["translation_m"]) > 0
    q = copy.deepcopy(p)
    q["members"][4]["start"], q["members"][4]["end"] = q["members"][4]["end"], q["members"][4]["start"]
    rr = analyze_truss3d(q)
    for nid in r["nodes"]:
        np.testing.assert_allclose(rr["nodes"][nid]["translation_m"], r["nodes"][nid]["translation_m"], rtol=1e-9, atol=1e-13)
    for mid in r["members"]:
        np.testing.assert_allclose(rr["members"][mid]["axial_n"], r["members"][mid]["axial_n"], rtol=1e-8, atol=1e-7)
    q = copy.deepcopy(p)
    for f in q["loads"]:
        for key in ("fx_n", "fy_n", "fz_n"):
            f[key] *= -2
    rr = analyze_truss3d(q)
    for nid in r["nodes"]:
        np.testing.assert_allclose(rr["nodes"][nid]["translation_m"], -2 * np.array(r["nodes"][nid]["translation_m"]), rtol=1e-9, atol=1e-12)
        np.testing.assert_allclose(rr["nodes"][nid]["reaction_n"], -2 * np.array(r["nodes"][nid]["reaction_n"]), rtol=1e-9, atol=1e-7)


def test_missing_lateral_support_rejected_as_mechanism():
    p = beam(); p["supports"][1]["restrained"] = [False, False, True]
    with pytest.raises(AnalysisError, match="rigidez|Mecanismo") as e:
        analyze_truss3d(p)
    assert e.value.code == "UNSTABLE"


def test_tetra_unsupported_remove_member_creates_instability():
    p = tetra(); p["members"].pop()
    with pytest.raises(AnalysisError) as e:
        analyze_truss3d(p)
    assert e.value.code == "UNSTABLE"


@pytest.mark.parametrize("mutate,code", [
    (lambda p: p.update(units="mm"), "UNSUPPORTED_MODEL"),
    (lambda p: p["members"][0].update(area_m2=float("nan")), "INVALID_INPUT"),
    (lambda p: p["members"][0].update(e_pa=float("inf")), "INVALID_INPUT"),
    (lambda p: p["members"][0].update(e_pa=10**500), "INVALID_INPUT"),
    (lambda p: p["members"][0].update(source=" "), "INVALID_INPUT"),
    (lambda p: p["members"][0].update(extra=0), "INVALID_INPUT"),
    (lambda p: p["supports"][0].update(restrained=[True]*6), "INVALID_INPUT"),
    (lambda p: p["loads"][0].update(mx_nm=1), "INVALID_INPUT"),
    (lambda p: p["loads"][0].update(node="NONEXISTENT"), "INVALID_REFERENCE"),
    (lambda p: p["members"][0].update(end="A"), "INVALID_REFERENCE"),
])
def test_invalid_input_rejected(mutate, code):
    p = beam(); mutate(p)
    with pytest.raises(AnalysisError) as e:
        analyze_truss3d(p)
    assert e.value.code == code


def test_revision_and_load_identity_changes_with_inputs():
    p = beam()
    original = analyze_truss3d(p)["input_sha256"]
    p["loads"][0]["fx_n"] += 1
    assert analyze_truss3d(p)["input_sha256"] != original
    p["loads"][0]["fx_n"] -= 1
    p["project"]["revision"] = "r2"
    assert analyze_truss3d(p)["input_sha256"] != original


def test_cli_real_json_round_trip_and_invalid_request():
    import subprocess
    import sys
    import json
    from pathlib import Path
    command = [sys.executable, "-m", "jpn_structural.truss3d"]
    example = (Path(__file__).parents[1] / "examples/truss3d-bar.json").read_bytes()
    completed = subprocess.run(command, input=example, capture_output=True, timeout=10)
    assert completed.returncode == 0, completed.stderr
    parsed = json.loads(completed.stdout)
    assert parsed["members"]["AB"]["axial_n"] == pytest.approx(1000)
    bad = subprocess.run(command, input=b'{"schema_version":"bad"}', capture_output=True, timeout=10)
    assert bad.returncode == 2
    assert json.loads(bad.stdout)["status"] == "error"
