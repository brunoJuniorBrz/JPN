"""Single-line purlin screening: linear Euler-Bernoulli beam, uniform load, equal spans.

Not roof wind generation, cold-formed resistance, torsion/warping, connections,
bracing, fabrication sizing or Brazilian normative verification.
Design method inspired by public reference models in PurlinLine.jl and TrussMe;
this independent formulation reuses none of their implementation code.
"""
from __future__ import annotations
import math
from numpy import array, zeros, ix_, linalg
from numpy.polynomial import Polynomial as Poly

SCHEMA = "jpn.purlin/1"
OUT_SCHEMA = "jpn.purlin-result/1"

def finite(v,lo,hi,label):
    if type(v) not in (int,float) or not math.isfinite(v) or not lo <= v <= hi:
        raise ValueError(f"{label}: valor finito entre {lo} e {hi} exigido.")
    return float(v)

def obj(v,required,optional=()):
    if type(v) is not dict or not set(required).issubset(v) or set(v).difference(set(required)|set(optional)):
        raise ValueError("Contrato de entrada inválido ou incompleto.")

def _rect(area_parts,x0,x1,y0,y1):
    if x1<=x0 or y1<=y0:
        raise ValueError("Seção com chapas sobrepostas ou dimensões inválidas.")
    area=(x1-x0)*(y1-y0)
    iy=(x1-x0)*(y1**3-y0**3)/3
    area_parts.append((area,iy))

def section_properties(p):
    obj(p,("id","family","height_mm","width_mm","thickness_mm","lip_mm","price_brl_per_m","source"))
    if type(p["id"]) is not str or not (1<=len(p["id"])<=40) or not p["id"].isascii() or not p["id"].replace("-","").replace("_","").isalnum():
        raise ValueError("Identificador do perfil inválido.")
    if type(p["source"]) is not str or not 2<=len(p["source"].strip())<=200:
        raise ValueError("Informe a origem dos dados do perfil.")
    fam=p["family"]
    if fam not in ("U","Ue","tube"):raise ValueError("Família de seção não implementada.")
    h=finite(p["height_mm"],25,500,"Altura")
    b=finite(p["width_mm"],20,300,"Largura")
    t=finite(p["thickness_mm"],0.6,12,"Espessura")
    lip=finite(p["lip_mm"],0,100,"Enrijecedor")
    price=p["price_brl_per_m"]
    if price is not None:finite(price,0,10000,"Preço por metro")
    if t*2>=min(h,b):raise ValueError("Espessura incompatível com a seção.")
    if fam=="U" and lip!=0:raise ValueError("Perfil U não possui enrijecedor.")
    if fam=="tube" and lip!=0:raise ValueError("Tubo não possui enrijecedor.")
    if fam=="Ue" and not t<=lip<=(h/2-t):raise ValueError("Enrijecedor deve caber na alma e ter pelo menos uma espessura.")
    parts=[]
    if fam=="tube":
        a=b*h-(b-2*t)*(h-2*t)
        iy=(b*h**3-(b-2*t)*(h-2*t)**3)/12
    else:
        # Sharp-corner geometric plates only. No bend radii/corner strengthening.
        _rect(parts,0,t,0,h)
        _rect(parts,t,b,0,t)
        _rect(parts,t,b,h-t,h)
        if fam=="Ue":
            _rect(parts,b-t,b,t,t+lip)
            _rect(parts,b-t,b,h-t-lip,h-t)
        a=sum(x for x,_ in parts)
        iy=sum(i for _,i in parts)-a*(h/2)**2
    if iy<=0 or a<=0:raise ValueError("Propriedades geométricas não positivas.")
    return a,iy

def _extrema(polynomial,length):
    places=[0.,length]
    for root in polynomial.deriv().roots():
        if abs(root.imag)<1e-8 and -1e-8<=root.real<=length+1e-8:
            places.append(min(length,max(0.,float(root.real))))
    return max(((float(polynomial(x)),float(x)) for x in places),key=lambda p:abs(p[0]))

def analyze_candidate(candidate,span,length,q,e_gpa,limit_ratio,density,end_condition):
    area_mm2,iy_mm4=section_properties(candidate)
    ei=e_gpa*1e9*iy_mm4*1e-12
    n=span+1
    ndof=2*n
    K=zeros((ndof,ndof))
    F=zeros(ndof)
    for i in range(span):
        L=length
        ke=ei/L**3*array([
            [12,6*L,-12,6*L],
            [6*L,4*L*L,-6*L,2*L*L],
            [-12,-6*L,12,-6*L],
            [6*L,2*L*L,-6*L,4*L*L],
        ])
        fe=array([q*L/2,q*L*L/12,q*L/2,-q*L*L/12])
        idx=[i*2,i*2+1,i*2+2,i*2+3]
        K[ix_(idx,idx)]+=ke
        F[idx]+=fe
    if end_condition=="cantilever":
        restrained=[0,1]
    else:
        restrained=list(range(0,ndof,2))
        if end_condition=="fixed":
            restrained +=[1,ndof-1]
    free=[i for i in range(ndof) if i not in restrained]
    D=zeros(ndof)
    try:
        D[free]=linalg.solve(K[ix_(free,free)],F[free])
    except linalg.LinAlgError as exc:
        raise ValueError("Modelo singular: apoios ou rigidez insuficientes.") from exc
    residual=K@D-F
    maxdef=(0.,0.)
    maxmom=(0.,0.)
    maxshear=(0.,0.)
    end_moments=[]
    for i in range(span):
        x=Poly([0,1.])
        r=x/length
        w=(1-3*r**2+2*r**3)*D[2*i]+length*(r-2*r**2+r**3)*D[2*i+1] +(3*r**2-2*r**3)*D[2*i+2]+length*(-r**2+r**3)*D[2*i+3]
        w+=q/(24*ei)*x**2*(x-length)**2
        moment=w.deriv(2)*ei
        shear=w.deriv(3)*ei
        for field,cur in ((w,maxdef),(moment,maxmom),(shear,maxshear)):
            val,pos=_extrema(field,length)
            actual=(val,pos+i*length)
            if abs(val)>abs(cur[0]):
                if field is w:maxdef=actual
                elif field is moment:maxmom=actual
                else:maxshear=actual
        end_moments.append([float(moment(0)),float(moment(length))])
    reactions=[{"at_m":i*length,"vertical_n":float(residual[2*i]),"moment_nm":float(residual[2*i+1]) if 2*i+1 in restrained else 0.} for i in range(n) if 2*i in restrained]
    if not math.isclose(sum(z["vertical_n"] for z in reactions), -q*span*length,rel_tol=1e-8,abs_tol=1e-6):
        raise ValueError("Falha de equilíbrio: cargas e reações não conferem.")
    limit_mm=1000*length/limit_ratio
    mass=area_mm2*1e-6*density*span*length
    return {
        "id":candidate["id"],"family":candidate["family"],"source":candidate["source"],
        "section_model":"sharp-corner-linear-elastic-approximation",
        "area_mm2":area_mm2,"inertia_mm4":iy_mm4,
        "mass_kg":mass,"estimated_material_cost_brl":None if candidate["price_brl_per_m"] is None else float(candidate["price_brl_per_m"])*span*length,
        "deflection_mm":maxdef[0]*1000,"deflection_at_m":maxdef[1],"deflection_limit_mm":limit_mm,
        "within_user_deflection_limit":abs(maxdef[0])*1000<=limit_mm*(1+1e-10),
        "peak_moment_nm":maxmom[0],"moment_at_m":maxmom[1],
        "peak_shear_n":maxshear[0],"shear_at_m":maxshear[1],
        "reactions":reactions,"span_end_moments_nm":end_moments,
    }

def analyze_purlin(payload):
    obj(payload,("schema_version","request_id","span_count","span_length_m","end_condition","uniform_load_n_m","e_gpa","density_kg_m3","deflection_limit_ratio","candidates"))
    if payload["schema_version"]!=SCHEMA:raise ValueError("Contrato purlin inválido.")
    if type(payload["request_id"]) is not str or not 8<=len(payload["request_id"])<=80:raise ValueError("Identificador de requisição inválido.")
    spans=payload["span_count"]
    if type(spans) is not int or not 1<=spans<=5:raise ValueError("Aceitos de 1 a 5 vãos iguais.")
    L=finite(payload["span_length_m"],.5,12,"Vão")
    q=finite(payload["uniform_load_n_m"],-200000,200000,"Carga linear")
    e=finite(payload["e_gpa"],50,250,"Módulo de elasticidade")
    density=finite(payload["density_kg_m3"],100,20000,"Densidade")
    ratio=finite(payload["deflection_limit_ratio"],100,1000,"Limite de flecha")
    cond=payload["end_condition"]
    if cond not in ("simple","fixed","cantilever") or (cond=="cantilever" and spans!=1):
        raise ValueError("Engaste em balanço exige exatamente um vão.")
    candidates=payload["candidates"]
    if type(candidates) is not list or not 1<=len(candidates)<=8:raise ValueError("Informe de 1 a 8 seções candidatas.")
    if len(set(c["id"] for c in candidates if type(c) is dict and "id" in c))!=len(candidates):raise ValueError("IDs de candidatos repetidos.")
    return {
        "schema_version":OUT_SCHEMA,"request_id":payload["request_id"],
        "analysis_scope":"elastic-strong-axis-bending-only-not-design-approval",
        "input":{"span_count":spans,"span_length_m":L,"end_condition":cond,"uniform_load_n_m":q,"e_gpa":e,"density_kg_m3":density,"deflection_limit_ratio":ratio},
        "results":[analyze_candidate(c,spans,L,q,e,ratio,density,cond) for c in candidates],
        "computedStructuralApproval":False,"fabricationRelease":False,
        "limitations":["Sem cargas de vento ou telhas automáticas","Sem torção, flexão lateral e flambagem","Sem resistência, ligações ou dimensionamento conforme NBR","Seções aproximadas com cantos vivos; conferir dados do fabricante","Cargas e apoios precisam de validação técnica"],
    }
