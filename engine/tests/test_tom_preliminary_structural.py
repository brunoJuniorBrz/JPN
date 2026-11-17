"""Exploratory mechanics screening for Tom's roof — NOT a structural design.

The PDF drawing lacks joint detail, steel grade, certified section properties,
load path, bracing, support fixity and site wind. ALL loads here are explicitly
synthetic. The four loose U members have no known structural connectivity.
This probes the real JPN frame3d solver without granting fabrication approval.
"""
import json
import math
from pathlib import Path

import pytest

from jpn_structural.frame3d import analyze_frame3d
from jpn_structural.purlin import section_properties
from jpn_structural.model import AnalysisError

E = 200e9  # explicit nominal study assumption, not a material certificate
NU = 0.3
G = E / (2 * (1 + NU))
L = 5.48  # a listed cut length, NOT a verified clear span
REPORT = Path(__file__).parents[1] / "validation-results" / "tom-preliminary-structural.json"
NO_RELEASE = [False] * 6


def section(family):
    """Sharp-corner U / Ue rectangles; no bend radii or effective-width reduction.

    Compare the strong-axis second moment with the JPN purlin module.
    Weak-axis inertia and open-profile Saint-Venant J are study approximations.
    """
    h, b, t = 75.0, 40.0, 2.65
    lip = 15.0 if family == "Ue" else 0.0
    plates = [(0, t, 0, h), (t, b, 0, t), (t, b, h-t, h)]
    if lip:
        plates += [(b-t, b, t, t+lip), (b-t, b, h-t-lip, h-t)]
    A = sum((x1-x0) * (y1-y0) for x0, x1, y0, y1 in plates)
    xbar = sum((x1*x1-x0*x0)/2 * (y1-y0) for x0,x1,y0,y1 in plates)/A
    ybar = sum((y1*y1-y0*y0)/2 * (x1-x0) for x0,x1,y0,y1 in plates)/A
    Iy = sum((x1-x0)*(y1**3-y0**3)/3 for x0,x1,y0,y1 in plates)-A*ybar*ybar
    Iz = sum((y1-y0)*(x1**3-x0**3)/3 for x0,x1,y0,y1 in plates)-A*xbar*xbar
    J = (h+2*(b-t)+2*lip)*t**3/3
    nativeA,nativeIy = section_properties(dict(id="TOM-Ue" if lip else "TOM-U",
        family=family, height_mm=h,width_mm=b,thickness_mm=t,lip_mm=lip,
        price_brl_per_m=None,source="Dados nominais planilha Tom, nao catalogo"))
    assert A == pytest.approx(nativeA, rel=1e-12)
    assert Iy == pytest.approx(nativeIy, rel=1e-12)
    return dict(id="Ue" if lip else "U",area_m2=A*1e-6,
        iy_m4=Iy*1e-12,iz_m4=Iz*1e-12,j_m4=J*1e-12,
        source="Retangulos nominais 75x40x2.65 (Ue lip 15 mm assumido); sem raio, torcao empenamento ou propriedades certificadas",
        revision="HIPOTESE-1")


def material():
    return [dict(id="ACO-HIPOTESE",e_pa=E,g_pa=G,nu=NU,
        source="Modulo nominal sintético; classe do aco não informada",
        revision="NAO-CERTIFICADO")]


def member(mid, start, end, profile):
    return dict(id=mid,start=start,end=end,kind="frame",
        material="ACO-HIPOTESE",section=profile,rotation_deg=0,
        release_start=NO_RELEASE.copy(),release_end=NO_RELEASE.copy())


def purlin(q):
    """Single isolated Ue beam, PIN+ROLLER, local Fz; q is synthetic N/m."""
    return dict(schema_version="jpn.frame3d/2",units="SI",
        theory="linear-elastic-euler-bernoulli",
        project=dict(id="TOM-TERCA-ISOLADA",revision="EXPERIMENTO-1",
            source="L=5.48 m da lista de pecas; vao livre, orientacao e travamento NAO confirmados"),
        nodes=[dict(id="A",x_m=0,y_m=0,z_m=0),
               dict(id="B",x_m=L,y_m=0,z_m=0)],
        members=[member("T1","A","B","Ue")],
        materials=material(),sections=[section("Ue")],
        supports=[dict(node="A",restrained=[True,True,True,True,False,False]),
                  dict(node="B",restrained=[False,True,True,False,False,False])],
        cases=[dict(id="Q-SYNTH",source="Carga hipotetica, NAO vento, ELU ou combinacao de projeto")],
        nodal_loads=[],
        member_uniform_loads=[dict(member="T1",case="Q-SYNTH",direction="Fz",w_n_m=-q,
             source="Carga linear de sensibilidade, sem base normativa")],
        combinations=[dict(id="Q-TEST",factors={"Q-SYNTH":1})])


def no_diagonals(*, laterally_braced=False):
    """One idealised welded Vierendeel-like member: rigid joints, no diagonals.

    Five upper/lower nodes, five verticals, two simple end supports; the drawing
    does NOT establish rigid joints, lateral bracing or load transfer to this member.
    """
    x = [5.37*i/4 for i in range(5)]
    h = [0.30,0.48,0.65,0.83,1.01]
    nodes = [dict(id=f"B{i}",x_m=xx,y_m=0,z_m=0) for i,xx in enumerate(x)]
    nodes += [dict(id=f"T{i}",x_m=xx,y_m=0,z_m=hh) for i,(xx,hh) in enumerate(zip(x,h))]
    members = [member(f"BC{i}",f"B{i}",f"B{i+1}","U") for i in range(4)]
    members += [member(f"TC{i}",f"T{i}",f"T{i+1}","U") for i in range(4)]
    members += [member(f"POST{i}",f"B{i}",f"T{i}","U") for i in range(5)]
    return dict(schema_version="jpn.frame3d/1",units="SI",
        theory="linear-elastic-euler-bernoulli",
        project=dict(id="TOM-SEM-DIAGONAIS",revision="EXPERIMENTO-1",
            source="Croqui: 5.37m inferior, cerca 5.41m superior; uniao rigida hipotetica"),
        nodes=nodes,members=members,materials=material(),sections=[section("U")],
        supports=[dict(node="B0",restrained=[True,True,True,False,False,False]),
                  dict(node="B4",restrained=[False,True,True,False,False,False])] +
                 ([dict(node="T0",restrained=[False,True,False,False,False,False])] if laterally_braced else []),
        cases=[dict(id="DOWN",source="3 forcas verticais de 200 N sintéticas, sem distribuicao fisica"),
               dict(id="UP",source="Sucção nodal inversa sintética, NAO vento da obra")],
        nodal_loads=[dict(node=f"T{i}",case=case,fx_n=0,fy_n=0,
             fz_n=(200 if case=="UP" else -200),mx_nm=0,my_nm=0,mz_nm=0)
             for case in ("DOWN","UP") for i in (1,2,3)],
        combinations=[dict(id="BAIXO",factors={"DOWN":1}),
                      dict(id="CIMA",factors={"UP":1})])


def evidence(purlin_results=None, truss_results=None):
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    prior = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    prior.update(dict(status="screening_only",release_for_fabrication=False,
        structural_design_approved=False,
        source="planta baixa(2).pdf e ton valores(2).pdf, 05/11/2026",
        unresolved=["vao livre da terca", "posicao das 4 pecas avulsas",
                    "juntas e rigidez dos nos", "vinculos e travamento lateral",
                    "aco e propriedades certificadas", "acoes permanentes, vento e combinacoes NBR",
                    "detalhes de ligacoes e ancoragens"]))
    if purlin_results is not None: prior["purlin"] = purlin_results
    if truss_results is not None: prior["no_diagonals"] = truss_results
    REPORT.write_text(json.dumps(prior,indent=2,ensure_ascii=False,allow_nan=False)+"\n")


def test_tom_u75e_isolated_purlin_real_jpn_mechanics_and_limits():
    s=section("Ue")
    collected=[]
    for q in (100.,250.,500.):
        output=analyze_frame3d(purlin(q))
        r=output["combinations"]["Q-TEST"]
        station=r["members"]["T1"]["stations"][2]
        analytic=5*q*L**4/(384*E*s["iy_m4"])
        assert station["displacement_local_m"][2] == pytest.approx(-analytic,rel=1e-8)
        assert r["nodes"]["A"]["force_n"][2] == pytest.approx(q*L/2,rel=1e-9)
        assert r["nodes"]["B"]["force_n"][2] == pytest.approx(q*L/2,rel=1e-9)
        assert abs(station["my_nm"]) == pytest.approx(q*L**2/8,rel=1e-9)
        assert r["equilibrium"]["relative_residual"] < 1e-8
        collected.append(dict(q_n_m=q,midspan_deflection_mm=round(1000*analytic,4),
            max_bending_moment_nm=round(q*L**2/8,4),
            span_m=L,assumed_clear_span=True,engine_adapter=output["solver"]["adapter"]))
    # JPN's FRAME3D guard checks NODAL motion, but not midspan displacement:
    # q=500 N/m has >1% span deflection and is nevertheless returned.
    # q=700 N/m crosses the nodal rotation guard and must be rejected.
    assert collected[-1]["midspan_deflection_mm"] > L*10
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(purlin(700.))
    assert exc.value.code == "MODEL_LIMIT"
    evidence(purlin_results=dict(hypothetical_loads=collected,
        q500_engine_status="returned_even_though_midspan_exceeds_one_percent_span",
        q700_engine_status="MODEL_LIMIT_on_nodal_rotation",
        note="GAP: frame3d/2 lacks interior station motion guard; not a normative limit, but important experimental-domain inconsistency. Clear span unverified."))


def test_tom_no_diagonals_experimental_frame_equilibrium_only():
    # Two end supports along the bottom axis leave a whole-body roll mechanism.
    # An unconfirmed purlin/wall lateral brace must NEVER be silently invented.
    with pytest.raises(AnalysisError) as exc:
        analyze_frame3d(no_diagonals(laterally_braced=False))
    assert exc.value.code == "UNSTABLE"
    # Separate mechanically stabilised scenario; extra restraint at upper T0
    # is a HYPOTHESIS, not a support found in the architectural PDF.
    raw=no_diagonals(laterally_braced=True)
    result=analyze_frame3d(raw)
    combinations={}
    for name,sign in (("BAIXO",-1),("CIMA",1)):
        r=result["combinations"][name]
        reactions=sum(r["nodes"][k]["force_n"][2] for k in ("B0","B4"))
        assert reactions == pytest.approx(-600*sign,abs=1e-5)
        assert r["equilibrium"]["relative_residual"] < 1e-8
        displacements=[v["translation_m"][2] for v in r["nodes"].values()]
        combinations[name]=dict(total_applied_vertical_n=600*sign,
            total_support_vertical_n=round(reactions,5),
            max_nodal_vertical_displacement_mm=round(max(abs(x) for x in displacements)*1000,6),
            equilibrium_residual=r["equilibrium"]["relative_residual"])
    evidence(truss_results=dict(schema=result["schema_version"],
        member_count=len(raw["members"]),joint_count=len(raw["nodes"]),
        rigid_joint_assumption=True,bracing_unverified=True,
        synthetic_point_loads_per_case=3,point_load_n=200,
        modeled_loose_U_pieces=0,combinations=combinations,
        unbraced_solver_status="UNSTABLE",
        added_hypothetical_brace="UY at upper node T0 (only for sensitivity)",
        note="Not a true truss, nor real project design; all joint stiffness, lateral bracing and loading remain unverified."))
