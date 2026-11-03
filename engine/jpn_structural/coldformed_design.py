"""NBR 14762:2010 procedures, independent of finite-element assembly.

SI throughout. Annex C critical loads MUST come from an explicitly reviewed
elastic stability study for the same member, restraints and load pattern.
No curve minima/modes, connection capacity or structural approval are inferred.
"""
import math
import numpy as np
from .frame3d_model import obj, number, text, input_hash, fail

VERSION = 'jpn.coldformed-design/1'
STANDARD = 'ABNT NBR 14762:2010'
FORCES = ('nN', 'vyN', 'vzN', 'tNm', 'myNm', 'mzNm')


def compression_mrd(yield_force, critical):
    """C.3.1–C.3.3. All three modes mandatory in this first implementation."""
    ne, nl, nd = critical['global'], critical['local'], critical['distortional']
    l0 = math.sqrt(yield_force/ne)
    global_r = (.658**(l0*l0)*yield_force if l0 <= 1.5 else .877*ne)
    ll, ld = math.sqrt(global_r/nl), math.sqrt(yield_force/nd)
    local_r = global_r if ll <= .776 else (1-.15/ll**.8)*global_r/ll**.8
    dist_r = yield_force if ld <= .561 else (1-.25/ld**1.2)*yield_force/ld**1.2
    modes = dict(global_=global_r, local=local_r, distortional=dist_r)
    return dict(characteristic=min(modes.values()), design=min(modes.values())/1.20,
                gamma=1.20, modes=modes, slenderness=dict(global_=l0, local=ll, distortional=ld),
                governing_mode=min(modes, key=modes.get), clauses=['C.1', 'C.2', 'C.3.1', 'C.3.2', 'C.3.3'])


def bending_mrd(yield_moment, critical):
    """C.4.1–C.4.3, coefficients/branch boundaries exactly as published."""
    me, ml, md = critical['global'], critical['local'], critical['distortional']
    l0 = math.sqrt(yield_moment/me)
    global_r = (yield_moment if l0 <= .6 else
                1.11*(1-.278*l0*l0)*yield_moment if l0 < 1.336 else me)
    ll, ld = math.sqrt(global_r/ml), math.sqrt(yield_moment/md)
    local_r = global_r if ll <= .776 else (1-.15/ll**.8)*global_r/ll**.8
    dist_r = yield_moment if ld <= .673 else (1-.22/ld)*yield_moment/ld
    modes = dict(global_=global_r, local=local_r, distortional=dist_r)
    return dict(characteristic=min(modes.values()), design=min(modes.values())/1.10,
                gamma=1.10, modes=modes, slenderness=dict(global_=l0, local=ll, distortional=ld),
                governing_mode=min(modes, key=modes.get), clauses=['C.1', 'C.2', 'C.4.1', 'C.4.2', 'C.4.3'])


def effective_inertia_mrd(gross_inertia, service_moment, critical):
    """C.5: characteristic M_Rser (NO resistance gamma in this SLS formula)."""
    if service_moment == 0:
        return gross_inertia
    return gross_inertia*min(1., bending_mrd(abs(service_moment), critical)['characteristic']/abs(service_moment))


def tension_resistance(area, fy, fu, declaration):
    modes = dict(gross_yield=area*fy/1.10,
                 net_outside=declaration['net_outside_m2']*fu/1.35,
                 net_connection=declaration['ct']*declaration['net_connection_m2']*fu/1.65)
    return dict(design=min(modes.values()), modes=modes, governing_mode=min(modes, key=modes.get),
                clauses=['9.6.1', '9.6.2(a)', '9.6.2(b)', '9.6.2(c)'])


def shear_unstiffened(e, fy, h, t):
    """9.8.3: ONE unstiffened web only; h is the flat web, not outer height."""
    slenderness, scale = h/t, math.sqrt(5.*e/fy)
    if slenderness <= 1.08*scale:
        characteristic, branch = .6*fy*h*t, 'yield'
    elif slenderness <= 1.4*scale:
        characteristic, branch = .65*t*t*math.sqrt(5.*fy*e), 'inelastic-buckling'
    else:
        characteristic, branch = .905*5.*e*t**3/h, 'elastic-buckling'
    return dict(design=characteristic/1.10, characteristic=characteristic, gamma=1.10,
                slenderness=slenderness, branch=branch, kv=5., clauses=['9.8.3'])


def roots(c):
    """All real roots on (0,1) via the audited NumPy polynomial implementation."""
    p = np.polynomial.Polynomial(c).trim()
    result = []
    for r in p.roots():
        if abs(r.imag) <= 128*np.finfo(float).eps*max(1., abs(r.real)) and 0 < r.real < 1:
            result.append(float(r.real))
    return result


def evaluate(c, u):
    return float(np.polynomial.polynomial.polyval(u, c))


def _reference(raw):
    obj(raw, 'source revision responsible basis_sha256 boundary_and_load_pattern minimum_search', 'elastic study')
    for k in ('source', 'revision', 'responsible', 'boundary_and_load_pattern'):text(raw[k], k)
    if raw['minimum_search'] not in ('reviewed-elastic-mode-minima','not-required-pure-tension','computed-cfsm-ss'):fail('CRITICAL_MINIMUM_PENDING', 'A sampled signature curve is not a reviewed minimum by mode.')


def _critical(raw):
    if raw is None:return
    obj(raw, 'global local distortional', 'elastic critical values')
    for k in raw:number(raw[k], 1e-12, 1e20, k)


def analyze_coldformed_design(raw,*,_computed_modes=()):
    obj(raw, 'schema_version units piece_id combination_id binding section study critical tension web fields', 'member design')
    if raw['schema_version'] != VERSION or raw['units'] != 'SI':fail('UNSUPPORTED_MODEL', 'Use the explicit SI cold-formed design contract.')
    for k in ('piece_id', 'combination_id'):text(raw[k], k)
    obj(raw['binding'], 'mechanical_sha256 analysis_input_sha256 analysis_result_sha256', 'binding')
    for v in raw['binding'].values():
        if type(v) is not str or len(v) != 64 or any(c not in '0123456789abcdef' for c in v):fail('INVALID_INPUT', 'SHA256 required.')
    s = raw['section']
    obj(s, 'family shape area_m2 fy_pa fu_pa e_pa iy_m4 iz_m4 wy_m3 wz_m3 effective_length_y_m effective_length_z_m source revision', 'section')
    if s['family'] != 'cold-formed' or s['shape'] != 'u-stiffened':fail('UNSUPPORTED_FAMILY', 'This procedure integration supports explicitly declared cold-formed Ue only.')
    for k in ('area_m2', 'fy_pa', 'fu_pa', 'e_pa', 'iy_m4', 'iz_m4', 'wy_m3', 'wz_m3', 'effective_length_y_m', 'effective_length_z_m'):number(s[k], 1e-20, 1e20, k)
    for k in ('source', 'revision'):text(s[k], k)
    if s['fu_pa'] < s['fy_pa']:fail('INVALID_MATERIAL', 'fu < fy.')
    _reference(raw['study'])
    if raw['study']['basis_sha256'] != raw['binding']['mechanical_sha256']:fail('STALE_CRITICAL_STUDY', 'Elastic critical study is for another physical member/load revision.')
    critical = raw['critical'];obj(critical, 'compression my_positive my_negative mz_positive mz_negative', 'critical modes')
    for v in critical.values():_critical(v)
    tension = raw['tension']
    if tension is not None:
        if type(tension) is not dict:fail('INVALID_INPUT','Tension connection must be an explicit object.')
        if tension.get('basis')=='full-section-all-elements-welded':
            obj(tension,'basis source revision','full welded section')
            tension={**tension,'net_outside_m2':s['area_m2'],'net_connection_m2':s['area_m2'],'ct':1.}
        else:
            obj(tension, 'basis net_outside_m2 net_connection_m2 ct source revision', 'tension connection data')
            if tension['basis']!='declared-net-areas':fail('UNSUPPORTED_CONNECTION','Explicit net-section basis required.')
            for k in ('net_outside_m2', 'net_connection_m2'):number(tension[k], 1e-20, s['area_m2'], k)
            number(tension['ct'], 1e-12, 1, 'Ct')
        for k in ('source', 'revision'):text(tension[k], k)
    web = raw['web'];obj(web, 'flat_height_m thickness_m unstiffened_single_web', 'web')
    for k in ('flat_height_m', 'thickness_m'):number(web[k], 1e-9, 100, k)
    if type(web['unstiffened_single_web']) is not bool:fail('INVALID_INPUT', 'Web configuration must be explicit.')
    fields = raw['fields']
    if type(fields) is not list or not 1 <= len(fields) <= 320:fail('INPUT_LIMIT', '1–320 segments required.')
    ids = set()
    force_models = set()
    for f in fields:
        obj(f, 'segment_id offset_m length_m forces', 'continuous field');text(f['segment_id'], 'segment id')
        if f['segment_id'] in ids:fail('DUPLICATE_ID', 'Repeated segment.')
        ids.add(f['segment_id']);number(f['offset_m'], 0, 1e6, 'offset');number(f['length_m'], 1e-8, 1e6, 'length')
        obj(f['forces'], ' '.join(FORCES), 'force polynomials')
        for c in f['forces'].values():
            if c is not None:
                if type(c) is not list or not 1 <= len(c) <= 3:fail('INVALID_INPUT', 'Uniform-load force polynomial degree at most two.')
                for v in c:number(v, -1e15, 1e15, 'force coefficient')
        if f['forces']['nN'] is None:fail('INVALID_INPUT', 'Axial field required.')
        present = [f['forces'][key] is not None for key in FORCES[1:]]
        if any(present) and not all(present):
            fail('INCOMPLETE_FORCE_FIELD', 'A frame needs all six force components, including explicit zeros. Only a purely axial element may omit all five transverse components; missing results are not zero loads.')
        force_models.add('frame' if all(present) else 'axial')
    if len(force_models) != 1:
        fail('INCONSISTENT_FORCE_MODEL', 'One original member cannot mix frame and axial-only result fields.')
    fields = sorted(fields, key=lambda f:f['offset_m'])
    cursor = 0.
    for f in fields:
        if not math.isclose(f['offset_m'], cursor, rel_tol=1e-12, abs_tol=1e-10):fail('DISCONNECTED_MODEL', 'Original piece segments must be contiguous and complete.')
        cursor += f['length_m']
    capacities = {}
    if critical['compression']:capacities['compression'] = compression_mrd(s['area_m2']*s['fy_pa'], critical['compression'])
    if tension:capacities['tension'] = tension_resistance(s['area_m2'], s['fy_pa'], s['fu_pa'], tension)
    for axis in ('y', 'z'):
        for sign in ('positive', 'negative'):
            key = f'm{axis}_{sign}'
            if critical[key]:capacities[key] = bending_mrd(s[f'w{axis}_m3']*s['fy_pa'], critical[key])
    if web['unstiffened_single_web']:capacities['shear_z'] = shear_unstiffened(s['e_pa'], s['fy_pa'], web['flat_height_m'], web['thickness_m'])
    checks = []
    def blocked(key, reason):checks.append(dict(id=key, status='BLOCKED', reason=reason, utilization=None, governing=None))
    def emit(key, demand, capacity, governing, clause):
        if capacity is None:return blocked(key, 'Required capacity/elastic critical data missing.')
        ratio = demand/capacity
        dependencies=[]
        if key in ('compression','my_positive','my_negative','mz_positive','mz_negative','combined-9.9'):
            dependencies.append('cFSM eigenvalues were computed in explicit modal spaces and a finite half-wave domain; completeness beyond that domain and complete physical-mode applicability are not certified.' if key in _computed_modes else 'Elastic critical values/mode minima are externally declared, not computationally verified by this execution.')
        if key in ('tension','combined-9.9') and tension:
            dependencies.append('Net areas/Ct or the all-elements-welded hypothesis are externally declared; complete member-hole/cutout/weld geometry is not verified.')
        checks.append(dict(id=key, status='FAIL' if ratio>1 else 'CONDITIONAL' if dependencies else 'PASS', demand=demand, resistance=capacity,
                           utilization=ratio, governing=governing, clauses=clause,conditional_dependencies=dependencies))
    def point(f, u):
        return dict(segment_id=f['segment_id'], position_m=f['offset_m']+u*f['length_m'],
                    segment_position_m=u*f['length_m'], combination_id=raw['combination_id'],
                    forces={k:evaluate(c, u) if c is not None else None for k,c in f['forces'].items()})
    # Fixed machine-roundoff guard, NOT a load/resistance percentage tolerance.
    scales = {k:max([abs(a) for f in fields for a in (f['forces'][k] or [])] or [0.]) for k in FORCES}
    eps = {k:128*np.finfo(float).eps*max(1., scales[k]) for k in FORCES}
    extrema = {}
    for key in FORCES:
        candidates = [point(f,u) for f in fields if f['forces'][key] is not None
                      for u in [0.,1.,*roots(np.polynomial.polynomial.polyder(f['forces'][key]))]]
        extrema[key] = candidates
    n_values=[p['forces']['nN'] for p in extrema['nN']]
    constant_n=max(n_values)-min(n_values)<=eps['nN']
    if raw['study']['minimum_search']=='not-required-pure-tension':
        if any(v is not None for v in critical.values()) or min(n_values)<-eps['nN'] or any(abs(p['forces'][k])>eps[k] for k in FORCES[1:] for p in extrema[k]):
            fail('UNSUPPORTED_LOAD_STATE','Pure-tension exemption cannot cover compression, bending, torsion or shear.')
    for key, component, sign in [('compression','nN',-1), ('tension','nN',1),
                                  ('my_positive','myNm',1), ('my_negative','myNm',-1),
                                  ('mz_positive','mzNm',1), ('mz_negative','mzNm',-1)]:
        candidates = extrema[component]
        if not candidates:continue
        p = max(candidates, key=lambda p:sign*p['forces'][component]);demand=max(0., sign*p['forces'][component])
        if demand <= eps[component]:continue
        if key=='compression' and not constant_n:
            blocked(key,'This C.3 implementation requires uniform axial compression along the original member.');continue
        cap = capacities.get(key)
        emit(key, demand, cap['design'] if cap else None, p, cap['clauses'] if cap else [])
    if extrema['vzN']:
        p = max(extrema['vzN'], key=lambda p:abs(p['forces']['vzN']));demand=abs(p['forces']['vzN'])
        if demand > eps['vzN']:
            cap=capacities.get('shear_z');emit('shear_z',demand,cap['design'] if cap else None,p,['9.8.3'])
    for key in ('vyN', 'tNm'):
        if any(abs(p['forces'][key]) > eps[key] for p in extrema[key]):blocked('unsupported-'+key, 'Minor-axis shear/warping torsion procedure is not implemented.')
    if any(abs(p['forces']['vzN']) > eps['vzN'] for p in extrema['vzN']) and any(abs(p['forces']['myNm']) > eps['myNm'] for p in extrema['myNm']):
        blocked('bending-shear-9.8.4', '9.8.4 requires the 9.8.2.1 effective-section capacity; it is not silently replaced by an Annex C capacity.')
    # 9.9: N must be constant along the ORIGINAL member. Recover simultaneous
    # vectors at extrema of the actual piecewise interaction, never an envelope.
    if not constant_n:
        blocked('combined-9.9','9.9 assumes constant axial force along the member; nonconstant N is outside this procedure.')
    elif any(abs(p['forces']['myNm'])>eps['myNm'] for p in extrema['myNm']) or any(abs(p['forces']['mzNm'])>eps['mzNm'] for p in extrema['mzNm']):
        governing=[];missing=False
        for f in fields:
            poly=f['forces'];cuts=sorted(set([0.,1.,*roots(poly['nN']),*roots(poly['myNm'] or [0]),*roots(poly['mzNm'] or [0])]))
            for left,right in zip(cuts,cuts[1:]):
                mid=(left+right)/2;c=np.zeros(3)
                for component in ('nN','myNm','mzNm'):
                    q=poly[component] or [0.];v=evaluate(q,mid)
                    if max(map(abs,q))<=eps[component]:continue
                    key=('tension' if v>=0 else 'compression') if component=='nN' else component[:2]+'_'+('positive' if v>=0 else 'negative')
                    cap=capacities.get(key)
                    if cap is None:missing=True;continue
                    c[:len(q)]+=np.array(q)*(1. if v>=0 else -1.)/cap['design']
                for u in [left,right,*[u for u in roots(np.polynomial.polynomial.polyder(c)) if left<u<right]]:
                    governing.append((evaluate(c,u),point(f,u)))
        if missing:blocked('combined-9.9','One or more concomitant sign/axis capacities missing.')
        else:
            ratio,p=max(governing,key=lambda p:p[0]);emit('combined-9.9',ratio,1.,p,['9.9'])
    # Compression geometric slenderness limit from 9.7.4; separate from lambda0.
    if any(p['forces']['nN'] < -eps['nN'] for p in extrema['nN']):
        geometric=max(s['effective_length_y_m']/math.sqrt(s['iy_m4']/s['area_m2']), s['effective_length_z_m']/math.sqrt(s['iz_m4']/s['area_m2']))
        emit('compression-slenderness',geometric,200.,None,['9.7.4'])
    if not checks:blocked('no-demand','No nonzero design demand in this combination.')
    if any(not math.isfinite(x['design']) or x['design']<=0 for x in capacities.values()):fail('NUMERICAL_FAILURE','Nonpositive/nonfinite resistance.')
    return dict(schema_version='jpn.coldformed-design-result/2', units='SI', input_sha256=input_hash(raw),
                binding=raw['binding'], piece_id=raw['piece_id'], combination_id=raw['combination_id'], standard=STANDARD,
                evaluator_version='jpn.nbr14762-mrd/2', capacities=capacities, checks=checks,
                status='FAIL' if any(c['status']=='FAIL' for c in checks) else 'BLOCKED' if any(c['status']=='BLOCKED' for c in checks) else ('CONDITIONAL-MODEL-LIMITS' if _computed_modes else 'CONDITIONAL-EXTERNAL-INPUTS') if any(c['status']=='CONDITIONAL' for c in checks) else 'PASS-IMPLEMENTED-CHECKS',
                member_all_limit_states_verified=False, computed_structural_approval=False, approved_for_fabrication=False,
                remaining=['Connections/net-section provenance and load introduction/web crippling are not fully verified.',
                           'Complete normative action/combination and global stability validation remain separate.',
                           'C.5 effective inertia is not substituted silently into the gross-section displacement field.'])
