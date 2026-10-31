"""Experimental mixed spatial frame/axial model; NOT wired to JPN UI/HTTP.

Frame elements are PyNiteFEA 3.2.1 beam-columns; axial elements are
bilateral Spring3D elements with k=EA/L. Only pure axial nodes have their
mathematically nonexistent rotational DOFs eliminated (zero loading/response).
No self-weight, design, buckling, or automatic connection assumptions.
"""
import contextlib
from importlib.metadata import version
import io
import math
import time
import warnings

import numpy as np
from scipy.linalg import eigvalsh

from .frame3d_model import input_hash, obj, number, text, flags, fail
from .model import AnalysisError

LIMITS = dict(nodes=150, members=320, materials=50, sections=50,
              supports=150, cases=10, nodal_loads=500, combinations=10)


def validate_mixed3d(data):
    obj(data, 'schema_version units theory project nodes members materials sections supports cases nodal_loads combinations', 'modelo')
    if (data['schema_version'], data['units'], data['theory']) != ('jpn.mixed3d/1', 'SI', 'linear-elastic-frame-axial'):
        fail('UNSUPPORTED_MODEL', 'Somente pórticos Euler-Bernoulli e barras axiais bilaterais 3D em SI.')
    obj(data['project'], 'id revision source', 'projeto')
    for k,v in data['project'].items():
        text(v, 'projeto.' + k)
    ids = {}
    for field, limit in LIMITS.items():
        collection = data[field]
        if type(collection) is not list or len(collection) > limit:
            fail('INPUT_LIMIT', f'{field}: limite de {limit} registros.')
    for field in ('nodes', 'members', 'materials', 'sections', 'cases', 'combinations'):
        values = data[field]
        names = []
        for item in values:
            if type(item) is not dict or 'id' not in item:
                fail('INVALID_INPUT', f'{field}: registro inválido.')
            text(item['id'], f'{field}.id', True)
            names.append(item['id'])
        if len(names) != len(set(names)):
            fail('DUPLICATE_ID', f'{field}: IDs duplicados.')
        ids[field] = set(names)
    if len(data['nodes']) < 2 or not all(data[k] for k in ('members','cases','combinations','nodal_loads')):
        fail('INCOMPLETE_MODEL', 'Informe nós, barras, casos, cargas e combinações.')
    points={}
    for n in data['nodes']:
        obj(n,'id x_m y_m z_m','nó')
        for k in ('x_m','y_m','z_m'):
            number(n[k],-10000,10000,k)
        points[n['id']] = np.array([n[k] for k in ('x_m','y_m','z_m')], dtype=float)
    for mat in data['materials']:
        obj(mat, 'id e_pa g_pa nu source revision', 'material')
        for k in ('e_pa','g_pa'):
            number(mat[k],1,1e13,k)
        number(mat['nu'],-.99,.499,'nu')
        if abs(mat['e_pa']/(2*mat['g_pa']*(1+mat['nu']))-1)>.001:
            fail('INVALID_MATERIAL','E, G e nu incompatíveis.')
        text(mat['source'],'material.source');text(mat['revision'],'material.revision')
    for sec in data['sections']:
        obj(sec,'id area_m2 iy_m4 iz_m4 j_m4 source revision','seção')
        for k in ('area_m2','iy_m4','iz_m4','j_m4'):
            number(sec[k],1e-16,1000,k,True)
        text(sec['source'],'seção.source');text(sec['revision'],'seção.revision')
    frames=set(); edges=set()
    for m in data['members']:
        if m.get('kind')=='frame':
            obj(m,'id start end kind material section rotation_deg release_start release_end','pórtico')
            for k in ('material','section'):
                text(m[k],k,True)
            if m['material'] not in ids['materials'] or m['section'] not in ids['sections']:
                fail('INVALID_REFERENCE',f"{m['id']}: material ou seção ausente.")
            number(m['rotation_deg'],-360,360,'rotation_deg')
            flags(m['release_start']);flags(m['release_end'])
            if any(m['release_start'][:3]+m['release_end'][:3]):
                fail('UNSUPPORTED_RELEASE','Liberação translacional não suportada.')
            if m['release_start'][3] and m['release_end'][3]:
                fail('UNSUPPORTED_RELEASE','Liberação de torção nas duas extremidades.')
            frames.update((m['start'],m['end']))
        elif m.get('kind')=='axial':
            obj(m,'id start end kind e_pa area_m2 source revision','axial')
            number(m['e_pa'],1,1e13,'E',True);number(m['area_m2'],1e-16,1000,'A',True)
            text(m['source'],'axial.source');text(m['revision'],'axial.revision')
        else:
            fail('UNSUPPORTED_MODEL','kind deve ser frame ou axial, bilateral.')
        for k in ('start','end'):
            text(m[k],k,True)
        a,b=m['start'],m['end']
        if a not in points or b not in points or a==b:
            fail('INVALID_REFERENCE',f"{m['id']}: nós inválidos.")
        edge=tuple(sorted((a,b)))
        if edge in edges:
            fail('INVALID_GEOMETRY','Barras duplicadas.')
        edges.add(edge)
        length=float(np.linalg.norm(points[b]-points[a]))
        if not 1e-5 <= length <= 1000:
            fail('INVALID_GEOMETRY','Comprimento fora de 1e-5–1000 m.')
    if not frames or not any(m['kind']=='axial' for m in data['members']):
        fail('UNSUPPORTED_MODEL','Modelo misto deve conter pórtico e barra axial.')
    supported={}
    for s in data['supports']:
        obj(s,'node restrained','apoio');text(s['node'],'apoio.node',True)
        flags(s['restrained'])
        if s['node'] not in points or s['node'] in supported or not any(s['restrained']):
            fail('INVALID_REFERENCE','Apoio ausente, duplicado ou vazio.')
        if s['node'] not in frames and any(s['restrained'][3:]):
            fail('INACTIVE_DOF','Nó apenas axial não possui rotações para restringir.')
        supported[s['node']]=s['restrained']
    for case in data['cases']:
        obj(case,'id source','caso');text(case['source'],'case.source')
    for l in data['nodal_loads']:
        obj(l,'node case fx_n fy_n fz_n mx_nm my_nm mz_nm','carga')
        text(l['node'],'load.node',True);text(l['case'],'load.case',True)
        if l['node'] not in points or l['case'] not in ids['cases']:
            fail('INVALID_REFERENCE','Carga em nó/caso inexistente.')
        for k in ('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm'):
            number(l[k],-1e9,1e9,k)
        if l['node'] not in frames and any(l[k]!=0 for k in ('mx_nm','my_nm','mz_nm')):
            fail('INACTIVE_DOF','Nó axial não aceita momento nodal.')
    if any(not any(l['case']==case for l in data['nodal_loads']) for case in ids['cases']):
        fail('INCOMPLETE_MODEL','Declare ações de cada caso.')
    for combo in data['combinations']:
        obj(combo,'id factors','combinação')
        fs=combo['factors']
        if type(fs) is not dict or not fs or set(fs)-ids['cases']:
            fail('INVALID_COMBINATION','Fatores e casos precisam ser explícitos.')
        for f in fs.values():
            number(f,-100,100,'fator')
        if not any(fs.values()):
            fail('INVALID_COMBINATION','Combinação nula.')
    from .frame3d import geometry_check
    geometry_check(data)
    return data,points,frames,supported


def analyze_mixed3d(raw):
    started=time.perf_counter()
    data,points,frame_nodes,supports=validate_mixed3d(raw)
    try:
        if version('PyNiteFEA')!='3.2.1':
            fail('DEPENDENCY_VERSION','Exigido PyNiteFEA 3.2.1.')
        from Pynite import FEModel3D,Analysis
    except ImportError as exc:
        raise AnalysisError('DEPENDENCY_MISSING','PyNiteFEA 3.2.1 indisponível.') from exc
    model=FEModel3D()
    for nid,xyz in points.items():
        model.add_node(nid,*xyz)
    for mat in data['materials']:
        model.add_material(mat['id'],mat['e_pa'],mat['g_pa'],mat['nu'],0)
    for sec in data['sections']:
        model.add_section(sec['id'],sec['area_m2'],sec['iy_m4'],sec['iz_m4'],sec['j_m4'])
    axial={}
    for m in data['members']:
        if m['kind']=='frame':
            model.add_member(m['id'],m['start'],m['end'],m['material'],m['section'],rotation=m['rotation_deg'])
            model.def_releases(m['id'],*(m['release_start']+m['release_end']))
        else:
            length=float(np.linalg.norm(points[m['end']]-points[m['start']]))
            model.add_spring(m['id'],m['start'],m['end'],m['e_pa']*m['area_m2']/length,
                             tension_only=False,comp_only=False)
            axial[m['id']]=(m,length)
    for nid in points:
        dofs=supports.get(nid,[False]*6).copy()
        if nid not in frame_nodes:
            # These 3 slots do not exist for an axial-only node: elimination,
            # not physical rotational support. Moments and restraints are
            # rejected for them in the strict preflight above.
            dofs[3:]=[True]*3
        model.def_support(nid,*dofs)
    for l in data['nodal_loads']:
        for direction,k in zip(('FX','FY','FZ','MX','MY','MZ'),
                               ('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')):
            if l[k]:
                model.add_node_load(l['node'],direction,l[k],l['case'])
    for c in data['combinations']:
        model.add_load_combo(c['id'],c['factors'])
    try:
        with contextlib.redirect_stdout(io.StringIO()),warnings.catch_warnings():
            warnings.simplefilter('error')
            Analysis._prepare_model(model)
            if any(len(m.sub_members)!=1 for m in model.members.values()):
                fail('UNRESOLVED_CONTACT','PyNite gerou segmentação implícita.')
            matrix=model.Ke(data['combinations'][0]['id'],check_stability=False,sparse=False)
            free=[]
            for node in model.nodes.values():
                dofs=supports.get(node.name,[False]*6).copy()
                if node.name not in frame_nodes: dofs[3:]=[True]*3
                free.extend(6*node.ID+i for i in range(6) if not dofs[i])
            free=np.array(free,dtype=int);condition=1.
            if len(free):
                kff=matrix[np.ix_(free,free)]
                diagonal=np.diag(kff)
                if not np.isfinite(kff).all() or np.any(diagonal<=0):
                    fail('UNSTABLE','Rigidez nula ou não finita.')
                scale=np.sqrt(diagonal)
                eigs=eigvalsh(kff/scale[:,None]/scale[None,:])
                if eigs[0]<=10*len(free)*np.finfo(float).eps*eigs[-1]:
                    fail('UNSTABLE','Mecanismo / movimento de corpo rígido.')
                condition=float(eigs[-1]/eigs[0])
                if condition>1e10:
                    fail('ILL_CONDITIONED','Condicionamento excede limite experimental.')
            model.analyze_linear(log=False,check_stability=True,sparse=True)
    except AnalysisError:
        raise
    except (np.linalg.LinAlgError,ZeroDivisionError) as exc:
        raise AnalysisError('UNSTABLE','Matriz singular; análise recusada.') from exc
    except Exception as exc:
        raise AnalysisError('NUMERICAL_FAILURE',f'PyNite falhou: {type(exc).__name__}; sem resultado.') from exc
    span=max(float(np.ptp(np.array(list(points.values())),axis=0).max()),1e-5)
    result={}
    for combo in data['combinations']:
        name=combo['id'];nodes={};members={}
        forces=np.zeros(3);moments=np.zeros(3);force_scale=0.;moment_scale=0.
        origin=next(iter(points.values()))
        for nid,n in model.nodes.items():
            u=np.array([getattr(n,k)[name] for k in ('DX','DY','DZ')],dtype=float)
            rotation=np.array([getattr(n,k)[name] for k in ('RX','RY','RZ')],dtype=float)
            reaction=np.array([getattr(n,k)[name] for k in
                ('RxnFX','RxnFY','RxnFZ','RxnMX','RxnMY','RxnMZ')],dtype=float)
            if not all(np.isfinite(v).all() for v in (u,rotation,reaction)):
                fail('NUMERICAL_FAILURE','Deslocamento/reação não finito.')
            if max(abs(u))/span>.01 or max(abs(rotation))>.05:
                fail('MODEL_LIMIT','Movimento fora do domínio linear experimental.')
            load=np.zeros(6)
            for l in data['nodal_loads']:
                if l['node']==nid:
                    load+=combo['factors'].get(l['case'],0)*np.array([l[k] for k in
                        ('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')])
            external=load+reaction
            forces+=external[:3]
            moments+=external[3:]+np.cross(points[nid]-origin,external[:3])
            force_scale+=np.linalg.norm(load[:3])+np.linalg.norm(reaction[:3])
            moment_scale+=np.linalg.norm(load[3:])+np.linalg.norm(reaction[3:])
            if nid not in frame_nodes and (np.max(abs(rotation))>1e-12 or np.max(abs(reaction[3:]))>1e-8):
                fail('INACTIVE_DOF','Nó axial produziu rotação ou momento indevido.')
            nodes[nid]=dict(translation_m=u.tolist(),rotation_rad=rotation.tolist(),
                reaction_force_n=reaction[:3].tolist(),reaction_moment_nm=reaction[3:].tolist(),
                active_rotations=nid in frame_nodes)
        for mid,(m,length) in axial.items():
            spring=model.springs[mid]
            value=-float(spring.axial(name))  # Same sign convention audited in PR #14.
            direction=(points[m['end']]-points[m['start']])/length
            extension=float(direction@(np.array(nodes[m['end']]['translation_m'])-
                                         np.array(nodes[m['start']]['translation_m'])))
            expected=m['e_pa']*m['area_m2']/length*extension
            if abs(extension/length)>.01:
                fail('MODEL_LIMIT','Deformação axial acima do domínio linear.')
            if not math.isfinite(value) or not math.isclose(value,expected,rel_tol=1e-7,abs_tol=1e-5):
                fail('EQUILIBRIUM_FAILURE','Barra axial inconsistente com EA/L e deslocamentos.')
            members[mid]=dict(kind='axial',axial_n=value,length_m=length,extension_m=extension)
        for mid,beam in model.members.items():
            sub=next(iter(beam.sub_members.values()))
            actions=np.asarray(sub.f(name)).ravel()
            if len(actions)!=12 or not np.isfinite(actions).all():
                fail('NUMERICAL_FAILURE','Forças de pórtico inválidas.')
            members[mid]=dict(kind='frame',length_m=float(beam.L()),end_actions_local=actions.tolist())
        residual=max(float(np.linalg.norm(forces))/max(force_scale,1e-30),
            float(np.linalg.norm(moments))/max(moment_scale+span*force_scale,1e-30))
        if not math.isfinite(residual) or residual>1e-8:
            fail('EQUILIBRIUM_FAILURE','Equilíbrio global não atendido.')
        result[name]=dict(nodes=nodes,members=members,
             equilibrium=dict(force_n=forces.tolist(),moment_nm=moments.tolist(),relative_residual=residual))
    return dict(schema_version='jpn.mixed3d-result/1',status='analysis_completed_experimental',
        units='SI',project=data['project'],input_sha256=input_hash(data),
        solver=dict(name='PyNiteFEA',version=version('PyNiteFEA'),adapter='jpn-mixed3d/1'),
        assumptions=['Primeira ordem, pórtico Euler-Bernoulli e mola axial bilateral EA/L.',
          'Rotação inativa em nós apenas axiais é eliminada matematicamente, não representa apoio.',
          'Sem peso próprio, vento, flambagem, resistência normativa ou liberação para fabricação.'],
        diagnostics=dict(free_dofs=len(free),scaled_condition=condition,
                         elapsed_seconds=time.perf_counter()-started),
        combinations=result)
