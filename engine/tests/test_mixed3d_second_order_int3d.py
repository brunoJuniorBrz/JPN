"""Independent OpenSees and exact-tangent gates for second-order releases."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

import numpy as np
import pytest

from jpn_structural import mixed3d_second_order as mixed
from jpn_structural import second_order_system as system
from jpn_structural.mixed_initial_stress import stable_solve
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError
from jpn_structural.second_order_mixed import assemble, physical_model
from jpn_structural.second_order_releases import prepare_releases

from .test_mixed3d_second_order_int3b import request

ROOT = Path(__file__).resolve().parents[2]/"validation"/"int-3d"
CRITERIA = json.loads((ROOT/"criteria.json").read_text(encoding="utf-8"))
ORACLE = json.loads((ROOT/"opensees.json").read_text(encoding="utf-8"))
spec = spec_from_file_location("opensees_releases",ROOT/"opensees_releases.py")
reference = module_from_spec(spec)
spec.loader.exec_module(reference)


def released_request(name):
    x,frames,fix,low,high,probe,cut = reference.fixture(name)
    source = "Independent INT-3d release benchmark"
    members = [dict(id=mid,start=i,end=j,kind="frame",material="M",section="S",rotation_deg=0.,
                    release_start=list(ri),release_end=list(rj)) for mid,i,j,ri,rj in frames]
    physical = dict(members=members,
                    materials=[dict(id="M",e_pa=reference.E,g_pa=reference.E/2.6,nu=.3,source=source,revision="1")],
                    sections=[dict(id="S",area_m2=reference.A,iy_m4=reference.I,iz_m4=reference.I,
                                   j_m4=reference.J,source=source,revision="1")])
    raw = request(dict(LA=low,NL=high),physical,x,{n:list(map(bool,mask)) for n,mask in fix.items()})
    return raw,probe,cut


@pytest.mark.parametrize("name",tuple(ORACLE))
def test_releases_match_opensees(name):
    raw,probe,cut = released_request(name)
    response = analyze_mixed3d_v3(raw)
    first,second = (response["combinations"][k] for k in ("LA","NL"))
    nid,dof = probe
    amplification = second["nodes"][nid]["translation_m"][dof]/first["nodes"][nid]["translation_m"][dof]
    mid,end = cut
    moments = np.array(second["members"][mid]["end_actions_global"]).reshape(2,6)[end,4:6]
    moment = np.linalg.norm(moments)
    expected = ORACLE[name]
    assert amplification == pytest.approx(expected["amplification"],rel=CRITERIA["amplification_relative"])
    assert moment == pytest.approx(expected["second"]["moment_nm"],rel=CRITERIA["moment_relative"])
    for combo in (first,second):
        assert combo["equilibrium"]["relative_residual"] < 1e-8
        for m in raw["members"]:
            row = combo["members"][m["id"]]
            assert row["equilibrium_relative"] < 1e-8
            end_actions = np.array(row["end_actions_global"]).reshape(2,6)
            for k,flag in enumerate((m["release_start"],m["release_end"])):
                # In the two fixtures the hinged bars run along global X.
                # The fully released end carries zero spatial moment.
                if all(flag[3:]):
                    limit = CRITERIA["released_moment_floor_nm"]+CRITERIA["released_moment_relative"]*moment
                    assert np.linalg.norm(end_actions[k,3:]) <= limit


def test_hinge_potential_pullback_matches_finite_difference_with_dead_udl():
    raw,_,_ = released_request("pinned-compression")
    from jpn_structural.mixed3d_loads import compile_loaded_mixed3d
    from jpn_structural.mixed3d import validate_mixed3d

    data,_ = compile_loaded_mixed3d({k:("jpn.mixed3d/2" if k=="schema_version" else v) for k,v in raw.items()
                                   if k not in ("analysis_order","solution_mode","local_axes","mesh_initial_subdivisions")})
    _,points,frames,supports = validate_mixed3d(data)
    elements,x,fixed,_ = physical_model(data,points,frames,supports)
    elements,fixed,_ = prepare_releases(elements,fixed)
    q = np.linspace(-1e-4,1e-4,len(fixed))
    axis = np.linspace(-.3,.4,len(fixed))
    line = {"B1":np.array([12.,-21.,-43.])}
    _,tangent,_ = assemble(elements,q,None,line)
    delta = 1e-6
    plus = assemble(elements,q+delta*axis,None,line)[0]
    minus = assemble(elements,q-delta*axis,None,line)[0]
    np.testing.assert_allclose((plus-minus)/(2*delta),tangent@axis,rtol=2e-6,atol=5e-5)


def test_unused_joint_rotation_at_released_ends_is_eliminated():
    raw,_,_ = released_request("pinned-compression")
    a,b = raw["supports"]
    a["restrained"][4:] = [False,False]
    b["restrained"][3:] = [False,False,False]
    result = analyze_mixed3d_v3(raw)
    for combo in result["combinations"].values():
        assert combo["nodes"]["a"]["rotation_rad"][1:] == [0.,0.]
        assert combo["nodes"]["b"]["rotation_rad"] == [0.,0.,0.]


def test_purlin_roundoff_at_mesh_16_keeps_the_physical_equilibrium_gate():
    raw,_,_ = released_request("purlin-portal")
    raw["mesh_initial_subdivisions"] = 4
    answer = analyze_mixed3d_v3(raw)
    assert answer["diagnostics"]["mesh_levels"] == [4,8,16]
    assert answer["combinations"]["LA"]["equilibrium"]["relative_residual"] < 1e-8


def test_banded_solution_and_stability_match_dense():
    rng = np.random.default_rng(1234)
    values = rng.uniform(.15,.45,119)
    k = np.diag(np.full(120,2.))+np.diag(values,1)+np.diag(values,-1)
    order = rng.permutation(120)
    k = k[np.ix_(order,order)]
    force = rng.normal(size=120)
    free = np.arange(120)
    tolerance = CRITERIA["numerical_equivalence_relative_and_absolute"]
    actual,condition = system.factor_system(k,free)(force)
    expected,reference_condition = stable_solve(k,force,free)
    np.testing.assert_allclose(actual,expected,rtol=tolerance,atol=tolerance)
    assert condition == pytest.approx(reference_condition,rel=tolerance)
    k[0,1] = k[1,0] = 4.
    for method in (system.factor_system,lambda m,i: stable_solve(m,force,i)):
        with pytest.raises(AnalysisError) as error:
            method(k,free)
        assert error.value.code == "UNSTABLE"


def test_optimized_results_match_uncached_dense_with_releases_and_distributed_load(monkeypatch):
    raw,_,_ = released_request("purlin-portal")
    raw["member_loads"] = [dict(id="W",member="P2",case="NL",coordinate_system="global",
                               force_per_length_n_m=[.2,-.4,-1.],source="equivalence",revision="1")]
    original = mixed.solve_combination
    actual = analyze_mixed3d_v3(raw)
    monkeypatch.setattr(system,"BAND_THRESHOLD",np.inf)

    def uncached(*args,**kwargs):
        kwargs.pop("reference_cache")
        return original(*args,**kwargs)

    monkeypatch.setattr(mixed,"solve_combination",uncached)
    expected = analyze_mixed3d_v3(raw)
    for result in (actual,expected):
        del result["diagnostics"]["elapsed_seconds"]

    def compare(new,old):
        if type(old) is dict:
            assert new.keys() == old.keys()
            for key in old:
                compare(new[key],old[key])
        elif type(old) is list:
            assert len(new) == len(old)
            for a,b in zip(new,old):
                compare(a,b)
        elif type(old) is float:
            tol = CRITERIA["numerical_equivalence_relative_and_absolute"]
            assert new == pytest.approx(old,rel=tol,abs=tol)
        else:
            assert new == old

    compare(actual,expected)
