"""Version 2 loading compiler. No stiffness algorithm, guessed density or supports.

Frame UDL uses actual PyNite consistent fixed-end loads (including releases).
Axial self-weight is explicitly lumped, never a transverse spring load.
"""
from copy import deepcopy
import numpy as np
from .frame3d_model import obj, number, text, fail
from .mixed3d import validate_mixed3d, analyze_mixed3d


def vector(value, label, limit):
    if type(value) is not list or len(value)!=3: fail('INVALID_INPUT',label+': informe três componentes.')
    for v in value: number(v,-limit,limit,label)


def analyze_loaded_mixed3d(raw, *, _joint_actions=None):
    obj(raw,'schema_version units theory project nodes members materials sections supports cases nodal_loads combinations member_loads self_weight','modelo carregado')
    if raw['schema_version']!='jpn.mixed3d/2': fail('UNSUPPORTED_MODEL','Exigido jpn.mixed3d/2.')
    data=deepcopy(raw); data['schema_version']='jpn.mixed3d/1'
    loads=data.pop('member_loads'); sw=data.pop('self_weight')
    if type(loads) is not list or len(loads)>640: fail('INPUT_LIMIT','Máximo 640 cargas uniformes.')
    # Validate topology/properties before compiling any density or load.
    cases={c['id'] for c in data['cases'] if type(c) is dict and type(c.get('id')) is str} if type(data['cases']) is list else set()
    validate_mixed3d(data,distributed_cases=cases)
    members={m['id']:m for m in data['members']}; points={n['id']:np.array([n[k] for k in ('x_m','y_m','z_m')]) for n in data['nodes']}
    frame_loads=[]; names=set()
    for l in loads:
        obj(l,'id member case coordinate_system force_per_length_n_m source revision','carga uniforme')
        for k in ('id','member','case'): text(l[k],k,True)
        if l['id'] in names: fail('DUPLICATE_ID','Carga distribuída duplicada.')
        names.add(l['id'])
        if l['case'] not in cases or l['member'] not in members: fail('INVALID_REFERENCE','Carga uniforme refere caso/elemento ausente.')
        if members[l['member']]['kind']!='frame': fail('UNSUPPORTED_LOAD','Carga distribuída não é aplicada a barra axial.')
        if l['coordinate_system'] not in ('global','local'): fail('INVALID_INPUT','Declare sistema global ou local.')
        vector(l['force_per_length_n_m'],'N/m',1e9); text(l['source'],'source'); text(l['revision'],'revision')
        frame_loads.append(l)
    trace=dict(member_loads=deepcopy(loads),self_weight=None)
    if sw is not None:
        obj(sw,'case gravity_m_s2 axial_lumping densities','peso próprio')
        text(sw['case'],'self_weight.case',True)
        if sw['case'] not in cases: fail('INVALID_REFERENCE','Caso próprio de peso ausente.')
        if any(l['case']==sw['case'] for l in loads+data['nodal_loads']): fail('DUPLICATE_SELF_WEIGHT','Caso de peso próprio reservado; não adicionar ações manuais ao mesmo caso.')
        vector(sw['gravity_m_s2'],'gravidade m/s²',100)
        if np.linalg.norm(sw['gravity_m_s2'])==0: fail('INVALID_INPUT','Gravidade não pode ser nula.')
        if sw['axial_lumping']!='half-to-end-nodes': fail('UNSUPPORTED_LOAD','Declare concentração do peso axial metade por nó.')
        densities=sw['densities']
        if type(densities) is not list or len(densities)!=len(members): fail('INCOMPLETE_DENSITY','Declare densidade para todos os segmentos, uma vez.')
        seen=set(); weights=[]
        sections={s['id']:s for s in data['sections']}
        for d in densities:
            obj(d,'member kg_m3 source revision','densidade'); text(d['member'],'member',True)
            number(d['kg_m3'],1e-9,100000,'densidade',True); text(d['source'],'source'); text(d['revision'],'revision')
            mid=d['member']
            if mid in seen or mid not in members: fail('INVALID_REFERENCE','Densidade duplicada ou elemento ausente.')
            seen.add(mid); m=members[mid]; length=float(np.linalg.norm(points[m['end']]-points[m['start']]))
            area=m['area_m2'] if m['kind']=='axial' else sections[m['section']]['area_m2']
            mass=d['kg_m3']*area*length; q=d['kg_m3']*area*np.array(sw['gravity_m_s2']); total=q*length
            if not np.isfinite(q).all() or max(abs(q))>1e9: fail('INPUT_LIMIT','Peso por comprimento excede domínio.')
            weights.append(dict(member=mid,mass_kg=mass,force_n=total.tolist(),density=deepcopy(d),representation='consistent-frame-udl' if m['kind']=='frame' else 'half-to-end-nodes'))
            if m['kind']=='frame': frame_loads.append(dict(member=mid,case=sw['case'],coordinate_system='global',force_per_length_n_m=q.tolist()))
            else:
                for nid in (m['start'],m['end']):
                    data['nodal_loads'].append(dict(node=nid,case=sw['case'],fx_n=float(total[0]/2),fy_n=float(total[1]/2),fz_n=float(total[2]/2),mx_nm=0.,my_nm=0.,mz_nm=0.))
        trace['self_weight']=dict(case=sw['case'],gravity_m_s2=sw['gravity_m_s2'],axial_lumping=sw['axial_lumping'],members=weights,total_mass_kg=sum(w['mass_kg'] for w in weights))
    # Generated axial loads can exceed the public nodal-record bound; aggregate
    # only identical node/case pairs, preserving the raw declarations in hash.
    totals={}
    keys=('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')
    for l in data['nodal_loads']:
        key=(l['node'],l['case']); totals.setdefault(key,np.zeros(6)); totals[key]+=np.array([l[k] for k in keys])
    data['nodal_loads']=[dict(node=n,case=c,**dict(zip(keys,map(float,value)))) for (n,c),value in totals.items()]
    return analyze_mixed3d(data,_loading=dict(original=deepcopy(raw),frame_loads=frame_loads,trace=trace),_joint_actions=_joint_actions)
