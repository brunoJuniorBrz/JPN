"""Traceable gross-section analysis using sectionproperties, not ABNT resistance.

Library coordinates x,y map to JPN section-local y,z respectively. Geometric
normalization E=1 is mathematical, never a declaration of physical steel E/fy.
"""
import math
import time
from importlib.metadata import version

from .frame3d_model import obj,number,text,input_hash,fail


def analyze_section(raw):
    obj(raw,'schema_version units geometry poisson source revision responsible convergence','section request')
    if raw['schema_version']!='jpn.section-analysis/1' or raw['units']!='mm':
        fail('UNSUPPORTED_MODEL','Section analysis expects explicit physical dimensions in mm.')
    for k in ('source','revision','responsible'):text(raw[k],k)
    number(raw['poisson'],-.99,.499,'poisson')
    number(raw['convergence'],1e-5,.01,'convergence')
    g=raw['geometry']
    if type(g)is not dict:fail('INVALID_INPUT','Physical section must be an explicit object.')
    shape=g.get('shape')
    fields={'u-stiffened':'shape height width wallThickness lip insideRadius','i':'shape height width webThickness flangeThickness insideRadius','rectangle':'shape height width'}
    if shape not in fields:fail('UNSUPPORTED_MODEL','Supported geometric sections: physical Ue, I and rectangle reference.')
    obj(g,fields[shape],'physical section')
    for key in fields[shape].split()[1:]:number(g[key],0 if key=='insideRadius' else .01,2000,key)
    h,b=g['height'],g['width']
    if shape=='u-stiffened':
        t,r,c=g['wallThickness'],g['insideRadius'],g['lip'];ro=r+t
        if h<=2*ro or b<=2*ro or c<=ro or 2*c>=h or c>=b:fail('INVALID_GEOMETRY','Degenerate Ue flats/bends/lips.')
    elif shape=='i':
        t=min(g['webThickness'],g['flangeThickness']);r=g['insideRadius']
        if h<=2*g['flangeThickness']+2*r or b<=g['webThickness']+2*r:fail('INVALID_GEOMETRY','I-section dimensions/fillets inconsistent.')
    else:t=min(h,b)
    if version('sectionproperties')!='3.10.2':fail('DEPENDENCY_VERSION','sectionproperties 3.10.2 required.')
    from sectionproperties.pre import Material
    from sectionproperties.pre.library import cee_section,i_section,rectangular_section
    from sectionproperties.analysis import Section
    # Library geometric analysis also computes internal yield indices. Unit
    # strength avoids division by zero; those indices are NEVER exported/used.
    material=Material('geometric E/yield normalization, not physical steel',1.,raw['poisson'],1.,0.,'grey')
    started=time.perf_counter();history=[]
    factors=(.25,.0625,.015625,.00390625,.0009765625) if shape=='rectangle' else (4.,1.,.25,.0625,.015625)
    changes={}
    for factor in factors:
        if shape=='u-stiffened':geom=cee_section(d=h,b=b,l=c,t=t,r_out=ro,n_r=64,material=material)
        elif shape=='i':geom=i_section(d=h,b=b,t_f=g['flangeThickness'],t_w=g['webThickness'],r=r,n_r=64,material=material)
        else:geom=rectangular_section(d=h,b=b,material=material)
        mesh_area=t*t*factor
        # Resource bound, not a span/section design limit. Refuse before mesh.
        if geom.geom.area/mesh_area>8000:
            if len(history)>=3:break
            fail('MESH_LIMIT','Requested refinement exceeds resource domain; no properties approved.')
        geom.create_mesh(mesh_sizes=[mesh_area]);s=Section(geometry=geom)
        if len(s.mesh_nodes)>40000:fail('MESH_LIMIT','Mesh exceeds 40000 nodes.')
        s.calculate_geometric_properties();s.calculate_warping_properties()
        iy,iz,iyz=map(float,s.get_eic(e_ref=1.));z=s.get_ez(e_ref=1.);area=float(s.get_area())
        cy,cz=map(float,s.get_c());scy,scz=map(float,s.get_sc())
        values=dict(areaMm2=area,centroidYMm=cy,centroidZMm=cz,iyMm4=iy,izMm4=iz,iyzMm4=iyz,
            jMm4=float(s.get_ej(e_ref=1.)),warpingMm6=float(s.get_egamma(e_ref=1.)),
            shearCenterYMm=scy,shearCenterZMm=scz,wyPositiveMm3=float(z[0]),wyNegativeMm3=float(z[1]),wzPositiveMm3=float(z[2]),wzNegativeMm3=float(z[3]),
            radiusYMm=math.sqrt(iy/area),radiusZMm=math.sqrt(iz/area))
        if not all(math.isfinite(v) for v in values.values()) or min(area,iy,iz,values['jMm4'])<=0:fail('NUMERICAL_FAILURE','Nonfinite/degenerate section properties.')
        history.append(dict(meshAreaMm2=mesh_area,nodes=len(s.mesh_nodes),properties=values))
        if len(history)>=3:
            coarse,fine=history[-2]['properties'],history[-1]['properties'];span=max(h,b)
            # Refinement estimate, never a certified bound. Do not relax the
            # requested target when three meshes happen to be insufficient.
            changes={k:abs(fine[k]-coarse[k])/max(abs(fine[k]),{'jMm4':t**4,'warpingMm6':t**6,'shearCenterYMm':span,'shearCenterZMm':span}[k]) for k in ('jMm4','warpingMm6','shearCenterYMm','shearCenterZMm')}
            if max(changes.values())<=raw['convergence']:break
    fine=history[-1]['properties']
    return dict(schema_version='jpn.section-analysis-result/2',units='mm',input_sha256=input_hash(raw),
        source=dict(source=raw['source'],revision=raw['revision'],responsible=raw['responsible']),
        library=dict(name='sectionproperties',version=version('sectionproperties'),license='MIT'),
        axes='library x,y → JPN local y,z; bottom-left section origin',properties=fine,refinements=history,
        convergence=dict(status='observed' if max(changes.values())<=raw['convergence'] else 'not-converged',relativeChanges=changes,target=raw['convergence'],boundaryArcPoints=64,errorBoundCertified=False),
        elapsed_seconds=time.perf_counter()-started,normativeResistanceVerified=False,effectivePropertiesComputed=False,approvedForFabrication=False)
