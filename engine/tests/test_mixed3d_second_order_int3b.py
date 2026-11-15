"""End-to-end Python /3 gates. TypeScript adapters are intentionally out of scope."""
import json
from pathlib import Path
from subprocess import run
import sys

import numpy as np
import pytest

from jpn_structural.frame3d_model import input_hash
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError

from .test_second_order_mixed_int3b import ORACLE, PORTAL_TOL, ROOT, portal_case, portal_geometry

MATCH_ATOL_M = 1e-12
MATCH_RTOL = 1e-10
WORKER = ROOT.parents[1]/"engine"/"local_mixed_worker.py"


def request(forces,geometry,points,supports):
    nodal = [dict(node=n,case=key,fx_n=f[0],fy_n=f[1],fz_n=f[2],mx_nm=0.,my_nm=0.,mz_nm=0.)
             for key,values in forces.items() for n,f in values.items()]
    return dict(
        schema_version="jpn.mixed3d/3",units="SI",theory="linear-elastic-frame-axial",
        local_axes="jpn-z-up/1",solution_mode="per-combination",analysis_order="second-order",
        project=dict(id="INT-3b",revision="1",source="Independent portal verification"),
        nodes=[dict(id=n,x_m=float(x),y_m=float(y),z_m=float(z)) for n,(x,y,z) in points.items()],
        supports=[dict(node=n,restrained=list(mask)) for n,mask in supports.items()],
        cases=[dict(id=k,source="Explicit portal forces") for k in forces],
        combinations=[dict(id=k,factors={k:1.}) for k in forces],nodal_loads=nodal,
        member_loads=[],self_weight=None,**geometry,
    )


def verify_result(raw,out):
    assert out["schema_version"] == "jpn.mixed3d-result/3"
    assert out["input_sha256"] == input_hash(raw)
    assert out["analysis_order"] == "second-order"
    assert out["releaseGate"] == "NOT_READY_BLOCKED"
    assert out["computedStructuralApproval"] is out["fabricationRelease"] is False
    assert set(out["combinations"]) == {c["id"] for c in raw["combinations"]}
    for c in out["combinations"].values():
        assert c["status"] == "converged"
        assert c["iterations"] >= 0
        assert 0. <= c["amplification_factor"] < float("inf")
        assert c["equilibrium"]["relative_residual"] < PORTAL_TOL["equilibrium_relative"]


@pytest.mark.parametrize("name",("planar","spatial"))
@pytest.mark.parametrize("level",(0,1),ids=("40-percent","75-percent"))
def test_v3_portal_matches_core_and_oracle(name,level):
    case = ORACLE["portals"][name]
    preloaded = case["cases"][level]
    forces = {"baseline":case["unloaded_probe"]["loads_n"],
              "preload":preloaded["preload"]["loads_n"],"perturbed":preloaded["result"]["loads_n"]}
    physical,points,supports = portal_geometry(name=="spatial",mesh=1)
    model = request(forces,physical,points,supports)
    model["mesh_initial_subdivisions"] = 4
    out = analyze_mixed3d_v3(model)
    verify_result(model,out)
    if name=="spatial":
        assert set(out["mesh_subdivisions"].values()) == {1,16}
        assert out["diagnostics"]["mesh_levels"] == [4,8,16]

    def positions(key):
        return np.array([out["combinations"][key]["nodes"][n]["translation_m"] for n in forces[key]])

    increment = positions("perturbed")-positions("preload")
    _,_,isolated,amplification = portal_case(name=="spatial",preloaded)
    if name=="spatial":
        np.testing.assert_allclose(increment,isolated,rtol=MATCH_RTOL,atol=MATCH_ATOL_M)
    reference = np.array(list(preloaded["incremental_translation_m"].values()))
    allowance = np.maximum(PORTAL_TOL["displacement_floor_m"],
                           PORTAL_TOL["portal_displacement_relative"]*abs(reference))
    assert np.all(abs(increment-reference) <= allowance)
    amp = max(np.linalg.norm(increment[:,:2],axis=1))/max(np.linalg.norm(positions("baseline")[:,:2],axis=1))
    if name=="spatial":
        assert amp == pytest.approx(amplification,rel=MATCH_RTOL)
    assert amp == pytest.approx(preloaded["amplification"],rel=PORTAL_TOL["amplification_relative"])
    combo = out["combinations"]["perturbed"]
    for member in model["members"]:
        if member["kind"] != "axial":
            continue
        mid = member["id"]
        a,b = (points[n]+np.array(combo["nodes"][n]["translation_m"])
               for n in (member["start"],member["end"]))
        length = np.linalg.norm(b-a)
        direction = (b-a)/length
        kg = combo["members"][mid]["axial_n"]/length*(np.eye(3)-np.outer(direction,direction))
        ref_kg = np.array(preloaded["result"]["braces"][mid]["kg_block_n_m"])
        assert np.linalg.norm(kg-ref_kg,2)/np.linalg.norm(ref_kg,2) <= PORTAL_TOL["brace_kg_relative"]


def worker(raw):
    process = run([sys.executable,"-I",str(WORKER)],input=json.dumps(raw),capture_output=True,text=True,timeout=20)
    return process.returncode,json.loads(process.stdout)


def test_int1c_shed_worker_does_not_drop_a_combination():
    raw = json.loads((ROOT/"shed-int1c.json").read_text(encoding="utf-8"))
    assert len(raw["combinations"]) == 42
    assert len(raw["member_loads"]) == 64
    raw.update(analysis_order="second-order",solution_mode="per-combination")
    status,out = worker(raw)
    assert status == 0, out
    verify_result(raw,out["result"])


def test_v3_wrong_mode_and_failed_later_combination_return_no_partial_results(monkeypatch):
    from jpn_structural import second_order_mixed as core

    physical,points,supports = portal_geometry(False)
    raw = request({"zero":{"b":[0.,0.,0.]},
                   "second":ORACLE["portals"]["planar"]["unloaded_probe"]["loads_n"]},physical,points,supports)
    wrong = {**raw,"solution_mode":"linear-superposition"}
    with pytest.raises(AnalysisError) as unsupported:
        analyze_mixed3d_v3(wrong)
    assert unsupported.value.code == "UNSUPPORTED_ANALYSIS_ORDER"

    monkeypatch.setattr(core,"MAX_ITERATIONS",0)
    with pytest.raises(AnalysisError) as refused:
        analyze_mixed3d_v3(raw)
    assert refused.value.code == "SECOND_ORDER_NOT_CONVERGED"
    assert str(refused.value).startswith("second:")


def test_real_worker_rejects_beyond_critical_without_partial_response():
    physical,points,supports = portal_geometry(True,mesh=1)
    from .test_second_order_mixed_int3b import references
    portal = references.fixture.geometry(True,ORACLE["portals"]["spatial"]["mesh"])
    critical = ORACLE["portals"]["spatial"]["critical_compression_per_column_n"]
    force = references.loads(portal,1.05*critical,0.)
    raw = request({"ok":{"b":[0.,0.,0.]},"over":force},physical,points,supports)
    status,out = worker(raw)
    assert status == 2 and "result" not in out
    assert out["error"]["code"] == "SECOND_ORDER_BEYOND_CRITICAL"
    assert out["error"]["message"].startswith("over:")

def test_insufficient_restraints_are_refused_as_a_mechanism():
    physical,points,supports = portal_geometry(False)
    raw = request({"mechanism":{"b":[0.,0.,-1000.]}},physical,points,supports)
    raw["supports"] = [{"node":"b","restrained":[True]*3+[False]*3}]
    with pytest.raises(AnalysisError,match="unloaded model has a mechanism") as caught:
        analyze_mixed3d_v3(raw)
    assert caught.value.code == "SECOND_ORDER_NOT_CONVERGED"


def test_uniform_dead_load_uses_deformed_centerline_and_matches_first_order_limit():
    from jpn_structural.second_order_mixed import dead_uniform_action

    physical,_,_ = portal_geometry(False)
    physical["members"] = [dict(physical["members"][0],id="F",start="i",end="j")]
    points = {"i":np.zeros(3),"j":np.array([4.,0.,0.])}
    raw = request({"W":{"j":[0.,0.,0.]}},physical,points,{"i":[True]*6})
    raw["member_loads"] = [dict(id="U",member="F",case="W",coordinate_system="global",
                               force_per_length_n_m=[0.,0.,-100.],source="Dead transverse force",revision="1")]
    result = analyze_mixed3d_v3(raw)
    verify_result(raw,result)
    combo = result["combinations"]["W"]
    u = np.r_[np.zeros(6),combo["nodes"]["j"]["translation_m"],combo["nodes"]["j"]["rotation_rad"]]
    reaction = combo["nodes"]["i"]
    np.testing.assert_allclose(reaction["reaction_force_n"],[0.,0.,400.],rtol=1e-9,atol=1e-8)
    # Independent quadrature of the deformed Hermite centerline, using
    # endpoint rotations from the solution. Compare all 3 reaction moments.
    from scipy.spatial.transform import Rotation
    chord = points["j"]+u[6:9]
    length = np.linalg.norm(chord)
    axis = chord/length
    directions = [Rotation.from_rotvec(u[k:k+3]).apply([1.,0.,0.]) for k in (3,9)]
    slope_i,slope_j = [v/(v@axis)-axis for v in directions]
    xi,weights = np.polynomial.legendre.leggauss(4)
    center = np.zeros(3)
    for t,w in zip((xi+1)/2,weights/2):
        center += w*(t*chord+length*(t*(1-t)**2*slope_i+t*t*(t-1)*slope_j))
    np.testing.assert_allclose(reaction["reaction_moment_nm"],-np.cross(center,[0.,0.,-400.]),
                               rtol=1e-9,atol=1e-8)
    # Tangent of the external potential independently from force differences.
    row = {"coordinates":np.array(list(points.values())),"basis":np.eye(3)}
    w = np.array([0.,0.,-400.])
    eps = 1e-6
    actual = dead_uniform_action(row,u,w)
    columns = [(dead_uniform_action(row,u+d,w)["generalized"]
                -dead_uniform_action(row,u-d,w)["generalized"])/(2*eps) for d in np.eye(12)*eps]
    np.testing.assert_allclose(actual["tangent"],np.array(columns).T,rtol=1e-6,atol=1e-6)
    linear = {k:v for k,v in raw.items() if k not in ("analysis_order","solution_mode")}
    first = analyze_mixed3d_v3(linear)["combinations"]["W"]["nodes"]["j"]["translation_m"][2]
    assert combo["nodes"]["j"]["translation_m"][2] == pytest.approx(first,rel=1e-5)
