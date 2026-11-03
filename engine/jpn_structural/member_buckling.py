"""Elastic Ue stability: NBR14762 9.7.2.1/2 global + cFSM modal spaces.

Restricted to explicitly declared fork/fork, free warping, unbraced prismatic
members in uniform compression. No arbitrary classification of curve minima.
Numerical refinement/search coverage are reported, never a certified bound.
"""
import math
import time
import warnings
from importlib.metadata import version
from .frame3d_model import obj,number,fail,input_hash


def global_compression(e,g,area,iy,iz,j,iw,shear_y,ly,lz,lw):
    """SI; section symmetric about JPN local y (NBR x). Stable root form."""
    for key,v in dict(e=e,g=g,area=area,iy=iy,iz=iz,j=j,ly=ly,lz=lz,lw=lw).items():number(v,1e-30,1e20,key)
    number(iw,0,1e20,'warping');number(shear_y,-1e6,1e6,'shear-center offset')
    nx=math.pi**2*e*iy/ly**2;ny=math.pi**2*e*iz/lz**2
    r02=(iy+iz)/area+shear_y**2
    nt=(g*j+math.pi**2*e*iw/lw**2)/r02
    # Same quadratic as 9.7.2.2, rationalized to avoid cancellation.
    coupled=2*nx*nt/(nx+nt+math.sqrt((nx-nt)**2+4*nx*nt*shear_y**2/r02))
    return dict(global_n=min(ny,coupled),flexure_y_n=nx,flexure_z_n=ny,torsion_n=nt,flexural_torsional_n=coupled,r0_squared_m2=r02,
                clauses=['9.7.2.1(a-c)','9.7.2.2'],axes='NBR x,y = JPN section local y,z')


def midline_u(g,arc,flat):
    """Five flats and four circular mid-surface bends; no visual dimensions."""
    import numpy as np
    h,b,c,t,ri=(g[k] for k in ('height','width','lip','wallThickness','insideRadius'));ro=ri+t;r=ri+t/2;p=[(b-t/2,c)]
    def line(y,z):
        a=p[-1];p.extend((a[0]+(y-a[0])*k/flat,a[1]+(z-a[1])*k/flat) for k in range(1,flat+1))
    def bend(y,z,start,end):p.extend((y+r*math.cos(start+(end-start)*k/arc),z+r*math.sin(start+(end-start)*k/arc)) for k in range(1,arc+1))
    line(b-t/2,ro);bend(b-ro,ro,0,-math.pi/2);line(ro,t/2);bend(ro,ro,-math.pi/2,-math.pi)
    line(t/2,h-ro);bend(ro,h-ro,math.pi,math.pi/2);line(b-ro,h-t/2);bend(b-ro,h-ro,math.pi/2,0);line(b-t/2,h-c)
    return np.array([[i,y,z,1,1,1,1,1.] for i,(y,z) in enumerate(p)],float),np.array([[i,i,i+1,t,0] for i in range(len(p)-1)],float)


def compute_member_buckling(model,section_result,design,poisson,geometry):
    obj(model,'boundary load_pattern intermediate_restraints length_m half_waves_max target','elastic member model')
    if model['boundary']!='fork-fork-free-warping' or model['load_pattern']!='uniform-compression' or model['intermediate_restraints']!='none':fail('UNSUPPORTED_BUCKLING_MODEL','Explicit unbraced S-S uniform compression only; no assumed restraints.')
    number(model['length_m'],1e-6,1e6,'physical length');length=model['length_m']
    if type(model['half_waves_max'])is not int or model['half_waves_max']!=64 or model['target']!=.001:fail('INVALID_INPUT','Audited search: 64 integer half waves, refinement target 0.001.')
    for key in ('effective_length_y_m','effective_length_z_m'):
        if not math.isclose(design['section'][key],length,rel_tol=128*2.220446049250313e-16,abs_tol=0):fail('BUCKLING_LENGTH_MISMATCH','For admitted fork/fork model effective lengths must equal physical length; no silent replacement.')
    if any(v is not None for v in design['critical'].values()):fail('INVALID_INPUT','Automatic mode calculation does not accept manually supplied critical values.')
    from .coldformed_design import roots,evaluate
    if len(design['fields'])!=1:fail('UNSUPPORTED_BUCKLING_MODEL','Initial automatic domain requires one physical span without intermediate connections; do not infer bracing from segmentation.')
    values=[]
    for f in design['fields']:
        for k,c in f['forces'].items():
            if c is None:continue
            sample=[evaluate(c,u) for u in [0.,1.,*roots(__import__('numpy').polynomial.polynomial.polyder(c))]]
            if k=='nN':values+=sample
            elif max(map(abs,sample))>128*2.220446049250313e-16*max(1.,max(map(abs,c))):fail('UNSUPPORTED_BUCKLING_MODEL','Only pure axial compression: bending/shear/torsion patterns need their own validated stability study.')
    if not values or max(values)>=0 or max(values)-min(values)>128*2.220446049250313e-16*max(1.,max(map(abs,values))):fail('UNSUPPORTED_BUCKLING_MODEL','Uniform compression over the original member required.')
    if not math.isclose(sum(f['length_m'] for f in design['fields']),length,rel_tol=1e-12,abs_tol=1e-10):fail('BUCKLING_LENGTH_MISMATCH','Fields and physical member length differ.')
    if (version('pycufsm'),version('numpy'),version('scipy'),version('sectionproperties'))!=('0.2.0','2.3.3','1.15.3','3.10.2'):fail('DEPENDENCY_VERSION','Use the isolated requirements-sections-fsm.lock; main solver dependencies are unchanged.')
    import numpy as np
    from pycufsm import fsm
    from pycufsm.pre import cutwp
    from pycufsm.solve import cfsm
    props=section_result['properties'];s=design['section'];E=s['e_pa'];G=E/(2*(1+poisson))
    global_=global_compression(E,G,props['areaMm2']*1e-6,props['iyMm4']*1e-12,props['izMm4']*1e-12,props['jMm4']*1e-12,props['warpingMm6']*1e-18,(props['shearCenterYMm']-props['centroidYMm'])*1e-3,length,length,length)
    history=[];started=time.perf_counter();waves=np.arange(1,65);lengths=length*1000/waves
    for arc,flat in [(2,6),(4,8),(8,12)]:
        nodes,edges=midline_u(geometry,arc,flat)
        with warnings.catch_warnings(record=True) as preparation_warnings:
            warnings.simplefilter('default',DeprecationWarning)
            sect=cutwp.prop2(nodes[:,1:3],edges[:,1:4])
            *_,nd,nl,permutation=cfsm.base_properties(nodes=nodes,elements=edges)
        for warning in preparation_warnings:
            if not issubclass(warning.category,DeprecationWarning) or 'Conversion of an array with ndim > 0 to a scalar' not in str(warning.message):fail('NUMERICAL_FAILURE','Unrecognized cFSM preparation warning: '+str(warning.message)[:200])
        if len(nodes)>96 or nd<=0 or nl<=0:fail('BUCKLING_MODEL_LIMIT','Modal model exceeds the audited 96-node resource domain or lacks required spaces.')
        families={}
        for family in ('local','distortional'):
            config=dict(glob=[0]*4,dist=[int(family=='distortional')]*int(nd),local=[int(family=='local')]*int(nl),other=[0]*(2*(len(nodes)-1)),o_space=1,couple=1,orth=1,norm=1)
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('default',DeprecationWarning)
                signature,_,_=fsm.strip(props=np.array([[0,E/1e6,E/1e6,poisson,poisson,G/1e6]]),nodes=nodes,elements=edges,lengths=lengths,springs=np.array([]),constraints=np.array([]),GBT_con=config,B_C='S-S',m_all=np.ones((64,1)),n_eigs=1,sect_props=sect)
            for warning in caught:
                if not issubclass(warning.category,DeprecationWarning) or 'Conversion of an array with ndim > 0 to a scalar' not in str(warning.message):fail('NUMERICAL_FAILURE','Unrecognized cFSM warning: '+str(warning.message)[:200])
            curve=[float(v) for v in signature]
            if any(not math.isfinite(v) or v<=0 for v in curve):fail('NUMERICAL_FAILURE','Nonpositive/nonfinite modal eigenvalue.')
            k=int(np.argmin(curve))
            if k in (0,63):fail('BUCKLING_SEARCH_INCOMPLETE','Mode minimum is at the wave search boundary; increase validated search domain rather than adopting an endpoint.')
            families[family]=dict(critical_stress_mpa=curve[k],half_wave_number=int(waves[k]),half_wavelength_mm=float(lengths[k]),modal_dimension=int(nl if family=='local' else nd),curve_mpa=curve)
        history.append(dict(nodes=len(nodes),arc_segments=arc,flat_segments=flat,midline_area_mm2=float(sect['A']),families=families))
    fine,coarse=history[-1],history[-2]
    changes={k:abs(fine['families'][k]['critical_stress_mpa']-coarse['families'][k]['critical_stress_mpa'])/fine['families'][k]['critical_stress_mpa'] for k in ('local','distortional')}
    if max(changes.values())>model['target']:fail('BUCKLING_NOT_CONVERGED','cFSM modal refinement target not met: '+str(changes)+'. No critical values admitted to MRD.')
    critical=dict(global_=global_['global_n'],local=fine['families']['local']['critical_stress_mpa']*props['areaMm2'],distortional=fine['families']['distortional']['critical_stress_mpa']*props['areaMm2'])
    return dict(schema_version='jpn.computed-member-buckling/1',method='NBR14762-global-and-constrained-FSM',library=dict(pycufsm='0.2.0',numpy='2.3.3',scipy='1.15.3',license='AFL-3.0'),model=model,model_sha256=input_hash(model),global_result=global_,compression_critical_n={'global':critical['global_'],'local':critical['local'],'distortional':critical['distortional']},refinements=history,relative_changes=changes,half_wave_numbers=waves.tolist(),elapsed_seconds=time.perf_counter()-started,
        search_coverage='all-integer-half-waves-1-through-64',error_bound_certified=False,full_member_approval=False)
