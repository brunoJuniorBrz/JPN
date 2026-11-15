"""INT-3b gates using independent restrained-truss and portal evidence."""
from importlib.util import module_from_spec,spec_from_file_location
import json
from pathlib import Path

import numpy as np
import pytest
from scipy.spatial.transform import Rotation

from jpn_structural.model import AnalysisError
from jpn_structural.second_order_mixed import assemble, axial_response, physical_model, solve_combination

ROOT = Path(__file__).resolve().parents[2]/"validation"/"int-3b"
ORACLE = json.loads((ROOT/"oracle.json").read_text(encoding="utf-8"))
spec = spec_from_file_location("portal_oracle",ROOT/"portal_oracle.py")
references = module_from_spec(spec)
spec.loader.exec_module(references)
PORTAL_TOL = ORACLE["portal_criteria"]
EULER_TOL = .01
OBJECTIVITY_TOL = 1e-9


def spring_case(ratio, rotation):
    g = ORACLE["spring_truss"]["geometry"]
    l,ea,k,h = (g[n] for n in ("length_m","ea_n","spring_n_m","transverse_n"))
    axis,side = rotation[:,2],rotation[:,0]
    x = np.array([np.zeros(3),l*axis])
    rows = [dict(id="bar",kind="axial",coordinates=x,dofs=np.r_[0:3,6:9],ea=ea)]
    fixed = np.array([True]*6+[False]*3+[True]*3)
    spring = np.zeros((12,12))
    spring[6:9,6:9] = k*(np.eye(3)-np.outer(axis,axis))
    load = np.r_[np.zeros(6),h*side-ratio*k*l*axis,np.zeros(3)]
    solved = solve_combination(rows,x,fixed,load,spring=spring)
    return solved,side


@pytest.mark.parametrize("reference",ORACLE["spring_truss"]["cases"])
def test_spring_truss_matches_native_kg_and_amplification(reference):
    r,side = spring_case(reference["critical_ratio"],np.eye(3))
    actual = r["u"][6:9]@side
    expected = reference["opensees"]
    tol = ORACLE["spring_truss"]["criteria"]
    assert actual == pytest.approx(expected["translation_m"],rel=tol["relative_displacement"])
    amp = actual/(r["linear"][6:9]@side)
    assert amp == pytest.approx(expected["amplification"],rel=tol["relative_amplification"])
    kg = r["rows"][0]["geometric"][:3,:3]
    assert side@kg@side == pytest.approx(expected["geometric_tangent_n_m"],rel=tol["relative_geometric_tangent"])
    assert r["relative_equilibrium"] < PORTAL_TOL["equilibrium_relative"]


def test_rotating_truss_and_restraint_rotates_motion_force_and_tangent():
    rotation = Rotation.from_rotvec([.44,-.17,.31]).as_matrix()
    first,_ = spring_case(.75,np.eye(3))
    rotated,_ = spring_case(.75,rotation)
    np.testing.assert_allclose(rotated["u"].reshape(-1,3),first["u"].reshape(-1,3)@rotation.T,
                               rtol=OBJECTIVITY_TOL,atol=1e-12)
    T = np.kron(np.eye(2),rotation)
    a,b = (r["rows"][0] for r in (first,rotated))
    np.testing.assert_allclose(b["force"],T@a["force"],rtol=OBJECTIVITY_TOL,atol=1e-7)
    np.testing.assert_allclose(b["tangent"],T@a["tangent"]@T.T,rtol=OBJECTIVITY_TOL,atol=1e-6)


def test_negative_restoring_tangent_is_refused():
    with pytest.raises(AnalysisError,match="lost positive definiteness") as caught:
        spring_case(1.02,np.eye(3))
    assert caught.value.code == "SECOND_ORDER_BEYOND_CRITICAL"


def test_axial_tangent_from_force_difference():
    x = np.array([[2.,-1.,4.],[3.,1.,7.]])
    u = np.array([.0005,-.001,.001,-.002,-.002,-.007])
    step = 1e-6
    response = axial_response(x,u,200e6)
    columns = [(axial_response(x,u+d,200e6)["force"]-axial_response(x,u-d,200e6)["force"])/(2*step)
               for d in np.eye(6)*step]
    np.testing.assert_allclose(response["tangent"],np.array(columns).T,rtol=1e-7,atol=1e-2)


def test_euler_buckling_is_for_the_flexural_member():
    count,L,ea,ei = 12,4.,2e9,2e6
    x = np.array([[L*i/count,0.,0.] for i in range(count+1)])
    rows = [dict(kind="frame",coordinates=x[i:i+2],dofs=np.arange(6*i,6*i+12),ea=ea,
                 eiy=ei,eiz=ei,gj=ei,basis=np.eye(3)) for i in range(count)]
    fixed = np.tile([False,False,True,True,True,False],(count+1,1))
    fixed[0,:3] = True
    fixed[-1,1:3] = True
    u = np.zeros(6*(count+1))
    free = np.flatnonzero(~fixed.ravel())
    pcr = np.pi**2*ei/L**2

    def smallest(ratio):
        u[::6] = -ratio*pcr/ea*x[:,0]
        k = assemble(rows,u,None)[1][np.ix_(free,free)]
        d = np.sqrt(np.diag(k))
        return np.linalg.eigvalsh(k/np.outer(d,d))[0]

    from scipy.optimize import brentq
    actual = brentq(smallest,.95,1.05)
    assert actual == pytest.approx(1.,rel=EULER_TOL)


def portal_geometry(spatial):
    fixture = references.fixture
    case = fixture.geometry(spatial,ORACLE["portals"]["spatial" if spatial else "planar"]["mesh"])
    A,Iy,Iz,J = fixture.FRAME
    source = "INT-3a physical benchmark"
    members = [dict(id=n,start=a,end=b,kind="frame",material="M",section="S",rotation_deg=0.,
                    release_start=[False]*6,release_end=[False]*6) for n,(a,b) in case["frames"].items()]
    members += [dict(id=n,start=a,end=b,kind="axial",e_pa=fixture.E,area_m2=fixture.BRACE[0],
                     source=source,revision="1") for n,(a,b) in case["braces"].items()]
    data = dict(members=members,materials=[dict(id="M",e_pa=fixture.E,g_pa=fixture.G,nu=.3,
                 source=source,revision="1")],
                sections=[dict(id="S",area_m2=A,iy_m4=Iy,iz_m4=Iz,j_m4=J,source=source,revision="1")])
    points = {n:np.array(v) for n,v in case["nodes"].items()}
    return data,points,case["supports"]


def portal_case(spatial, reference):
    data,points,supports = portal_geometry(spatial)
    frames = {m[k] for m in data["members"] if m["kind"]=="frame" for k in ("start","end")}
    elements,x,fixed,index = physical_model(data,points,frames,supports)
    initial = assemble(elements,np.zeros(6*len(x)),None)

    def solve(forces):
        load = np.zeros((len(x),6))
        for n,v in forces.items():
            load[index[n],:3] = v
        return solve_combination(elements,x,fixed,load.ravel(),initial=initial)

    def extract(state):
        return np.array([state["u"].reshape(-1,6)[index[n],:3] for n in reference["result"]["loads_n"]])

    baseline = "spatial" if spatial else "planar"
    unstressed = ORACLE["portals"][baseline]["unloaded_probe"]
    no_preload = extract(solve(unstressed["loads_n"]))
    preload = extract(solve(reference["preload"]["loads_n"]))
    result = solve(reference["result"]["loads_n"])
    increment = extract(result)-preload
    amp = max(np.linalg.norm(increment[:,:2],axis=1))/max(np.linalg.norm(no_preload[:,:2],axis=1))
    return elements,result,increment,amp


@pytest.mark.parametrize("name",("planar","spatial"))
@pytest.mark.parametrize("level",(0,1))
def test_portals_against_corot_truss(name,level):
    reference = ORACLE["portals"][name]["cases"][level]
    elements,result,increment,amp = portal_case(name=="spatial",reference)
    expected = np.array(list(reference["incremental_translation_m"].values()))
    error = abs(increment-expected)
    allowance = np.maximum(PORTAL_TOL["displacement_floor_m"],
                           PORTAL_TOL["portal_displacement_relative"]*abs(expected))
    assert np.max(error/allowance) <= 1.
    assert amp == pytest.approx(reference["amplification"],rel=PORTAL_TOL["amplification_relative"])
    for e,r in zip(elements,result["rows"]):
        if e["kind"] != "axial":
            continue
        expected = reference["result"]["braces"][e["id"]]
        assert r["axial_n"] == pytest.approx(expected["force_n"],rel=PORTAL_TOL["brace_force_relative"])
        kg = np.array(expected["kg_block_n_m"])
        assert np.linalg.norm(r["geometric"][:3,:3]-kg,2)/np.linalg.norm(kg,2) <= PORTAL_TOL["brace_kg_relative"]
    assert result["relative_equilibrium"] < PORTAL_TOL["equilibrium_relative"]
