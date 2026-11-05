"""Independent closed-form benchmark for opt-in jpn.frame3d/2 uniform member loads.

Reference: M. Pratti Junior, UFSC (2015), cover purlin, span 6.25 m.
The public numeric comparison is NOT validation of the complete building.
"""
import copy
import json
from pathlib import Path

import numpy as np
import pytest

from jpn_structural.frame3d import analyze_frame3d
from jpn_structural.frame3d_model import validate, input_hash
from jpn_structural.model import AnalysisError

EXAMPLE = Path(__file__).parents[1] / "examples" / "ufsc-2015-purlin-uniform-v2.json"
L = 6.25
E = 205e9
I = 605e-8
Q = -1778.8


def ufsc():
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def solution():
    return analyze_frame3d(ufsc())["combinations"]["ELU-PUBLICADO"]


def test_ufsc_true_uniform_load_matches_closed_form_with_single_element():
    model = ufsc()
    result = analyze_frame3d(model)
    assert result["schema_version"] == "jpn.frame3d-result/2"
    assert result["solver"]["adapter"] == "jpn-frame3d/2"
    assert result["input_sha256"] == input_hash(model)
    r = result["combinations"]["ELU-PUBLICADO"]
    a, b = (r["nodes"][name] for name in ("A", "B"))
    expected_reaction = -Q * L / 2
    np.testing.assert_allclose([a["force_n"][2], b["force_n"][2]], [expected_reaction]*2, rtol=1e-10, atol=1e-7)
    assert sum(n["force_n"][2] for n in (a,b)) + Q * L == pytest.approx(0,abs=1e-7)
    assert a["translation_m"] == pytest.approx([0]*3,abs=1e-12)
    assert b["translation_m"] == pytest.approx([0]*3,abs=1e-12)
    stations = r["members"]["TERCA-1"]["stations"]
    assert len(stations) == 5
    assert stations[0]["vz_n"] == pytest.approx(-expected_reaction,abs=1e-6)
    assert stations[2]["vz_n"] == pytest.approx(0, abs=1e-7)
    assert stations[-1]["vz_n"] == pytest.approx(expected_reaction,abs=1e-6)
    assert stations[0]["my_nm"] == pytest.approx(0,abs=1e-6)
    assert stations[-1]["my_nm"] == pytest.approx(0,abs=1e-6)
    assert stations[2]["my_nm"] == pytest.approx(Q*L**2/8,rel=1e-11)
    assert stations[2]["displacement_local_m"][2] == pytest.approx(5*Q*L**4/(384*E*I),rel=1e-9)
    assert stations[2]["displacement_local_m"][2]*1000 == pytest.approx(-28.4955296987,abs=1e-8)
    assert result["assumptions"][2].startswith("Sem peso próprio")
    assert r["equilibrium"]["relative_residual"] < 1e-10


@pytest.mark.parametrize("direction,component,moment", [("Fz",2,"my_nm"),("Fy",1,"mz_nm")])
@pytest.mark.parametrize("sign",[-1,1])
def test_local_loading_sign_and_two_bending_axes(direction,component,moment,sign):
    p=ufsc()
    p["member_uniform_loads"][0].update(direction=direction,w_n_m=sign*1000)
    r=analyze_frame3d(p)["combinations"]["ELU-PUBLICADO"]
    stations=r["members"]["TERCA-1"]["stations"]
    assert r["nodes"]["A"]["force_n"][component] == pytest.approx(-sign*1000*L/2,abs=1e-6)
    assert r["nodes"]["B"]["force_n"][component] == pytest.approx(-sign*1000*L/2,abs=1e-6)
    expected_moment = sign*1000*L**2/8 * (1 if direction=="Fz" else -1)
    assert stations[2][moment] == pytest.approx(expected_moment,abs=1e-6)
    assert abs(stations[2]["displacement_local_m"][component]) == pytest.approx(abs(5*1000*L**4/(384*E*I)),rel=1e-9)
    assert r["equilibrium"]["relative_residual"] < 1e-10


def test_multiple_uniform_cases_superpose_and_cancel_without_fake_self_weight():
    p=ufsc()
    p["cases"].append({"id":"OPPOSITE","source":"Synthetic opposing uniform component"})
    p["member_uniform_loads"].append({"member":"TERCA-1","case":"OPPOSITE","direction":"Fz",
                                      "w_n_m":-Q,"source":"Independent synthetic opposite sign"})
    p["combinations"]=[{"id":"SUCCAO","factors":{"UFSC-SUCCAO":1}},
                       {"id":"OPPOSITE","factors":{"OPPOSITE":1}},
                       {"id":"CANCEL","factors":{"UFSC-SUCCAO":1,"OPPOSITE":1}}]
    result=analyze_frame3d(p)["combinations"]
    for name in ("A","B"):
        assert result["CANCEL"]["nodes"][name]["force_n"][2] == pytest.approx(0,abs=1e-7)
    assert result["CANCEL"]["members"]["TERCA-1"]["stations"][2]["my_nm"] == pytest.approx(0,abs=1e-7)
    assert result["CANCEL"]["members"]["TERCA-1"]["stations"][2]["displacement_local_m"][2] == pytest.approx(0,abs=1e-12)
    assert result["SUCCAO"]["members"]["TERCA-1"]["stations"][2]["my_nm"] == pytest.approx(-result["OPPOSITE"]["members"]["TERCA-1"]["stations"][2]["my_nm"],abs=1e-7)


@pytest.mark.parametrize("change,code", [
    (lambda p:p.update(schema_version="jpn.frame3d/1"),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"][0].update(direction="FZ"),"UNSUPPORTED_LOAD"),
    (lambda p:p["member_uniform_loads"][0].update(direction="Fx"),"UNSUPPORTED_LOAD"),
    (lambda p:p["member_uniform_loads"][0].update(member="MISSING"),"INVALID_REFERENCE"),
    (lambda p:p["member_uniform_loads"][0].update(case="MISSING"),"INVALID_REFERENCE"),
    (lambda p:p["member_uniform_loads"][0].update(w_n_m=float('nan')),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"][0].update(w_n_m=True),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"][0].update(w_n_m=0),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"][0].update(source=""),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"][0].update(x1=0.0),"INVALID_INPUT"),
    (lambda p:p["member_uniform_loads"].clear(),"INCOMPLETE_MODEL"),
])
def test_fail_closed_on_out_of_domain_or_unsupported_member_loading(change,code):
    p=ufsc()
    change(p)
    with pytest.raises(AnalysisError) as exc:
        validate(p)
    assert exc.value.code == code


def test_v1_results_and_contract_are_unchanged():
    p=json.loads((EXAMPLE.parent/"spatial-portal.json").read_text())
    original=analyze_frame3d(copy.deepcopy(p))
    assert original["schema_version"]=="jpn.frame3d-result/1"
    assert original["solver"]["adapter"]=="jpn-frame3d/1"
    assert "displacement_local_m" not in original["combinations"]["TESTE-1"]["members"]["P1"]["stations"][0]
    assert original["input_sha256"]==input_hash(p)


def test_local_uniform_load_remains_equilibrated_when_beam_axis_is_global_y():
    p = ufsc()
    p["nodes"][1].update(x_m=0.0, y_m=L)
    p["supports"][0]["restrained"] = [True, True, True, False, True, False]
    p["supports"][1]["restrained"] = [True, False, True, False, False, False]
    r = analyze_frame3d(p)["combinations"]["ELU-PUBLICADO"]
    assert r["nodes"]["A"]["force_n"][2] == pytest.approx(-Q*L/2, rel=1e-10)
    assert r["nodes"]["B"]["force_n"][2] == pytest.approx(-Q*L/2, rel=1e-10)
    assert r["members"]["TERCA-1"]["stations"][2]["my_nm"] == pytest.approx(Q*L**2/8, rel=1e-10)
    assert r["equilibrium"]["relative_residual"] < 1e-10
