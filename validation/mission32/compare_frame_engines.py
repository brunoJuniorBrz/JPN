"""Execute real Stabileo and Frame3DD for equivalent beam-column bending.

No copied solver kernels. Inputs and unedited numerical outputs are retained.
Stabileo uses MPa, m, kN; Frame3DD here uses N, mm. No shear, releases,
warping, eccentricity, distributed loads or torque are present in this test.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
from jpn_structural.frame_pdelta import analyze_frame_pdelta


def stabileo_input(data):
    ids={n['id']:i+1 for i,n in enumerate(data['nodes'])}
    matids={m['id']:i+1 for i,m in enumerate(data['materials'])}
    secids={s['id']:i+1 for i,s in enumerate(data['sections'])}
    result = dict(nodes={str(ids[n['id']]):dict(id=ids[n['id']],x=n['x_m'],y=n['y_m'],z=n['z_m']) for n in data['nodes']},
        materials={str(matids[m['id']]):dict(id=matids[m['id']],e=m['e_pa']/1e6,nu=m['nu']) for m in data['materials']},
        sections={str(secids[s['id']]):dict(id=secids[s['id']],a=s['area_m2'],iy=s['iy_m4'],iz=s['iz_m4'],j=s['j_m4']) for s in data['sections']},
        elements={str(i+1):dict(id=i+1,type='frame',nodeI=ids[m['start']],nodeJ=ids[m['end']],
            materialId=matids[m['material']],sectionId=secids[m['section']],rollAngle=m['rotation_deg']) for i,m in enumerate(data['members']) if m['kind']=='frame'},
        supports={str(ids[s['node']]):dict(nodeId=ids[s['node']],**dict(zip(('rx','ry','rz','rrx','rry','rrz'),s['restrained']))) for s in data['supports']},
        loads=[dict(type='nodal',data=dict(nodeId=ids[l['node']],**{key:l[src]/1000 for key,src in zip(
            ('fx','fy','fz','mx','my','mz'),('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm'))})) for l in data['nodal_loads']],leftHand=False)
    for i,m in enumerate(data['members']):
        if m['kind']=='axial':
            mid=len(matids)+i+1;sid=len(secids)+i+1
            # A truss has NO bending/torsion properties. Its elastic axial law
            # needs E and A only; no nearly-zero fictitious frame is inserted.
            result['materials'][str(mid)]=dict(id=mid,e=m['e_pa']/1e6,nu=.3)
            result['sections'][str(sid)]=dict(id=sid,a=m['area_m2'],iy=0.,iz=0.,j=0.)
            result['elements'][str(i+1)]=dict(id=i+1,type='truss',nodeI=ids[m['start']],nodeJ=ids[m['end']],materialId=mid,sectionId=sid)
    return result


def frame3dd_input(data):
    ids={n['id']:i+1 for i,n in enumerate(data['nodes'])}
    mats={m['id']:m for m in data['materials']};secs={s['id']:s for s in data['sections']}
    rows=['M32 equivalent Euler-Bernoulli beam-column, units N mm tonne',str(len(data['nodes']))]
    rows += [' '.join(map(str,[ids[n['id']],n['x_m']*1000,n['y_m']*1000,n['z_m']*1000,0])) for n in data['nodes']]
    rows += [str(len(data['supports']))]+[' '.join(map(str,[ids[s['node']],*map(int,s['restrained'])])) for s in data['supports']]
    rows += [str(len(data['members']))]
    for i,m in enumerate(data['members']):
        s=secs[m['section']];mat=mats[m['material']]
        rows.append(' '.join(map(str,[i+1,ids[m['start']],ids[m['end']],s['area_m2']*1e6,s['area_m2']*1e6,s['area_m2']*1e6,s['j_m4']*1e12,s['iy_m4']*1e12,s['iz_m4']*1e12,mat['e_pa']/1e6,mat['g_pa']/1e6,m['rotation_deg'],1.])))
    combined={}
    for load in data['nodal_loads']:
        force=combined.setdefault(load['node'],[0.]*6)
        for i,k in enumerate(('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')):
            force[i]+=load[k]*(1000 if i>=3 else 1)
    rows += ['0','1','1','1','-1','1','0 0 0',str(len(combined))]
    rows += [' '.join(map(str,[ids[node],*force])) for node,force in combined.items()]
    rows += ['0']*6  # uniform/trapezoid/interior/temperature/prescribed; zero modes
    return '\n'.join(rows)+'\n'


def main():
    p=argparse.ArgumentParser();p.add_argument('--stabileo',type=Path,required=True)
    p.add_argument('--frame3dd',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True)
    args=p.parse_args();out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
    raw=json.loads((ROOT/'engine/examples/frame-pdelta-cantilever.json').read_text());data=raw['model']
    native=analyze_frame_pdelta(raw);combo=next(iter(native['combinations'].values()))
    input_s=dict(analysis='pdelta',maxIter=30,tolerance=1e-10,model=stabileo_input(data))
    (out/'stabileo-input.json').write_text(json.dumps(input_s,indent=2)+'\n',encoding='utf8')
    stable=subprocess.run([str(args.stabileo.resolve()),str(out/'stabileo-input.json')],capture_output=True,env=env,timeout=20)
    (out/'stabileo-output.json').write_bytes(stable.stdout);(out/'stabileo-stderr.txt').write_bytes(stable.stderr)
    assert stable.returncode==0,(stable.returncode,stable.stderr[-500:],stable.stdout[-500:])
    sr=json.loads(stable.stdout)
    (out/'frame3dd-input.3dd').write_text(frame3dd_input(data),encoding='utf8')
    frame=subprocess.run([str(args.frame3dd.resolve()),'-i',str(out/'frame3dd-input.3dd'),'-o',str(out/'frame3dd-output.txt')],capture_output=True,env=env,timeout=20)
    (out/'frame3dd-stdout.txt').write_bytes(frame.stdout);(out/'frame3dd-stderr.txt').write_bytes(frame.stderr)
    assert frame.returncode==0,(frame.returncode,frame.stderr[-1000:])
    text=(out/'frame3dd-output.txt').read_text()
    # Frame3DD prints both the elastic state and the final nonlinear state.
    node_rows=text.split('N O D E   D I S P L A C E M E N T S')[-1].split('F R A M E')[0]
    numeric=[line.split() for line in node_rows.splitlines() if re.match(r'^\s*\d+\s+[-+\d.]',line)]
    ft=float(numeric[-1][1])/1000;st=sr['results']['displacements'][-1]['ux']
    tip=combo['nodes']['N16']['translation_m'][0]
    P=.6*math.pi**2*200e9*1e-5/(4*4**2);k=math.sqrt(P/(200e9*1e-5))
    exact=100/P*(math.tan(k*4)/k-4)
    result=dict(executables={name:dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(),path=path.name) for name,path in [('stabileo',args.stabileo),('frame3dd',args.frame3dd)]},
        jpn_native_tip_m=tip,stabileo_tip_m=st,frame3dd_tip_m=ft,continuum_tip_m=exact,
        relative_errors_to_continuum={name:abs(v-exact)/abs(exact) for name,v in [('jpn',tip),('stabileo',st),('frame3dd',ft)]},
        normative_approval=False,approved_for_fabrication=False)
    (out/'summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result))


if __name__=='__main__':
    main()
