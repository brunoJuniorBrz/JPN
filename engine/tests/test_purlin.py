import copy
import math
import pytest
from jpn_structural.purlin import analyze_purlin, section_properties

def request():
    return {
        "schema_version":"jpn.purlin/1","request_id":"TEST-0001",
        "span_count":1,"span_length_m":4,"end_condition":"simple",
        "uniform_load_n_m":-1000,"e_gpa":200,"density_kg_m3":7850,
        "deflection_limit_ratio":250,
        "candidates":[{
            "id":"U-75","family":"U","height_mm":75,"width_mm":40,
            "thickness_mm":2.65,"lip_mm":0,
            "price_brl_per_m":30,"source":"Dimensões nominais informadas pelo usuário"
        }]
    }

def result(p):
    return analyze_purlin(p)["results"][0]

def test_simple_span_analytical_reactions_moment_shear_and_deflection():
    p=request();r=result(p);EI=200e9*r["inertia_mm4"]*1e-12
    assert r["peak_moment_nm"]==pytest.approx(2000,rel=1e-12)
    assert abs(r["peak_shear_n"])==pytest.approx(2000,rel=1e-12)
    assert [x["vertical_n"] for x in r["reactions"]]==pytest.approx([2000,2000])
    assert r["deflection_mm"]==pytest.approx(-5*1000*4**4/(384*EI)*1000,rel=1e-10)
    assert r["deflection_at_m"]==pytest.approx(2,abs=1e-7)
    assert r["estimated_material_cost_brl"]==pytest.approx(120)
    assert r["mass_kg"]==pytest.approx(r["area_mm2"]*1e-6*7850*4)
    assert analyze_purlin(p)["computedStructuralApproval"] is False

def test_two_continuous_spans_analytical_support_reactions_and_hogging_moment():
    p=request();p.update(span_count=2)
    r=result(p); reactions=[x["vertical_n"] for x in r["reactions"]]
    assert reactions==pytest.approx([1500,5000,1500],rel=1e-10)
    assert r["peak_moment_nm"]==pytest.approx(-2000,rel=1e-10)
    assert r["span_end_moments_nm"][0][1]==pytest.approx(-2000,rel=1e-10)
    assert r["span_end_moments_nm"][1][0]==pytest.approx(-2000,rel=1e-10)

def test_cantilever_analytical_reference_and_balance():
    p=request();p.update(end_condition="cantilever")
    r=result(p);EI=200e9*r["inertia_mm4"]*1e-12
    assert r["reactions"][0]["vertical_n"]==pytest.approx(4000,rel=1e-10)
    assert abs(r["reactions"][0]["moment_nm"])==pytest.approx(8000,rel=1e-10)
    assert r["deflection_mm"]==pytest.approx(-1000*4**4/(8*EI)*1000,rel=1e-9)
    assert abs(r["peak_moment_nm"])==pytest.approx(8000,rel=1e-10)

def test_fixed_fixed_supports_have_fixed_end_moments_and_deflection():
    p=request();p.update(end_condition="fixed")
    r=result(p);EI=200e9*r["inertia_mm4"]*1e-12
    assert [x["vertical_n"] for x in r["reactions"]]==pytest.approx([2000,2000])
    assert abs(r["span_end_moments_nm"][0][0])==pytest.approx(1000*4**2/12,rel=1e-10)
    assert abs(r["span_end_moments_nm"][0][1])==pytest.approx(1000*4**2/12,rel=1e-10)
    assert r["deflection_mm"]==pytest.approx(-1000*4**4/(384*EI)*1000,rel=1e-9)

def test_sign_change_and_linearity():
    p=request();a=result(p);p["uniform_load_n_m"]=1000;b=result(p)
    assert b["deflection_mm"]==pytest.approx(-a["deflection_mm"],rel=1e-12)
    assert b["peak_moment_nm"]==pytest.approx(-a["peak_moment_nm"],rel=1e-12)
    assert [v["vertical_n"] for v in b["reactions"]]==pytest.approx([-v["vertical_n"] for v in a["reactions"]])

def test_profile_comparison_does_not_claim_strength_or_approval():
    p=request();p["candidates"].append({"id":"RECT-80","family":"tube","height_mm":80,"width_mm":40,"thickness_mm":2,"lip_mm":0,"price_brl_per_m":None,"source":"Geometria informada pelo usuário"})
    p["candidates"].append({"id":"C-75","family":"Ue","height_mm":75,"width_mm":40,"thickness_mm":2.65,"lip_mm":15,"price_brl_per_m":None,"source":"Geometria informada pelo usuário"})
    response=analyze_purlin(p)
    assert len(response["results"])==3
    assert all("within_user_deflection_limit" in x for x in response["results"])
    assert all(x["inertia_mm4"]>0 and x["area_mm2"]>0 for x in response["results"])
    assert response["fabricationRelease"] is False
    assert all(x["section_model"]=="sharp-corner-linear-elastic-approximation" for x in response["results"])

@pytest.mark.parametrize("change",[
    {"span_count":0},{"span_count":6},{"span_length_m":0},{"end_condition":"cantilever","span_count":2},
    {"uniform_load_n_m":float("nan")},{"e_gpa":0},{"deflection_limit_ratio":0},
])
def test_input_refuses_invalid_configs(change):
    p=request();p.update(change)
    with pytest.raises(ValueError):analyze_purlin(p)

def test_invalid_sections_block_computation():
    p=request();p["candidates"][0].update(family="Ue",lip_mm=40)
    with pytest.raises(ValueError):analyze_purlin(p)

def test_sharp_corner_u_section_independent_rectangle_inertia():
    p=request()["candidates"][0];p.update(height_mm=100,width_mm=50,thickness_mm=2,lip_mm=0)
    area,I=section_properties(p)
    expected_area=2*100+2*(50-2)*2
    # web plus two top/bottom flanges without overlap
    expected_I=2*100**3/12 + 2*((50-2)*2**3/12+(50-2)*2*(49)**2)
    assert area==pytest.approx(expected_area)
    assert I==pytest.approx(expected_I,rel=1e-12)

def test_surface_pressure_horizontal_tributary_equivalent_to_declared_line_load():
    line=request()
    a=result(line)
    surface=request()
    surface.update(load_mode="surface",uniform_load_n_m=0,
                   surface_pressure_n_m2=-800,tributary_width_m=1.25,
                   load_source="Memorial externo de carga vertical por projecao horizontal")
    b=result(surface)
    assert b["declared_line_load_n_m"]==pytest.approx(-1000)
    assert b["self_weight_line_load_n_m"]==0
    assert b["total_line_load_n_m"]==pytest.approx(-1000)
    assert b["deflection_mm"]==pytest.approx(a["deflection_mm"],rel=1e-12)
    assert b["peak_moment_nm"]==pytest.approx(a["peak_moment_nm"],rel=1e-12)
    assert [r["vertical_n"] for r in b["reactions"]]==pytest.approx([2000,2000])
    response=analyze_purlin(surface)
    assert response["input"]["load_mode"]=="surface"
    assert response["input"]["surface_pressure_n_m2"]==-800
    assert response["input"]["tributary_width_m"]==1.25
    assert response["input"]["load_source"]==surface["load_source"]

def test_self_weight_is_always_downward_per_section_and_changes_comparison():
    p=request()
    p.update(load_mode="surface",uniform_load_n_m=0,
             surface_pressure_n_m2=200,tributary_width_m=1.25,
             include_self_weight=True,load_source="Acao vertical ascendente informada")
    p["candidates"].append({
        "id":"TUBO-80","family":"tube","height_mm":80,"width_mm":40,
        "thickness_mm":2.65,"lip_mm":0,"price_brl_per_m":None,
        "source":"Geometria nominal informada por usuario"
    })
    results=analyze_purlin(p)["results"]
    assert len(results)==2
    assert results[0]["area_mm2"]!=results[1]["area_mm2"]
    for r in results:
        expected_w=-r["area_mm2"]*1e-6*7850*9.80665
        assert r["self_weight_line_load_n_m"]==pytest.approx(expected_w)
        assert r["declared_line_load_n_m"]==pytest.approx(250)
        assert r["total_line_load_n_m"]==pytest.approx(250+expected_w)
        assert sum(v["vertical_n"] for v in r["reactions"])==pytest.approx(-4*(250+expected_w))
        assert r["total_line_load_n_m"]>0
    assert results[0]["self_weight_line_load_n_m"]!=results[1]["self_weight_line_load_n_m"]

def test_steel_weight_only_has_physical_sign_and_analytical_beam_limit():
    p=request()
    p["uniform_load_n_m"]=0
    p["include_self_weight"]=True
    r=result(p)
    assert r["self_weight_line_load_n_m"]<0
    assert r["total_line_load_n_m"]==pytest.approx(r["self_weight_line_load_n_m"])
    assert r["peak_moment_nm"]==pytest.approx(-r["total_line_load_n_m"]*4**2/8)
    assert all(v["vertical_n"]>0 for v in r["reactions"])
    assert analyze_purlin(p)["fabricationRelease"] is False

@pytest.mark.parametrize("change",[
    {"load_mode":"surface","uniform_load_n_m":-500,"surface_pressure_n_m2":-400,"tributary_width_m":1.5,"load_source":"Memorial"},
    {"load_mode":"surface","uniform_load_n_m":0,"surface_pressure_n_m2":-400,"load_source":"Memorial"},
    {"load_mode":"surface","uniform_load_n_m":0,"surface_pressure_n_m2":-400,"tributary_width_m":1.5},
    {"load_mode":"surface","uniform_load_n_m":0,"surface_pressure_n_m2":float("nan"),"tributary_width_m":1.5,"load_source":"Memorial"},
    {"load_mode":"surface","uniform_load_n_m":0,"surface_pressure_n_m2":-400,"tributary_width_m":0,"load_source":"Memorial"},
    {"load_mode":"surface","uniform_load_n_m":0,"surface_pressure_n_m2":-400,"tributary_width_m":1.5,"load_source":" "},
    {"load_mode":"line","surface_pressure_n_m2":-100,"tributary_width_m":2},
    {"include_self_weight":"yes"},
    {"gravity_m_s2":0},
])
def test_surface_load_provenance_and_invalid_inputs_are_blocked(change):
    p=request()
    p.update(change)
    with pytest.raises(ValueError):
        analyze_purlin(p)
