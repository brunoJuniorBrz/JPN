"""Additional pinned OpenSees oracle. Historical P4/P5 files are read-only.

Explicit section bases audited against native x/y/z axes at creation; physical
SO(3) matrices reconstructed from EVERY Newton increment (not additive DOFs).
Private reference mesh, never sent to candidate or application.
"""
import hashlib,json,math,tempfile,time
from pathlib import Path
import openseespy.opensees as ops

def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def matmul(a,b):return [[math.fsum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def spin(r):
    t=math.sqrt(math.fsum(v*v for v in r));a=math.sin(t)/t if t else 1.;b=(1-math.cos(t))/t**2 if t>1e-4 else .5-t*t/24+t**4/720
    K=[[0,-r[2],r[1]],[r[2],0,-r[0]],[-r[1],r[0],0]];K2=matmul(K,K)
    return [[float(i==j)+a*K[i][j]+b*K2[i][j] for j in range(3)] for i in range(3)]

def solve(model,bases,subdivisions=16,test_tolerance=1e-14):
    started=time.perf_counter()
    if ops.version()!='3.8.0':raise ValueError('Pinned OpenSees 3.8.0 required')
    if not 1<=subdivisions<=64:raise ValueError('Declared additional reference domain exceeded')
    ops.wipe();ops.model('basic','-ndm',3,'-ndf',6)
    try:ops.geomTransf('Corotational02',999,0,0,1);corot02=True
    except Exception:corot02=False
    ops.wipe();ops.model('basic','-ndm',3,'-ndf',6)
    points={n['id']:[n[k] for k in ('x_m','y_m','z_m')] for n in model['nodes']};original=list(points)
    members=[];mapping=[]
    for parent in model['members']:
        if parent['kind']!='frame' or parent['rotation_deg'] or any(parent['release_start']+parent['release_end']):raise ValueError('Reference domain: rigid unrolled frame')
        chain=[parent['start']]
        for j in range(1,subdivisions):
            name='V2-N'+str(len(points));points[name]=[points[parent['start']][k]+(points[parent['end']][k]-points[parent['start']][k])*j/subdivisions for k in range(3)];chain.append(name)
        chain.append(parent['end'])
        for i in range(subdivisions):
            members.append({**parent,'start':chain[i],'end':chain[i+1]});mapping.append(parent['id'])
    if len(points)>600:raise ValueError('Additional oracle computational mesh bound exceeded')
    ids={n:i+1 for i,n in enumerate(points)}
    for name,p in points.items():ops.node(ids[name],*p)
    supports={s['node']:s['restrained'] for s in model['supports']}
    for n,v in supports.items():ops.fix(ids[n],*map(int,v))
    mats={m['id']:m for m in model['materials']};secs={s['id']:s for s in model['sections']};axes_error=0.
    for tag,m in enumerate(members,1):
        B=bases[m['id']];ops.geomTransf('Corotational',tag,*B[2]);mat,sec=mats[m['material']],secs[m['section']]
        ops.element('elasticBeamColumn',tag,ids[m['start']],ids[m['end']],sec['area_m2'],mat['e_pa'],mat['g_pa'],sec['j_m4'],sec['iy_m4'],sec['iz_m4'],tag)
        actual=[ops.eleResponse(tag,k) for k in ('xaxis','yaxis','zaxis')]
        if any(len(a)!=3 for a in actual):raise ValueError('Native basis response missing')
        axes_error=max(axes_error,max(abs(a-b) for row,expected in zip(actual,B) for a,b in zip(row,expected)))
    if axes_error>1e-12:raise ValueError('Native declared axes differ')
    loads={n:[0.]*6 for n in points};factor=model['combinations'][0]['factors']
    if len(model['combinations'])!=1 or model.get('self_weight') or model.get('member_loads'):raise ValueError('One explicit dead nodal load combination required')
    for l in model['nodal_loads']:
        for i,k in enumerate(('fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm')):loads[l['node']][i]+=factor.get(l['case'],0)*l[k]
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
    for n,v in loads.items():ops.load(ids[n],*v)
    ops.constraints('Plain');ops.numberer('RCM');ops.system('BandGeneral')
    with tempfile.TemporaryDirectory(prefix='jpn-p6-v2-') as folder:
        log=Path(folder)/'newton.log';ops.logFile(str(log),'-noEcho');ops.setPrecision(17)
        ops.test('NormDispIncr',test_tolerance,50,4);ops.algorithm('Newton');ops.integrator('LoadControl',.1);ops.analysis('Static')
        iterations=[]
        for _ in range(10):
            if ops.analyze(1):raise RuntimeError('Native reference failed Newton')
            iterations.append(ops.testIter())
        ops.logFile('NUL' if __import__('sys').platform=='win32' else '/dev/null','-noEcho')
        raw=log.read_bytes()
        if len(raw)>64000000:raise ValueError('Native trace limit exceeded')
    increments=[list(map(float,l.split('deltaX:',1)[1].split())) for l in raw.decode().splitlines() if l.lstrip().startswith('deltaX:')]
    dofs={n:ops.nodeDOFs(tag) for n,tag in ids.items()};active=sorted(v for row in dofs.values() for v in row if v>=0)
    if active!=list(range(len(active))) or len(increments)!=sum(iterations) or any(len(v)!=len(active) for v in increments):raise ValueError('Incomplete native increment/RCM trace')
    ops.reactions();nodes={};trace_error=0.;free_residual={}
    for name in points:
        disp=ops.nodeDisp(ids[name]);reaction=ops.nodeReaction(ids[name]);Q=[[float(i==j) for j in range(3)] for i in range(3)]
        steps=[[row[d] if d>=0 else 0. for d in dofs[name]] for row in increments]
        for step in steps:Q=matmul(spin(step[3:]),Q)
        trace_error=max(trace_error,max(abs(math.fsum(s[i] for s in steps)-disp[i]) for i in range(6)))
        mask=supports.get(name,[False]*6)
        free_residual[name]=[reaction[i] if not mask[i] else 0. for i in range(6)]
        # A native free-node imbalance is not a support reaction. Preserve it
        # explicitly and report constrained reactions only, as in the continuum.
        constrained=[reaction[i] if mask[i] else 0. for i in range(6)]
        nodes[name]=dict(translation_m=list(disp[:3]),orientation_matrix=Q,reaction_force_n=constrained[:3],reaction_moment_nm=constrained[3:])
    if trace_error>2e-12:raise ValueError('Native increments disagree with nodeDisp')
    actions=[];energy=0.
    for parent in model['members']:
        tags=[i+1 for i,p in enumerate(mapping) if p==parent['id']]
        actions.append(list(ops.eleForce(tags[0]))[:6]+list(ops.eleForce(tags[-1]))[6:])
    for tag in range(1,len(members)+1):
        v=ops.eleResponse(tag,'basicDeformations');q=ops.eleResponse(tag,'basicForce')
        if len(v)!=6 or len(q)!=6:raise ValueError('Native energy response missing')
        energy+=.5*math.fsum(a*b for a,b in zip(v,q))
    origin=points[original[0]];contributions=[];scales=[]
    for name,p in points.items():
        a=nodes[name];mask=supports.get(name,[False]*6);reaction=a['reaction_force_n']+a['reaction_moment_nm']
        total=[loads[name][i]+(reaction[i] if mask[i] else 0.) for i in range(6)]
        position=[p[i]-origin[i]+a['translation_m'][i] for i in range(3)];moment=cross(position,total[:3]);applied=cross(position,loads[name][:3])
        contributions.append(total[:3]+[total[i+3]+moment[i] for i in range(3)])
        scales.append([abs(v) for v in loads[name][:3]]+[abs(loads[name][i+3])+abs(applied[i]) for i in range(3)])
    residual=[math.fsum(v[i] for v in contributions) for i in range(6)];scale=[1+math.fsum(v[i] for v in scales) for i in range(6)]
    relative=[abs(a)/b for a,b in zip(residual,scale)]
    return dict(schema_version='jpn.p6-native-reference-v2/1',version=ops.version(),transformation='Corotational',corotational02_available=corot02,
        test_tolerance=test_tolerance,subdivisions=subdivisions,reference_node_count=len(points),reference_member_count=len(members),
        nodes={n:nodes[n] for n in original},physical_end_actions=actions,strain_energy_j=energy,
        native_axes_maximum_error=axes_error,trace_sha256=hashlib.sha256(raw).hexdigest(),trace_reconstruction_error=trace_error,
        free_wrench_residual={n:free_residual[n] for n in original},
        physical_support_equilibrium=dict(force_residual_n=residual[:3],moment_residual_nm=residual[3:],relative_residual=relative,accepted=max(relative)<=1e-8),
        bases_global_to_local=bases,elapsed_seconds=time.perf_counter()-started,computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')

if __name__=='__main__':
    raw=__import__('sys').stdin.buffer.read(500001)
    if len(raw)>500000:raise ValueError('Input limit')
    p=json.loads(raw);r=solve(**p);r['input_bytes_sha256']=hashlib.sha256(raw).hexdigest()
    body=json.dumps(r,allow_nan=False).encode()
    if len(body)>2000000:raise ValueError('Output limit')
    __import__('sys').stdout.buffer.write(body)
