"""Quadrature/kinematics at IDENTICAL converged SPATIAL states."""
from pathlib import Path
import sys,json,time,hashlib
if '--worker' not in sys.argv:
    import subprocess,os
    result=subprocess.run([sys.executable,'-I',__file__,'--worker'],capture_output=True,timeout=20,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    if len(result.stdout)>2000000:raise ValueError('OUTPUT_LIMIT')
    sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);sys.exit(result.returncode)
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'engine'))
from local_mixed_worker import memory_limit
limits=memory_limit()
sys.path.insert(0,str(ROOT))
import numpy as np
from experiments.m43_p6 import element,arc,material_curvature
from experiments.m43_p6.test_material_curvature_oracle import make_frame

started=time.perf_counter();element.MATERIAL_CURVATURE=True
path=ROOT/'.tools/m43-p6/directed/spatial-4-reused.json'
raw=path.read_bytes()
if len(raw)>500000:raise ValueError('INPUT_LIMIT')
data=json.loads(raw)
if data['execution']['status']!='diagnostic':raise RuntimeError('No converged mesh 4 for identical-state study')
mesh=data['execution']['diagnostic']['candidate'];model=mesh['analysis_model'];answer=mesh['combinations']['C']
nodes={n['id']:n for n in model['nodes']};mats={m['id']:m for m in model['materials']};secs={s['id']:s for s in model['sections']}
maxima={k:0. for k in ('energy','force','tangent','physical_end_actions')};rows=[]
for member in model['members']:
    names=[member['start'],member['end']]
    X=np.array([[nodes[n][k] for k in ('x_m','y_m','z_m')] for n in names])
    q=np.array([answer['nodes'][n]['translation_m']+answer['nodes'][n]['rotation_rad'] for n in names]).ravel()
    s=secs[member['section']];m=mats[member['material']];basis=np.array(answer['members'][member['id']]['reference_basis'])
    args=(X,q,m['e_pa']*s['area_m2'],m['e_pa']*s['iy_m4'],m['e_pa']*s['iz_m4'],m['g_pa']*s['j_m4'],basis)
    values=[]
    for n in (8,16,32):
        p,w=np.polynomial.legendre.leggauss(n)
        arc.POINTS=material_curvature.POINTS=p;arc.WEIGHTS=material_curvature.WEIGHTS=w
        values.append(element.element_response(*args))
    for v in values[1:]:
        for k in maxima:maxima[k]=max(maxima[k],float(np.max(abs(np.asarray(v[k])-values[0][k]))))
    v=values[0];frame=make_frame(v['local_rotation_i'],v['local_rotation_j'])
    L0=np.linalg.norm(X[1]-X[0]);current=X+q.reshape(2,6)[:,:3];chord=np.linalg.norm(current[1]-current[0])
    # Hermite uses projected chord coordinate u. Its material speed is
    # chord*sqrt(1+a^2+b^2)/L0; director's x component is 1/sqrt(...).
    points,weights=np.polynomial.legendre.leggauss(64)
    speeds=np.array([chord/(L0*frame((u+1)/2)[0,0]) for u in points]);mean=float(np.dot(weights/2,speeds-1))
    rows.append(dict(member=member['id'],length0=L0,chord=chord,integrated_arc_length=float(np.dot(weights/2,speeds)*L0),mean_strain=mean,candidate_mean_strain=v['extension_m']/L0,
        speed_min=float(speeds.min()),speed_max=float(speeds.max()),axial_variance_energy_j=float(.5*args[2]*L0*np.dot(weights/2,(speeds-1-mean)**2)),
        energy_8_16_32=[r['energy'] for r in values]))
assert max(abs(r['mean_strain']-r['candidate_mean_strain']) for r in rows)<1e-12
report=dict(input_sha256=hashlib.sha256(raw).hexdigest(),execution=limits,elapsed_seconds=time.perf_counter()-started,maximum_quadrature_difference=maxima,members=rows,
    computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')
(ROOT/'.tools/m43-p6/directed/kinematics.json').write_text(json.dumps(report,indent=2))
print(json.dumps(dict(maximum_quadrature_difference=maxima,seconds=report['elapsed_seconds'])))
