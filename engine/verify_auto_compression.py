"""Real mixed model -> automatic elastic member modes -> MRD control.

Synthetic guided axial column, 2 m, plus an unloaded cantilever sharing its
fixed support. All guides and S-S/free-warping member assumptions are explicit.
This does not validate global second-order behaviour or any building.
"""
import argparse
import copy
import json
import math
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from jpn_structural.section_analysis import analyze_section
from jpn_structural.mixed3d import analyze_mixed3d
from jpn_structural.frame3d_model import input_hash


def requests():
    root=Path(__file__).resolve().parent
    template=json.loads((root/'examples/coldformed-auto-compression.json').read_text(encoding='utf-8'))
    section=analyze_section(template['geometry_analysis']);p=section['properties']
    physical=dict(area_m2=p['areaMm2']*1e-6,iy_m4=p['iyMm4']*1e-12,iz_m4=p['izMm4']*1e-12,wy_m3=min(p['wyPositiveMm3'],p['wyNegativeMm3'])*1e-9,wz_m3=min(p['wzPositiveMm3'],p['wzNegativeMm3'])*1e-9,j_m4=p['jMm4']*1e-12)
    E=200e9;source='Explicit synthetic guided-column control; not a commercial roof or approved connection';rows=[]
    for load in (1000.,200000.):
        raw=copy.deepcopy(template);d=raw['design'];rounded={k:float(format(v,'.6g')) for k,v in physical.items()}
        d['section'].update({k:v for k,v in rounded.items() if k!='j_m4'});raw['solver_j_m4']=rounded['j_m4']
        raw['property_resolutions']={k:10**(math.floor(math.log10(v))-5) for k,v in physical.items()}
        model=dict(schema_version='jpn.mixed3d/1',units='SI',theory='linear-elastic-frame-axial',project=dict(id='AUTO-CFSM-COLUMN',revision='1',source=source),
          nodes=[dict(id='A',x_m=0,y_m=0,z_m=0),dict(id='B',x_m=0,y_m=0,z_m=2),dict(id='D',x_m=2,y_m=0,z_m=0)],
          materials=[dict(id='M',e_pa=E,g_pa=E/2.6,nu=.3,source=source,revision='1')],sections=[dict(id='S',area_m2=.01,iy_m4=1e-5,iz_m4=1e-5,j_m4=1e-5,source='Synthetic unloaded cantilever only',revision='1')],
          members=[dict(id='FRAME',kind='frame',start='A',end='D',material='M',section='S',rotation_deg=0,release_start=[False]*6,release_end=[False]*6),dict(id='COLUMN',kind='axial',start='A',end='B',e_pa=E,area_m2=rounded['area_m2'],source=source,revision='1')],
          supports=[dict(node='A',restrained=[True]*6),dict(node='B',restrained=[True,True,False,False,False,False])],cases=[dict(id='P',source=source)],combinations=[dict(id='ULS-CONTROL',factors=dict(P=1))],nodal_loads=[dict(node='B',case='P',fx_n=0,fy_n=0,fz_n=-load,mx_nm=0,my_nm=0,mz_nm=0)])
        result=analyze_mixed3d(model);r=result['combinations']['ULS-CONTROL'];normal=r['members']['COLUMN']['axial_n']
        displacement=-load*2/(E*rounded['area_m2'])
        if not math.isclose(normal,-load,rel_tol=1e-12) or not math.isclose(r['nodes']['B']['translation_m'][2],displacement,rel_tol=1e-12) or not math.isclose(r['nodes']['A']['reaction_force_n'][2],load,rel_tol=1e-12):raise AssertionError('Independent N=-P, u=-PL/EA or R=P failed')
        d.update(piece_id='COLUMN',combination_id='ULS-CONTROL');d['fields']=[dict(segment_id='COLUMN',offset_m=0,length_m=2,forces=dict(nN=[normal],vyN=None,vzN=None,tNm=None,myNm=None,mzNm=None))]
        basis=input_hash(dict(model=model,section_request=raw['geometry_analysis'],stability_model=raw['stability_model'],fy_pa=d['section']['fy_pa'],fu_pa=d['section']['fu_pa']))
        d['study']['basis_sha256']=basis;d['binding']=dict(mechanical_sha256=basis,analysis_input_sha256=input_hash(model),analysis_result_sha256=input_hash(result))
        rows.append(dict(load_n=load,solver_input=model,solver_result=result,design_input=raw,independent=dict(axial_n=-load,tip_z_m=displacement,reaction_z_n=load)))
    return rows


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--member-python',default=os.environ.get('JPN_SECTION_FSM_PYTHON_EXECUTABLE'));parser.add_argument('--output',type=Path,required=True);parser.add_argument('--requests-only',action='store_true');args=parser.parse_args()
    rows=requests()
    if not args.requests_only:
        if not args.member_python:parser.error('Explicit combined profile Python required')
        for row in rows:
            p=subprocess.run([args.member_python,'-I','-X','utf8',str(Path(__file__).parent/'section_worker.py')],input=json.dumps(row['design_input']).encode(),capture_output=True,timeout=20,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
            out=json.loads(p.stdout)
            if p.returncode or out.get('status')!='completed':raise AssertionError(out)
            row['design_result']=out['result'];c=next(c for c in out['result']['checks'] if c['id']=='compression')
            expected='CONDITIONAL' if row['load_n']==1000 else 'FAIL'
            if c['status']!=expected:raise AssertionError('Incorrect MRD comparison')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(dict(schema_version='jpn.automatic-compression-evidence/1',cases=rows),ensure_ascii=True,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps([dict(load_n=r['load_n'],axial_n=r['independent']['axial_n'],status=r.get('design_result',{}).get('status','request-generated')) for r in rows]))


if __name__=='__main__':main()
