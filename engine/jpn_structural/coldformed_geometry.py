"""Physical-geometry admission gate for the HTTP/worker resistance path."""
import copy
import math
from .frame3d_model import obj, number, input_hash, fail
from .section_analysis import analyze_section
from .coldformed_design import analyze_coldformed_design
from .coldformed_connection import audit_member_connection


def analyze_verified_coldformed(raw):
    obj(raw,'schema_version geometry_analysis solver_j_m4 property_resolutions design'+(' connection_context' if 'connection_context'in raw else '')+(' stability_model' if 'stability_model'in raw else ''),'verified member design')
    if raw['schema_version']!='jpn.verified-coldformed/1':fail('UNSUPPORTED_MODEL','Verified physical section request required.')
    connection_audit=audit_member_connection(raw.get('connection_context'),raw['design']['piece_id'],raw['design']['tension'])
    geometry=analyze_section(raw['geometry_analysis'])
    if raw['geometry_analysis']['geometry']['shape']!='u-stiffened':fail('UNSUPPORTED_FAMILY','Physical Ue required.')
    if geometry['convergence']['status']!='observed':fail('SECTION_NOT_CONVERGED','Section refinement target not achieved; resistance execution blocked.')
    p=geometry['properties'];s=raw['design']['section']
    actual=dict(area_m2=p['areaMm2']*1e-6,iy_m4=p['iyMm4']*1e-12,iz_m4=p['izMm4']*1e-12,
                wy_m3=min(p['wyPositiveMm3'],p['wyNegativeMm3'])*1e-9,
                wz_m3=min(p['wzPositiveMm3'],p['wzNegativeMm3'])*1e-9,j_m4=p['jMm4']*1e-12)
    obj(raw['property_resolutions'],' '.join(actual),'property resolutions')
    differences={}
    for key,value in actual.items():
        supplied=raw['solver_j_m4'] if key=='j_m4' else s[key]
        number(supplied,1e-30,1e20,key)
        resolution=raw['property_resolutions'][key]
        number(resolution,0,1e20,key+' resolution')
        if resolution>=2*supplied:fail('INVALID_INPUT','Property resolution interval must remain positive.')
        # Only explicit reporting quantization at six or more significant
        # digits is admissible, not a user-selected engineering tolerance.
        finest_six=10**(math.floor(math.log10(supplied))-5)
        if resolution>finest_six+128*math.ulp(finest_six):
            fail('INVALID_INPUT','Property resolution must retain at least six significant digits.')
        roundoff=128*math.ulp(max(abs(supplied),abs(value)))
        differences[key]=dict(declared=supplied,computed=value,resolution=resolution,absolute_difference=abs(supplied-value))
        if abs(supplied-value)>resolution/2+roundoff:
            fail('PHYSICAL_PROPERTY_MISMATCH',f'{key}: section geometry gives {value}; declared/solver value {supplied}. Review the physical section, not the drawing.')
    g=raw['geometry_analysis']['geometry'];web=raw['design']['web']
    for key,value in dict(flat_height_m=(g['height']-2*(g['insideRadius']+g['wallThickness']))/1000,thickness_m=g['wallThickness']/1000).items():
        if not math.isclose(web[key],value,rel_tol=128*2.220446049250313e-16,abs_tol=0):fail('PHYSICAL_PROPERTY_MISMATCH','Web dimensions differ from the physical Ue.')
    normalized=copy.deepcopy(raw['design'])
    normalized['section'].update({k:v for k,v in actual.items() if k!='j_m4'})
    buckling=None
    if normalized['study']['minimum_search']=='computed-cfsm-ss':
        from .member_buckling import compute_member_buckling
        analyze_coldformed_design(normalized)  # strict preflight before eigen-analysis
        if 'stability_model' not in raw:fail('INVALID_INPUT','Explicit member boundary/load model required.')
        buckling=compute_member_buckling(raw['stability_model'],geometry,normalized,raw['geometry_analysis']['poisson'],g)
        normalized['critical']['compression']=buckling['compression_critical_n']
    elif 'stability_model' in raw:fail('INVALID_INPUT','Stability model requires automatic cFSM study type.')
    result=analyze_coldformed_design(normalized,_computed_modes=('compression',) if buckling else ())
    result['calculation_input_sha256']=result['input_sha256']
    result['input_sha256']=input_hash(raw)
    result['connection_audit']=connection_audit
    if buckling:result['buckling_audit']=buckling
    result['geometry_audit']=dict(library=geometry['library'],geometry_input_sha256=geometry['input_sha256'],
        differences=differences,refinement=geometry['convergence'],computed_properties=actual,
        note='Gross section computed, effective properties and elastic critical mode classification are separate.')
    return result
