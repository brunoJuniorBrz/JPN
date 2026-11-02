"""Reproducible physical Ue -> real mixed FE -> NBR14762 tension control.

Synthetic beam and vertical tie, all hypotheses explicit. It does NOT certify
the frame, tie connection, global stability, actions or a building design.
Run in the pinned sections profile; optional --output writes traceable JSON.
"""
import argparse
import copy
import json
import math
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from jpn_structural.section_analysis import analyze_section
from jpn_structural.mixed3d import analyze_mixed3d
from jpn_structural.coldformed_geometry import analyze_verified_coldformed
from jpn_structural.frame3d_model import input_hash


def verify():
    source='Synthetic analytical beam/tie; not a commercial profile or building'
    geometry=dict(schema_version='jpn.section-analysis/1',units='mm',geometry=dict(shape='u-stiffened',height=100,width=50,lip=15,wallThickness=2,insideRadius=3),poisson=.3,source=source,revision='1',responsible='Independent numerical control',convergence=.001)
    section=analyze_section(geometry);p=section['properties']
    measured=dict(area_m2=p['areaMm2']*1e-6,iy_m4=p['iyMm4']*1e-12,iz_m4=p['izMm4']*1e-12,wy_m3=min(p['wyPositiveMm3'],p['wyNegativeMm3'])*1e-9,wz_m3=min(p['wzPositiveMm3'],p['wzNegativeMm3'])*1e-9,j_m4=p['jMm4']*1e-12)
    reported={k:float(format(v,'.6g')) for k,v in measured.items()}
    resolutions={k:10**(math.floor(math.log10(v))-5) for k,v in measured.items()}
    e=200e9
    model=dict(schema_version='jpn.mixed3d/1',units='SI',theory='linear-elastic-frame-axial',project=dict(id='UE-TENSION-CONTROL',revision='1',source=source),
      nodes=[dict(id='A',x_m=0,y_m=0,z_m=0),dict(id='B',x_m=2,y_m=0,z_m=0),dict(id='C',x_m=2,y_m=0,z_m=1)],
      materials=[dict(id='M',e_pa=e,g_pa=e/2.6,nu=.3,source=source,revision='1')],
      sections=[dict(id='S',area_m2=.01,iy_m4=1e-5,iz_m4=1e-5,j_m4=1e-5,source='Independent synthetic BEAM section; not the Ue tie',revision='1')],
      members=[dict(id='BEAM',kind='frame',start='A',end='B',material='M',section='S',rotation_deg=0,release_start=[False]*6,release_end=[False]*6),dict(id='TIE',kind='axial',start='B',end='C',e_pa=e,area_m2=reported['area_m2'],source=source,revision='1')],
      supports=[dict(node='A',restrained=[True]*6),dict(node='C',restrained=[True,True,True,False,False,False])],
      cases=[dict(id='L',source='Explicit nodal force; synthetic ULS with factor 1, not normative action selection')],
      combinations=[dict(id='ULS-TEST',factors=dict(L=1))],nodal_loads=[dict(node='B',case='L',fx_n=0,fy_n=0,fz_n=-1000,mx_nm=0,my_nm=0,mz_nm=0)])
    rows=[]
    for load in (1000.,200000.):
        current=copy.deepcopy(model);current['nodal_loads'][0]['fz_n']=-load
        result=analyze_mixed3d(current);response=result['combinations']['ULS-TEST'];force=response['members']['TIE']['axial_n']
        kb=3*e*1e-5/2**3;kt=e*reported['area_m2']/1
        independent_force=load*kt/(kb+kt);independent_displacement=-load/(kb+kt)
        if not math.isclose(force,independent_force,rel_tol=1e-10):raise AssertionError('Axial force differs from independent parallel-stiffness solution')
        basis=input_hash(dict(model=current,geometry=geometry,fy_pa=250e6,fu_pa=400e6))
        design=dict(schema_version='jpn.coldformed-design/1',units='SI',piece_id='TIE',combination_id='ULS-TEST',
          binding=dict(mechanical_sha256=basis,analysis_input_sha256=input_hash(current),analysis_result_sha256=input_hash(result)),
          section=dict(family='cold-formed',shape='u-stiffened',**{k:v for k,v in reported.items() if k!='j_m4'},fy_pa=250e6,fu_pa=400e6,e_pa=e,effective_length_y_m=1,effective_length_z_m=1,source=source,revision='1'),
          study=dict(source=source,revision='1',responsible='Independent control',basis_sha256=basis,boundary_and_load_pattern='Pure bilateral axial tie, concentric N constant; no shear, torsion or flexure represented',minimum_search='not-required-pure-tension'),
          critical={k:None for k in ('compression','my_positive','my_negative','mz_positive','mz_negative')},
          tension=dict(basis='full-section-all-elements-welded',source='Explicit hypothesis: hole-free, no cutouts; all section elements connected by longitudinal/transverse welds. Weld capacity remains unverified.',revision='1'),
          web=dict(flat_height_m=.09,thickness_m=.002,unstiffened_single_web=False),
          fields=[dict(segment_id='TIE',offset_m=0,length_m=1,forces=dict(nN=[force],vyN=None,vzN=None,tNm=None,myNm=None,mzNm=None))])
        request=dict(schema_version='jpn.verified-coldformed/1',geometry_analysis=geometry,solver_j_m4=reported['j_m4'],property_resolutions=resolutions,design=design)
        checked=analyze_verified_coldformed(request);check=next(c for c in checked['checks'] if c['id']=='tension')
        independent_capacity=checked['geometry_audit']['computed_properties']['area_m2']*250e6/1.1
        if not math.isclose(check['resistance'],independent_capacity,rel_tol=1e-12):raise AssertionError('Tension resistance differs from independent gross-yield solution')
        if check['status']!=('PASS' if load==1000 else 'FAIL'):raise AssertionError('Incorrect resistance verdict')
        rows.append(dict(load_n=load,solver_input=current,solver_result=result,design_input=request,design_result=checked,
          independent=dict(k_beam_n_m=kb,k_tie_n_m=kt,axial_n=independent_force,tip_z_m=independent_displacement,tension_resistance_n=independent_capacity)))
    return dict(schema_version='jpn.coldformed-chain-evidence/1',status='passed',section=section,cases=rows,
      limitations=['Synthetic actions and connections, no global or member-complete approval','NBR14762:2010 9.6.2 tension only in this integrated control; all-elements-welded/no-hole hypothesis explicitly declared'])


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
    evidence=verify();payload=json.dumps(evidence,ensure_ascii=True,indent=2,allow_nan=False)
    if args.output:args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(payload,encoding='utf-8')
    else:print(payload)
