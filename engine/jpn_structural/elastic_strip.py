"""Optional pyCUFSM profile: elastic eigenvalues of declared stress fields.

No ABNT resistance, strength reduction, mode labeling or global roof approval.
An explicit wavelength grid does not prove a continuous minimum in wavelength.
"""
import math
import warnings
from importlib.metadata import version
from .frame3d_model import obj,number,text,input_hash,fail


def analyze_elastic_strip(raw):
    obj(raw,'schema_version units nodes strips material halfWavelengthsMm boundary source revision responsible','strip model')
    if raw['schema_version']!='jpn.elastic-strip/1' or raw['units']!='mm-MPa' or raw['boundary']!='S-S':fail('UNSUPPORTED_MODEL','Only explicit S-S finite-strip stress patterns in mm/MPa.')
    for k in ('source','revision','responsible'):text(raw[k],k)
    nodes,edges,lengths=raw['nodes'],raw['strips'],raw['halfWavelengthsMm']
    if type(nodes)is not list or not 2<=len(nodes)<=60 or type(edges)is not list or not 1<=len(edges)<=60 or type(lengths)is not list or not 1<=len(lengths)<=120:fail('INPUT_LIMIT','Finite-strip domain: 60 nodes/strips and 120 wavelengths.')
    for n in nodes:
        obj(n,'yMm zMm dofs stressMpa','section node')
        for k in ('yMm','zMm','stressMpa'):number(n[k],-1e6,1e6,k)
        if type(n['dofs'])is not list or len(n['dofs'])!=4 or any(type(x)is not bool for x in n['dofs']):fail('INVALID_INPUT','Four explicit section-node DOFs required.')
    if len({(n['yMm'],n['zMm']) for n in nodes})!=len(nodes) or not any(n['stressMpa']>0 for n in nodes):fail('INVALID_GEOMETRY','Unique coordinates and a declared compressive stress region required.')
    adjacency={i:set() for i in range(len(nodes))};seen=set()
    for e in edges:
        obj(e,'start end thicknessMm','strip')
        a,b=e['start'],e['end']
        if type(a)is not int or type(b)is not int or a==b or a not in adjacency or b not in adjacency or tuple(sorted((a,b))) in seen:fail('INVALID_GEOMETRY','Strip connectivity invalid/duplicated.')
        number(e['thicknessMm'],.001,1000,'thickness')
        seen.add(tuple(sorted((a,b))));adjacency[a].add(b);adjacency[b].add(a)
    visited={0};queue=[0]
    while queue:
        for v in adjacency[queue.pop()]-visited:visited.add(v);queue.append(v)
    if len(visited)!=len(nodes):fail('DISCONNECTED_MODEL','Disconnected section strips.')
    for L in lengths:number(L,.001,1e6,'half wavelength')
    if len(set(lengths))!=len(lengths):fail('DUPLICATE_ID','Duplicate wavelengths.')
    obj(raw['material'],'eMpa nu source revision','material');mat=raw['material'];number(mat['eMpa'],1,1e7,'E');number(mat['nu'],-.99,.499,'nu')
    text(mat['source'],'material source');text(mat['revision'],'material revision')
    # Upstream 0.2.0 uses scalar conversion deprecated in numpy 1.25 and removed
    # in 2.4. Isolate the known compatible numerical profile, never downgrade
    # the main JPN/PyNite environment or monkey-patch numpy globally.
    if (version('pycufsm'),version('numpy'),version('scipy'))!=('0.2.0','2.2.6','1.15.3'):fail('DEPENDENCY_VERSION','Use the isolated requirements-fsm.lock profile.')
    import numpy as np
    from pycufsm import fsm
    from pycufsm.pre import cutwp
    n=np.array([[i,x['yMm'],x['zMm'],*[int(v) for v in x['dofs']],x['stressMpa']] for i,x in enumerate(nodes)],dtype=float)
    e=np.array([[i,x['start'],x['end'],x['thicknessMm'],0] for i,x in enumerate(edges)],dtype=float)
    E,nu=mat['eMpa'],mat['nu'];props=np.array([[0,E,E,nu,nu,E/(2*(1+nu))]])
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('default',DeprecationWarning)
        section=cutwp.prop2(n[:,1:3],e[:,1:4])
        signature,_,_=fsm.strip(props=props,nodes=n,elements=e,lengths=np.array(lengths),springs=np.array([]),constraints=np.array([]),GBT_con=dict(glob=[0],dist=[0],local=[0],other=[0],o_space=1,couple=1,orth=2,norm=0),B_C='S-S',m_all=np.ones((len(lengths),1)),n_eigs=1,sect_props=section)
    known=[]
    for warning in caught:
        message=str(warning.message)
        if not issubclass(warning.category,DeprecationWarning) or 'Conversion of an array with ndim > 0 to a scalar' not in message:fail('NUMERICAL_FAILURE','Unrecognized library warning: '+message[:200])
        known.append(message)
    values=[float(x) for x in signature]
    if any(not math.isfinite(x) or x<=0 for x in values):fail('NUMERICAL_FAILURE','No finite positive elastic eigenvalue.')
    return dict(schema_version='jpn.elastic-strip-result/1',input_sha256=input_hash(raw),library=dict(name='pyCUFSM',version='0.2.0',installedArtifactLicense='AFL-3.0',repositoryHeadLicense='LGPL-3.0'),
        units='mm-MPa',results=[dict(halfWavelengthMm=L,loadFactor=value) for L,value in zip(lengths,values)],
        thinWallAreaMm2=float(section['A']),modeClassification='not-validated',wavelengthCoverage='sampled-explicit-grid',
        compatibilityWarnings=sorted(set(known)),normativeResistanceVerified=False,approvedForFabrication=False)
