"""Isolated two-stage mixed 3D INITIAL-STRESS experiment, not nonlinear design.

Native pinned PyNite elastic frames, real bilateral axial elements, consistent
Hermite bending energy and translational axial geometric projector. No invented
rotations, transverse stiffness, mesh, restraints, prestress or imperfections.
Torsional geometric effects, warping and releases are outside this contract.
"""
import contextlib
from importlib.metadata import version
import io
import time
import warnings

import numpy as np
from scipy.linalg import eigh, solve

from .frame3d_model import obj, fail, input_hash, number
from .mixed3d import validate_mixed3d, analyze_mixed3d
from .model import AnalysisError
from .reduced_equilibrium import reduced_equilibrium


def axial_geometric(direction, normal, length):
    """6 translational DOFs. N>0 tension, N<0 compression, units N/m."""
    e=np.asarray(direction,dtype=float)
    if e.shape!=(3,) or not np.isfinite(e).all() or abs(e@e-1)>1e-12:
        fail('INVALID_GEOMETRY','Axial direction must be a finite unit vector.')
    number(normal,-1e15,1e15,'initial normal force')
    number(length,1e-5,1000.,'physical length',True)
    g=normal/length*(np.eye(3)-np.outer(e,e))
    return np.block([[g,-g],[-g,g]])


def hermite_geometric(normal,length):
    """12 DOFs, bending energy N/2 integral(v'^2+w'^2) dx only.

    No longitudinal geometric stiffness and no geometric torsion. This is
    explicitly different from PyNite's additional axial/torsional terms.
    """
    number(normal,-1e15,1e15,'initial normal force')
    number(length,1e-5,1000.,'physical length',True)
    L=length
    block=normal/(30*L)*np.array([[36,3*L,-36,3*L],[3*L,4*L*L,-3*L,-L*L],
                                 [-36,-3*L,36,-3*L],[3*L,-L*L,-3*L,4*L*L]])
    out=np.zeros((12,12))
    for dofs,signs in [([1,5,7,11],[1,1,1,1]),([2,4,8,10],[1,-1,1,-1])]:
        out[np.ix_(dofs,dofs)]=block*np.outer(signs,signs)
    return out


def stable_solve(matrix,load,free):
    """Positive elastic/tangent metric, equilibrated solve; no regularization."""
    if not np.isfinite(matrix).all() or not np.isfinite(load).all():
        fail('NUMERICAL_FAILURE','Nonfinite matrix/load.')
    if np.linalg.norm(matrix-matrix.T)>128*len(matrix)*np.finfo(float).eps*max(np.linalg.norm(matrix),1e-30):
        fail('NUMERICAL_FAILURE','Nonsymmetric assembled energy matrix.')
    u=np.zeros(len(matrix))
    if not len(free):
        return u,1.
    k=matrix[np.ix_(free,free)];diag=np.diag(k)
    if np.any(diag<=0):
        fail('UNSTABLE','Nonpositive tangent diagonal; no postbuckling result.')
    scale=np.sqrt(diag);ks=k/scale[:,None]/scale[None,:]
    eig=eigh(ks,eigvals_only=True)
    if eig[0]<=10*len(free)*np.finfo(float).eps*eig[-1]:
        fail('UNSTABLE','Mechanism or unstable tangent; no stiffness added.')
    condition=float(eig[-1]/eig[0])
    if condition>1e10:
        fail('ILL_CONDITIONED','Scaled tangent exceeds 1e10.')
    u[free]=solve(ks,load[free]/scale,assume_a='pos')/scale
    return u,condition


def _native(data,points,frame_nodes,supports):
    from Pynite import FEModel3D
    m=FEModel3D()
    for nid,point in points.items():m.add_node(nid,*point)
    for mat in data['materials']:m.add_material(mat['id'],mat['e_pa'],mat['g_pa'],mat['nu'],0)
    for s in data['sections']:m.add_section(s['id'],s['area_m2'],s['iy_m4'],s['iz_m4'],s['j_m4'])
    for e in data['members']:
        if e['kind']=='frame':m.add_member(e['id'],e['start'],e['end'],e['material'],e['section'],rotation=e['rotation_deg'])
        else:m.add_spring(e['id'],e['start'],e['end'],e['e_pa']*e['area_m2']/np.linalg.norm(points[e['end']]-points[e['start']]))
    for nid in points:
        flags=supports.get(nid,[False]*6).copy()
        if nid not in frame_nodes:flags[3:]=[True]*3  # nonexistent slots, not supports
        m.def_support(nid,*flags)
    for load in data['nodal_loads']:
        for name,k in zip(('FX','FY','FZ','MX','MY','MZ'),('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')):
            if load[k]:m.add_node_load(load['node'],name,load[k],load['case'])
    for c in data['combinations']:m.add_load_combo(c['id'],c['factors'])
    m.analyze_linear(log=False,check_stability=True,sparse=True)
    if any(len(e.sub_members)!=1 for e in m.members.values()):
        fail('UNRESOLVED_CONTACT','Implicit subdivision is not admitted.')
    return m


def analyze_mixed_initial_stress(raw):
    obj(raw,'schema_version geometric_model model','mixed initial-stress request')
    if raw['schema_version']!='jpn.mixed-initial-stress/1' or raw['geometric_model']!='hermite-bending-and-axial-projector':
        fail('UNSUPPORTED_MODEL','Explicit isolated mixed initial-stress contract required.')
    data,points,frame_nodes,supports=validate_mixed3d(raw['model'])
    if len(data['nodes'])>100 or len(data['members'])>128:
        fail('INPUT_LIMIT','100 nodes and 128 explicitly declared elements maximum.')
    if any(e['kind']=='frame' and any(e['release_start']+e['release_end']) for e in data['members']):
        fail('UNSUPPORTED_RELEASE','Releases require a separately validated geometric condensation.')
    if version('PyNiteFEA')!='3.2.1':fail('DEPENDENCY_VERSION','PyNiteFEA 3.2.1 required.')
    # Retain the existing linear preflight, native bases, equilibrium and input
    # provenance. The original solver and its result are not overwritten.
    linear=analyze_mixed3d(data);started=time.perf_counter()
    results={};span=max(float(np.ptp(list(points.values()),axis=0).max()),1e-5)
    try:
        with contextlib.redirect_stdout(io.StringIO()),warnings.catch_warnings():
            warnings.simplefilter('error')
            native=_native(data,points,frame_nodes,supports)
            size=6*len(points);free=[]
            for nid,node in native.nodes.items():
                flags=supports.get(nid,[False]*6)
                free += [node.ID*6+i for i in range(6) if not flags[i] and (i<3 or nid in frame_nodes)]
            free=np.array(free,dtype=int)
            for combo in data['combinations']:
                name=combo['id'];elastic=np.zeros((size,size));geometric=elastic.copy();elements=[]
                for e in data['members']:
                    ni,nj=native.nodes[e['start']].ID,native.nodes[e['end']].ID
                    vector=points[e['end']]-points[e['start']];length=float(np.linalg.norm(vector));direction=vector/length
                    initial=linear['combinations'][name]['members'][e['id']]
                    if e['kind']=='axial':
                        normal=initial['axial_n'];block=e['e_pa']*e['area_m2']/length*np.outer(direction,direction)
                        ke=np.block([[block,-block],[-block,block]]);kg=axial_geometric(direction,normal,length)
                        dofs=np.array([ni*6+i for i in range(3)]+[nj*6+i for i in range(3)])
                        transform=None
                    else:
                        sub=next(iter(native.members[e['id']].sub_members.values()))
                        transform=sub.T();ke_local=sub.ke(name)
                        d=sub.d(name);normal=float((d[6,0]-d[0,0])*sub.material.E*sub.section.A/length)
                        kg_local=hermite_geometric(normal,length)
                        ke=transform.T@ke_local@transform;kg=transform.T@kg_local@transform
                        dofs=np.array(list(range(ni*6,ni*6+6))+list(range(nj*6,nj*6+6)))
                    elastic[np.ix_(dofs,dofs)]+=ke;geometric[np.ix_(dofs,dofs)]+=kg
                    elements.append((e,dofs,ke,kg,normal,length,direction,transform))
                reference=native.Ke(name,sparse=False)
                assembly_error=float(np.linalg.norm(elastic-reference)/max(np.linalg.norm(reference),1e-30))
                if assembly_error>1e-12:fail('NUMERICAL_FAILURE','Elastic assembly disagrees with pinned native elements.')
                load=native.P(name).ravel();u0,elastic_condition=stable_solve(elastic,load,free)
                _,linear_audit=reduced_equilibrium(elastic,u0,load,free,span)
                tangent=elastic+geometric;u,condition=stable_solve(tangent,load,free)
                residual,audit=reduced_equilibrium(tangent,u,load,free,span)
                if max(audit['relative_residual'],linear_audit['relative_residual'])>1e-8:
                    fail('NONCONVERGENCE','Reduced initial-stress equation exceeds 1e-8; no partial result.')
                if max(np.linalg.norm(u[i:i+3])/span for i in range(0,size,6))>.01 or max(np.linalg.norm(u[i+3:i+6]) for i in range(0,size,6))>.05:
                    fail('MODEL_LIMIT','Initial-stress motions exceed small-motion operational limits.')
                members={};assembled=np.zeros(size);correction=np.zeros(3)
                for e,dofs,ke,kg,normal,length,direction,transform in elements:
                    actions=(ke+kg)@u[dofs];assembled[dofs]+=actions
                    du=u[dofs[-(6 if transform is not None else 3):]][:3]-u[dofs[:3]]
                    correction+=np.cross(du,normal*direction)
                    entry=dict(kind=e['kind'],initial_axial_n=normal,length_m=length,end_actions_global=actions.tolist(),
                        elastic_energy_j=float(u[dofs]@ke@u[dofs]/2),geometric_energy_j=float(u[dofs]@kg@u[dofs]/2))
                    if transform is not None:entry['end_actions_local']=(transform@actions).tolist()
                    else:entry['axial_n']=float(actions[3:]@direction)  # transverse end actions are explicitly retained
                    members[e['id']]=entry
                _,nodal=reduced_equilibrium(np.eye(size),assembled,load,free,span)
                if nodal['relative_residual']>1e-8:fail('EQUILIBRIUM_FAILURE','Recovered free nodal actions do not equilibrate.')
                nodes={};force=np.zeros(3);moment=correction.copy();deformed=np.zeros(3);external_scale=0.
                origin=next(iter(points.values()))
                for nid,node in native.nodes.items():
                    index=node.ID*6;flags=supports.get(nid,[False]*6)
                    reaction=np.array([residual[index+i] if flags[i] else 0. for i in range(6)])
                    external=load[index:index+6]+reaction
                    force+=external[:3];moment+=external[3:]+np.cross(points[nid]-origin,external[:3])
                    deformed+=external[3:]+np.cross(points[nid]+u[index:index+3]-origin,external[:3])
                    external_scale+=np.linalg.norm(external[:3])+np.linalg.norm(external[3:])/span
                    nodes[nid]=dict(translation_m=u[index:index+3].tolist(),rotation_rad=u[index+3:index+6].tolist(),
                        reaction_force_n=reaction[:3].tolist(),reaction_moment_nm=reaction[3:].tolist(),active_rotations=nid in frame_nodes,
                        nodal_residual=(assembled[index:index+6]-external).tolist())
                equilibrium=max(float(np.linalg.norm(force)),float(np.linalg.norm(moment))/span)/max(external_scale,1e-30)
                if equilibrium>1e-8:fail('EQUILIBRIUM_FAILURE','Initial-stress global force/moment identity failed.')
                if len(free):
                    scale=np.sqrt(np.diag(elastic)[free]);metric=np.outer(scale,scale)
                    ratios=eigh(geometric[np.ix_(free,free)]/metric,elastic[np.ix_(free,free)]/metric,eigvals_only=True)
                    negative=ratios[ratios<-128*np.finfo(float).eps*max(np.max(abs(ratios)),1e-300)]
                    limit=float(-1/negative[0]) if len(negative) else None
                else:limit=None
                results[name]=dict(combination_id=name,factors=combo['factors'],nodes=nodes,members=members,
                    reduced_equilibrium=audit,recovered_nodal_equilibrium=nodal,
                    equilibrium=dict(force_n=force.tolist(),initial_stress_moment_nm=moment.tolist(),relative_residual=equilibrium,
                        fully_deformed_moment_nm=deformed.tolist()),tangent_condition=condition,elastic_condition=elastic_condition,
                    proportional_initial_stress_critical_factor=limit,elastic_assembly_relative_error=assembly_error,
                    elastic_energy_j=float(u@elastic@u/2),geometric_energy_j=float(u@geometric@u/2))
    except AnalysisError:raise
    except Exception as exc:raise AnalysisError('NUMERICAL_FAILURE','Mixed initial-stress failed: '+type(exc).__name__) from exc
    return dict(schema_version='jpn.mixed-initial-stress-result/1',input_sha256=input_hash(raw),units='SI',status='CONDITIONAL',
        algorithm_version='jpn.mixed-initial-stress/1',solver=dict(elastic_library='PyNiteFEA',version='3.2.1',adapter='jpn.mixed-initial-stress/1'),method='two-stage-frozen-linear-axial-forces',first_order=linear,
        combinations=results,elapsed_seconds=time.perf_counter()-started,release_gate='BLOCKED',
        normative_second_order_verified=False,approved_for_fabrication=False,nonlinear_iteration_convergence_verified=False,
        mesh_convergence_verified=False,limitations=['Research CLI only; general structures require external executable and mesh validation.',
            'Bending Hermite + axial projector; no geometric torsion/warping, offsets, releases, distributed loads or imperfections.',
            'Frozen first-order axial forces; reduced equation convergence is not full nonlinear equilibrium or ABNT verification.'])
