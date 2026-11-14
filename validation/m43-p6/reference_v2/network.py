"""Independent continuous extensible Kirchhoff network BVP.

No JPN, PyNite, discrete beam energy, Hermite or candidate AD imports.
Material frames are explicit physical bases, NOT an inferred C1 convention.
u in [0,1] per member; spatial force is constant, M'=-r' x F,
R'=R hat(D^-1 R.T M), r'=(1+F.dot(d1)/EA)d1 (physical S derivative).
Nodes impose compatible position/orientation and physical wrench equilibrium.
SciPy's independent 4th-order collocation solves the network simultaneously.
"""
import time
import numpy as np
from scipy.integrate import solve_bvp,simpson
from scipy.spatial.transform import Rotation

def benchmark_bases(model):
    """Explicit historical benchmark section orientation, audited separately
    against native element axes. Does NOT claim equivalence with future C1.
    Rows are global->local, local x along the oriented physical member.
    """
    points={n['id']:np.array([n[k] for k in ('x_m','y_m','z_m')]) for n in model['nodes']}
    out={}
    for m in model['members']:
        x=points[m['end']]-points[m['start']];x/=np.linalg.norm(x)
        if not any(np.array_equal(x,v) for v in np.eye(3)):raise ValueError('Explicit basis required beyond benchmark positive global axes')
        z=np.array([0.,0.,1.]) if x[1]==1 else np.cross(x,[0.,1.,0.]);z/=np.linalg.norm(z)
        y=np.cross(z,x);out[m['id']]=np.array([x,y,z]).tolist()
    return out

def solve(model,bases,tolerance=1e-10,initial_nodes=9,max_nodes=257):
    started=time.perf_counter()
    if model.get('member_loads') or model.get('self_weight') or len(model['combinations'])!=1:raise ValueError('Only declared dead nodal forces/moments in one combination')
    nodes=model['nodes'];members=model['members'];count=len(members)
    ids={n['id']:i for i,n in enumerate(nodes)}
    xyz=np.array([[n[k] for k in ('x_m','y_m','z_m')] for n in nodes])
    supports={s['node']:s['restrained'] for s in model['supports']}
    if any(any(v) and not all(v) for v in supports.values()):raise ValueError('Reference requires fully fixed or free physical nodes')
    free=[i for i,n in enumerate(nodes) if not all(supports.get(n['id'],[False]*6))]
    factors=model['combinations'][0]['factors'];loads=np.zeros((len(nodes),6))
    for l in model['nodal_loads']:
        loads[ids[l['node']]]+=factors.get(l['case'],0)*np.array([l[k] for k in ('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')])
    length_scale=max(float(np.ptp(xyz,axis=0).max()),1.)
    force_scale=max(float(np.max(abs(loads[:,:3]))),1.)
    moment_scale=force_scale*length_scale
    mats={m['id']:m for m in model['materials']};sections={s['id']:s for s in model['sections']}
    starts=[];ends=[];lengths=[];frames=[];ea=[];stiff=[]
    for m in members:
        if m['kind']!='frame' or m['rotation_deg'] or any(m['release_start']+m['release_end']):raise ValueError('Rigid unrolled prismatic reference domain')
        i,j=ids[m['start']],ids[m['end']];d=xyz[j]-xyz[i];L=np.linalg.norm(d)
        B=np.asarray(bases[m['id']],dtype=float).T
        if not np.allclose(B.T@B,np.eye(3),atol=1e-13,rtol=0) or np.linalg.det(B)<=0 or not np.allclose(B[:,0],d/L,atol=1e-13,rtol=0):raise ValueError('Invalid declared physical basis')
        mat,sec=mats[m['material']],sections[m['section']]
        starts.append(i);ends.append(j);lengths.append(L);frames.append(B)
        ea.append(mat['e_pa']*sec['area_m2']);stiff.append([mat['g_pa']*sec['j_m4'],mat['e_pa']*sec['iy_m4'],mat['e_pa']*sec['iz_m4']])
    starts,ends=np.array(starts),np.array(ends);L=np.array(lengths);B=np.array(frames);EA=np.array(ea);D=np.array(stiff)
    def fields(y):
        z=y.reshape(count,13,-1);theta=z[:,3:6,:].transpose(0,2,1)
        Q=Rotation.from_rotvec(theta.reshape(-1,3)).as_matrix().reshape(count,-1,3,3)
        R=np.einsum('mnij,mjk->mnik',Q,B);t=R[:,:,:,0]
        F=z[:,6:9,:].transpose(0,2,1)*force_scale;M=z[:,9:12,:].transpose(0,2,1)*moment_scale
        local=np.einsum('mnji,mnj->mni',R,M);kappa=local/D[:,None,:]
        return z,theta,R,t,F,M,local,kappa
    def ode(u,y,p):
        z,theta,R,t,F,M,local,kappa=fields(y)
        n=np.sum(F*t,axis=2);tangent=(1+n/EA[:,None])[:,:,None]*t
        omega=np.einsum('mnij,mnj->mni',R,kappa)
        angle2=np.sum(theta*theta,axis=2);c=np.empty_like(angle2);small=angle2<1e-4
        c[small]=1/12+angle2[small]/720+angle2[small]**2/30240+angle2[small]**3/1209600
        a=np.sqrt(angle2[~small]);c[~small]=1/a**2-(1+np.cos(a))/(2*a*np.sin(a))
        theta_prime=omega-.5*np.cross(theta,omega)+c[:,:,None]*np.cross(theta,np.cross(theta,omega))
        out=np.zeros_like(z)
        out[:,:3,:]=(L[:,None,None]/length_scale*(tangent-B[:,None,:,0])).transpose(0,2,1)
        out[:,3:6,:]=(L[:,None,None]*theta_prime).transpose(0,2,1)
        out[:,9:12,:]=(-L[:,None,None]/moment_scale*np.cross(tangent,F)).transpose(0,2,1)
        out[:,12,:]=L[:,None]/(force_scale*length_scale)*.5*(n*n/EA[:,None]+np.sum(local*kappa,axis=2))
        return out.reshape(count*13,-1)
    def boundary(ya,yb,p):
        pose=np.zeros((len(nodes),6));pose[free]=p.reshape(-1,6)
        a,b=ya.reshape(count,13),yb.reshape(count,13)
        wrench=np.zeros_like(loads)
        np.add.at(wrench,starts,-a[:,6:12]);np.add.at(wrench,ends,b[:,6:12])
        normalized=loads/np.array([force_scale]*3+[moment_scale]*3)
        return np.r_[(a[:,:6]-pose[starts]).ravel(),(b[:,:6]-pose[ends]).ravel(),a[:,12],(wrench-normalized)[free].ravel()]
    result=solve_bvp(ode,boundary,np.linspace(0,1,initial_nodes),np.zeros((count*13,initial_nodes)),
                     p=np.zeros(6*len(free)),tol=tolerance,bc_tol=min(tolerance,1e-13),max_nodes=max_nodes)
    if not result.success:raise RuntimeError('Independent network BVP refused: '+result.message)
    # Quantify the unrepresented nonuniform axial strain of an assumed-mean
    # element. This is a diagnostic, never an energy/force correction.
    grid=np.linspace(0,1,513)
    _,_,_,director,force,_,_,_=fields(result.sol(grid))
    axial=np.sum(director*force,axis=2)
    mean=simpson(axial,x=grid,axis=1)
    variance=simpson((axial-mean[:,None])**2,x=grid,axis=1)
    axial_study={m['id']:dict(minimum_axial_force_n=float(axial[i].min()),maximum_axial_force_n=float(axial[i].max()),
        mean_axial_force_n=float(mean[i]),strain_variance_energy_j=float(.5*L[i]/EA[i]*variance[i])) for i,m in enumerate(members)}
    pose=np.zeros((len(nodes),6));pose[free]=result.p.reshape(-1,6);pose[:,:3]*=length_scale
    a=result.y[:,0].reshape(count,13);b=result.y[:,-1].reshape(count,13)
    scale=np.array([force_scale]*3+[moment_scale]*3)
    actions=np.concatenate([-a[:,6:12]*scale,b[:,6:12]*scale],axis=1)
    assembled=np.zeros_like(loads);np.add.at(assembled,starts,actions[:,:6]);np.add.at(assembled,ends,actions[:,6:])
    reactions=assembled-loads;fixed=np.ones(len(nodes),dtype=bool);fixed[free]=False
    # Preserve free residuals separately, never turn them into support reactions.
    free_residual=reactions[free].copy();reactions[free]=0
    current=xyz+pose[:,:3];origin=xyz[0]
    fsum=np.sum(loads[:,:3]+reactions[:,:3],axis=0)
    msum=np.sum(np.cross(current-origin,loads[:,:3]+reactions[:,:3])+loads[:,3:]+reactions[:,3:],axis=0)
    fs=1+np.sum(abs(loads[:,:3]),axis=0);ms=1+np.sum(abs(np.cross(current-origin,loads[:,:3]))+abs(loads[:,3:]),axis=0)
    eq=dict(force_residual_n=fsum.tolist(),moment_residual_nm=msum.tolist(),force_relative_residual=(abs(fsum)/fs).tolist(),moment_relative_residual=(abs(msum)/ms).tolist(),accepted=bool(max(np.max(abs(fsum)/fs),np.max(abs(msum)/ms))<=1e-8))
    answers={n['id']:dict(translation_m=pose[i,:3].tolist(),orientation_matrix=Rotation.from_rotvec(pose[i,3:]).as_matrix().tolist(),reaction_force_n=reactions[i,:3].tolist(),reaction_moment_nm=reactions[i,3:].tolist()) for i,n in enumerate(nodes)}
    return dict(schema_version='jpn.p6-continuous-kirchhoff-network/1',nodes=answers,physical_end_actions=actions.tolist(),
        strain_energy_j=float(np.sum(b[:,12])*force_scale*length_scale),physical_support_equilibrium=eq,
        free_wrench_residual=free_residual.tolist(),mesh_points=len(result.x),iterations=result.niter,
        maximum_collocation_residual=float(np.max(result.rms_residuals)),boundary_residual_max=float(np.max(abs(boundary(result.y[:,0],result.y[:,-1],result.p)))),
        requested_tolerance=tolerance,bases_global_to_local=bases,elapsed_seconds=time.perf_counter()-started,
        nonuniform_axial_strain_diagnostic=axial_study,
        computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')
