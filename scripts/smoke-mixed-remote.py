"""Real HTTP smoke test. Secrets only from environment; reports contain metrics.

Run from the repository with the existing Python 3.12 engine environment.
No deploy, retry, redirect, secret output or persistence. Stop on first failure.
"""
import argparse
import hashlib
import json
import math
import os
import re
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
MAX_BYTES=2000000


def small_v1():
    e=200e9
    return dict(schema_version='jpn.mixed3d/1',units='SI',theory='linear-elastic-frame-axial',
        project=dict(id='SMOKE',revision='1',source='Independent synthetic HTTP reference'),
        nodes=[dict(id='A',x_m=0.,y_m=0.,z_m=0.),dict(id='B',x_m=2.,y_m=0.,z_m=0.),dict(id='C',x_m=2.,y_m=0.,z_m=1.)],
        materials=[dict(id='M',e_pa=e,g_pa=e/2.6,nu=.3,source='Synthetic',revision='1')],
        sections=[dict(id='S',area_m2=.01,iy_m4=1e-5,iz_m4=1e-5,j_m4=1e-5,source='Synthetic',revision='1')],
        members=[dict(id='F',kind='frame',start='A',end='B',material='M',section='S',rotation_deg=0,release_start=[False]*6,release_end=[False]*6),dict(id='X',kind='axial',start='B',end='C',e_pa=e,area_m2=.001,source='Synthetic',revision='1')],
        supports=[dict(node='A',restrained=[True]*6),dict(node='C',restrained=[True,True,True,False,False,False])],
        cases=[dict(id='L',source='Explicit -1000 N point force')],nodal_loads=[dict(node='B',case='L',fx_n=0.,fy_n=0.,fz_n=-1000.,mx_nm=0.,my_nm=0.,mz_nm=0.)],combinations=[dict(id='LC',factors={'L':1})])


def small_v2():
    p=small_v1();p['schema_version']='jpn.mixed3d/2'
    p['nodes'][2].update(y_m=1.,z_m=0.);p['nodal_loads']=[]
    p['cases']=[dict(id='L',source='Explicit -100 N/m distributed load'),dict(id='SW',source='Synthetic rho=1000 kg/m3 and g=-10 m/s2')]
    p['member_loads']=[dict(id='Q',member='F',case='L',coordinate_system='global',force_per_length_n_m=[0.,0.,-100.],source='Synthetic UDL',revision='1')]
    p['self_weight']=dict(case='SW',gravity_m_s2=[0.,0.,-10.],axial_lumping='half-to-end-nodes',densities=[dict(member=m['id'],kg_m3=1000.,source='Synthetic density, not assumed steel',revision='1') for m in p['members']])
    p['combinations']=[dict(id='TOTAL',factors={'L':1,'SW':1}),dict(id='WEIGHT',factors={'L':0,'SW':1})]
    return p


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*_args,**_kwargs):return None


def unique(pairs):
    d={}
    for k,v in pairs:
        if k in d:raise ValueError('Duplicate JSON')
        d[k]=v
    return d


def check(condition,label):
    if not condition:raise ValueError(label)


def close(a,b,atol=1e-8):return math.isclose(a,b,rel_tol=1e-7,abs_tol=atol)


def validate(request,out,raw):
    sys.path.insert(0,str(ROOT/'engine'))
    from jpn_structural.frame3d_model import input_hash
    result=out['result'];check(out['schema_version']=='jpn.http-mixed/1','HTTP_SCHEMA')
    check(out['request_sha256']==hashlib.sha256(raw).hexdigest(),'RAW_HASH')
    check(result['input_sha256']==input_hash(request),'CANONICAL_HASH')
    check(result['schema_version']==request['schema_version'].replace('mixed3d/','mixed3d-result/'),'RESULT_VERSION')
    check(result['units']=='SI' and result['project']==request['project'],'IDENTITY')
    check(result['status']=='analysis_completed_experimental' and result['solver']['version']=='3.2.1','SOLVER')
    check(set(result['combinations'])=={c['id'] for c in request['combinations']},'COMBINATIONS')
    for c in result['combinations'].values():
        check(set(c['nodes'])=={n['id'] for n in request['nodes']},'NODE_IDS')
        check(set(c['members'])=={m['id'] for m in request['members']},'MEMBER_IDS')
        check(c['equilibrium']['relative_residual']<=1e-8,'EQUILIBRIUM')
        for m in request['members']:check(c['members'][m['id']]['kind']==m['kind'],'MEMBER_KIND')
    if request['schema_version']=='jpn.mixed3d/2' and request['self_weight']:
        sw=request['self_weight'];trace=result['loading']['self_weight'];nodes={n['id']:n for n in request['nodes']};sections={s['id']:s for s in request['sections']};density={d['member']:d for d in sw['densities']};total=0.
        check(trace['case']==sw['case'] and trace['gravity_m_s2']==sw['gravity_m_s2'],'WEIGHT_TRACE')
        check(len(trace['members'])==len(request['members']) and len({t['member'] for t in trace['members']})==len(request['members']),'WEIGHT_IDS')
        for m in request['members']:
            a,b=nodes[m['start']],nodes[m['end']];length=math.sqrt(sum((a[k]-b[k])**2 for k in ('x_m','y_m','z_m')));area=m['area_m2'] if m['kind']=='axial' else sections[m['section']]['area_m2'];mass=density[m['id']]['kg_m3']*area*length;total+=mass
            t=next(t for t in trace['members'] if t['member']==m['id']);check(t['density']==density[m['id']] and close(t['mass_kg'],mass),'SEGMENT_MASS')
            check(all(close(t['force_n'][i],mass*sw['gravity_m_s2'][i]) for i in range(3)),'SEGMENT_WEIGHT')
        check(close(trace['total_mass_kg'],total),'TOTAL_MASS')
    return result


def validate_reference(stage,result):
    """Independent closed-form references, shared by HTTP smoke/local tests."""
    if stage=='small_v1':
        expected=-1000/(3*200e9*1e-5/2**3+200e9*.001);check(close(result['combinations']['LC']['nodes']['B']['translation_m'][2],expected,1e-12),'ANALYTIC_V1')
        check(close(sum(n['reaction_force_n'][2] for n in result['combinations']['LC']['nodes'].values()),1000),'REACTION_V1')
        force=3*200e9*1e-5/2**3*expected;check(close(result['combinations']['LC']['nodes']['A']['reaction_moment_nm'][1],force*2),'MOMENT_V1')
    elif stage=='small_v2':
        c=result['combinations']['WEIGHT'];ei=200e9*1e-5;check(close(c['nodes']['B']['translation_m'][2],-100*2**4/(8*ei)-5*2**3/(3*ei),1e-12),'ANALYTIC_V2')
        check(close(result['loading']['self_weight']['total_mass_kg'],21) and close(sum(n['reaction_force_n'][2] for n in c['nodes'].values()),210),'MASS_REACTION_V2')
        check(close(c['nodes']['A']['reaction_moment_nm'][1],-210),'MOMENT_V2');station=c['members']['F']['stations'][2];check(close(station['my_nm'],55) and close(station['vz_n'],-105),'INTERNAL_FORCES_V2')
        total=result['combinations']['TOTAL'];check(close(total['nodes']['B']['translation_m'][2],-200*2**4/(8*ei)-5*2**3/(3*ei),1e-12),'UDL_SUPERPOSITION')
    else:check(len(result['combinations'][next(iter(result['combinations']))]['nodes'])==132 and len(result['combinations'][next(iter(result['combinations']))]['members'])==243,'ROOF_SIZE')


def run(skip_roof=False):
    names=['health','unauthorized','small_v1','small_v2','roof_v2']
    report=dict(status='NÃO EXECUTADO',stages={n:dict(status='NÃO EXECUTADO') for n in names})
    base=os.environ.get('JPN_MIXED_BACKEND_URL','').rstrip('/');token=os.environ.get('JPN_ANALYSIS_TOKEN','');bypass=os.environ.get('JPN_MIXED_DEPLOYMENT_BYPASS_SECRET','')
    url=urllib.parse.urlsplit(base)
    if not base or not token:
        report['reason']='Defina JPN_MIXED_BACKEND_URL e JPN_ANALYSIS_TOKEN no ambiente; nenhuma chamada realizada.';return report,2
    if url.scheme!='https' or url.username or url.password or url.query or url.fragment or url.path:
        report['reason']='URL deve ser origem HTTPS, sem credenciais/query/path.';return report,2
    opener=urllib.request.build_opener(NoRedirect())
    def call(path,model=None,authorized=True):
        headers={'Accept':'application/json'}
        if authorized:headers['Authorization']='Bearer '+token
        if bypass:headers['x-vercel-protection-bypass']=bypass
        raw=None
        if model is not None:raw=json.dumps(model,ensure_ascii=False,allow_nan=False).encode('utf8');headers['Content-Type']='application/json';check(len(raw)<=500000,'INPUT_LIMIT')
        start=time.perf_counter();req=urllib.request.Request(base+path,data=raw,headers=headers)
        try:response=opener.open(req,timeout=28)
        except urllib.error.HTTPError as error:response=error
        with response:
            data=response.read(MAX_BYTES+1);check(len(data)<=MAX_BYTES,'OUTPUT_LIMIT');status=response.status
        try:decoded=json.loads(data.decode('utf8'),object_pairs_hook=unique,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE')))
        except (ValueError,UnicodeError):raise ValueError('INVALID_JSON_OR_DEPLOYMENT_PROTECTION')
        def finite(value):
            if isinstance(value,float):check(math.isfinite(value),'NONFINITE')
            elif isinstance(value,list):
                for v in value:finite(v)
            elif isinstance(value,dict):
                for v in value.values():finite(v)
        finite(decoded)
        return status,decoded,raw,time.perf_counter()-start
    stage='health'
    try:
        status,out,_,elapsed=call('/health');check(status==200,'HEALTH_HTTP_'+str(status));check(out.get('status')=='ready','HEALTH_STATUS')
        check(out['dependencies']['python']=='3.12' and out['dependencies']['PyNiteFEA']=='3.2.1','DEPENDENCIES')
        check(out['execution']['memory_limit_bytes']==805306368 and out['execution']['timeout_seconds']==20,'LIMITS')
        report['stages'][stage]=dict(status='PASSOU',seconds=elapsed,dependencies=out['dependencies'])
        stage='unauthorized';status,out,_,elapsed=call('/health',authorized=False);check(status==401 and out.get('error',{}).get('code')=='UNAUTHORIZED','UNAUTHORIZED_CHECK');report['stages'][stage]=dict(status='PASSOU',seconds=elapsed)
        models=[('small_v1',small_v1()),('small_v2',small_v2())]
        if not skip_roof:models.append(('roof_v2',json.loads((ROOT/'engine/examples/mixed-loaded-roof.json').read_text())))
        for stage,model in models:
            timings=[];result=None
            for _ in range(2):
                status,out,raw,seconds=call('/api/analyze-mixed',model);code=out.get('error',{}).get('code','UNKNOWN');code=code if isinstance(code,str) and re.fullmatch(r'[A-Z_]{1,80}',code) else 'UNKNOWN';check(status==200,'ANALYSIS_HTTP_'+str(status)+'_'+code)
                result=validate(model,out,raw);timings.append(seconds)
                validate_reference(stage,result)
            report['stages'][stage]=dict(status='PASSOU',first_seconds=timings[0],second_seconds=timings[1],input_sha256=result['input_sha256'],maximum_equilibrium_residual=max(c['equilibrium']['relative_residual'] for c in result['combinations'].values()))
            if stage!='small_v1':report['stages'][stage]['mass_kg']=result['loading']['self_weight']['total_mass_kg']
        report['status']='PASSOU';report['timing_note']='Primeira/segunda chamada desta execução; não garante mesma instância nem cold start.';return report,0
    except Exception as error:
        # Never dump exceptions containing requests/headers, credentials or models.
        reason=str(error) if isinstance(error,ValueError) else type(error).__name__
        report['status']='FALHOU';report['stages'][stage]=dict(status='FALHOU',reason=reason[:160]);return report,1


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--skip-roof',action='store_true');parser.add_argument('--output',type=Path);args=parser.parse_args()
    result,code=run(args.skip_roof)
    secrets=[v for v in (os.environ.get('JPN_ANALYSIS_TOKEN'),os.environ.get('JPN_MIXED_DEPLOYMENT_BYPASS_SECRET')) if v]
    def sanitize(value):
        if isinstance(value,str):
            for secret in secrets:value=value.replace(secret,'[REDACTED]')
            return value
        if isinstance(value,dict):return {k:sanitize(v) for k,v in value.items()}
        if isinstance(value,list):return [sanitize(v) for v in value]
        return value
    text=json.dumps(sanitize(result),ensure_ascii=False,indent=2,allow_nan=False)
    if args.output:args.output.write_text(text+'\n',encoding='utf8')
    print(text);sys.exit(code)
