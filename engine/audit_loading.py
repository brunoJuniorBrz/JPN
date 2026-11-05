"""Record independent closed-form comparisons and a protected real-worker case."""
import json,os,platform,subprocess,sys,time,math
from pathlib import Path
from importlib.metadata import version
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tests.test_mixed3d_loads import beam,weight
from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d



def independent_fixture_check(raw, result):
    """Closed-form total area/mass, external resultants and support reactions.

    Uses only the input JSON, Euclidean geometry and basic arithmetic.
    Does not rely on internal stiffness matrices, load assembly or PyNite.
    """
    nodes={n['id']:(n['x_m'],n['y_m'],n['z_m']) for n in raw['nodes']}
    members={m['id']:m for m in raw['members']}
    sections={s['id']:s for s in raw['sections']}
    densities={d['member']:d['kg_m3'] for d in raw['self_weight']['densities']}
    assert len(nodes)==132 and len(members)==243
    assert set(densities)==set(members)
    def vector_add(a,b):
        return tuple(x+y for x,y in zip(a,b))
    def cross(a,b):
        return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    def lever(point, origin):
        return tuple(x-y for x,y in zip(point,origin))
    origin=next(iter(nodes.values()))
    lengths={}
    masses={}
    mids={}
    for mid,m in members.items():
        start,end=nodes[m['start']],nodes[m['end']]
        length=math.dist(start,end)
        area=m['area_m2'] if m['kind']=='axial' else sections[m['section']]['area_m2']
        lengths[mid]=length
        masses[mid]=densities[mid]*area*length
        mids[mid]=tuple((a+b)/2 for a,b in zip(start,end))
    mass=sum(masses.values())
    assert math.isclose(mass,4556.486694873053,rel_tol=1e-10), "Protected fixture mass changed; review the baseline"
    assert math.isclose(mass,result['loading']['self_weight']['total_mass_kg'],rel_tol=1e-10)

    factors=next(c['factors'] for c in raw['combinations'] if c['id']=='TOTAL')
    force=(0.,0.,0.)
    moment=(0.,0.,0.)
    def apply(load_force, point, load_moment=(0.,0.,0.)):
        nonlocal force,moment
        force=vector_add(force,load_force)
        moment=vector_add(moment,vector_add(cross(lever(point,origin),load_force),load_moment))
    for load in raw['nodal_loads']:
        factor=factors.get(load['case'],0.)
        apply(tuple(load[k]*factor for k in ('fx_n','fy_n','fz_n')),
              nodes[load['node']],
              tuple(load[k]*factor for k in ('mx_nm','my_nm','mz_nm')))
    for load in raw['member_loads']:
        assert load['coordinate_system']=='global', "Independent audit requires global member loads"
        factor=factors.get(load['case'],0.)
        apply(tuple(q*lengths[load['member']]*factor for q in load['force_per_length_n_m']),
              mids[load['member']])
    weight_factor=factors.get(raw['self_weight']['case'],0.)
    for mid,mass_kg in masses.items():
        apply(tuple(mass_kg*g*weight_factor for g in raw['self_weight']['gravity_m_s2']),mids[mid])
    for nid,node_result in result['combinations']['TOTAL']['nodes'].items():
        apply(tuple(node_result['reaction_force_n']),nodes[nid],tuple(node_result['reaction_moment_nm']))
    # This equilibrium reference includes both force and free moment components.
    tolerance=1e-7*max(1.,sum(masses.values())*10)
    assert max(map(abs,force))<tolerance, f"Independent force check: {force}"
    assert max(map(abs,moment))<tolerance*max(1.,max(abs(x) for n in nodes.values() for x in n)), f"Independent moment check: {moment}"
    return dict(reference_mass_kg=mass,static_members=len(members),nodes=len(nodes),
                force_residual_n=force,moment_residual_nm=moment)

def audit():
    rows=[];e=200e9;i=1e-5;l=2.;q=-100.
    for kind in ('cantilever','simple','fixed'):
        out=analyze_loaded_mixed3d(beam(kind));c=out['combinations']['LC'];s=c['members']['BEAM']['stations']
        expected=q*l**4/(8*e*i) if kind=='cantilever' else (5 if kind=='simple' else 1)*q*l**4/(384*e*i)
        actual=c['nodes']['B']['translation_m'][2] if kind=='cantilever' else s[2]['translation_local_m'][2]
        rows.append(dict(case=kind,expected_deflection_m=expected,actual_deflection_m=actual,absolute_error_m=abs(expected-actual),reactions=c['nodes']['A'],stations=s,equilibrium=c['equilibrium']))
        assert abs(actual-expected)<1e-11
    w=analyze_loaded_mixed3d(weight(beam()))
    root=Path(__file__).parent;payload=(root/'examples/mixed-loaded-roof.json').read_bytes();start=time.perf_counter()
    run=subprocess.run([sys.executable,'-I','-X','utf8',str(root/'local_mixed_worker.py')],input=payload,capture_output=True,timeout=22,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    response=json.loads(run.stdout);assert run.returncode==0,response
    result=response['result'];c=result['combinations']['TOTAL'];mass=result['loading']['self_weight']['total_mass_kg']
    independent=independent_fixture_check(json.loads(payload),result)
    expected_tip=-100*2**4/(8*e*i)-5*2**3/(3*e*i)
    assert math.isclose(w['loading']['self_weight']['total_mass_kg'],21.,rel_tol=1e-10)
    assert math.isclose(w['combinations']['WEIGHT']['nodes']['B']['translation_m'][2],expected_tip,rel_tol=1e-8,abs_tol=1e-12)
    return dict(status='passed',environment=dict(python=platform.python_version(),platform=platform.platform(),dependencies={p:version(p) for p in ('numpy','scipy','PyNiteFEA')}),references=rows,
      isolated_weight=dict(expected_mass_kg=21,actual_mass_kg=w['loading']['self_weight']['total_mass_kg'],expected_tip_m=-100*2**4/(8*e*i)-5*2**3/(3*e*i),actual_tip_m=w['combinations']['WEIGHT']['nodes']['B']['translation_m'][2]),
      independent_fixture=independent,
      protected_roof=dict(nodes=len(c['nodes']),segments=len(c['members']),total_mass_kg=mass,input_sha256=result['input_sha256'],diagnostics=result['diagnostics'],wall_seconds=time.perf_counter()-start,input_bytes=len(payload),output_bytes=len(run.stdout),execution=response['execution'],equilibrium=c['equilibrium'],sample_frame=next((dict(id=k,**v) for k,v in c['members'].items() if v['kind']=='frame')),sample_axial=next((dict(id=k,**v) for k,v in c['members'].items() if v['kind']=='axial'))))


if __name__=='__main__':print(json.dumps(audit(),indent=2,allow_nan=False))
