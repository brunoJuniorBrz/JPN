"""NBR 8800:2024 (with Errata 1:2025) member procedures for doubly symmetric I/H sections.

SI throughout. Independent of finite-element assembly. Scope (explicit, everything else is BLOCKED):
doubly symmetric I/H, welded or rolled, local y = major axis, prismatic member, no web openings,
no transverse-force/torsion effects, web non-slender (lambda <= lambda_r, otherwise Annex E is required).

Clauses implemented (page numbers are the printed pages of the supplied copy):
  5.2.2 / 5.2.5-a (Ct = 1,0 per Errata 1)   tension                     p.39-40
  5.2.8.1                                    L/r <= 300 recommendation    p.44
  5.3.2-5.3.5.1, Tabelas 4-5                 compression (chi, Aef, Ne)   p.45-49
  5.3.7.1                                    KL/r <= 200 recommendation   p.52
  5.4.2.2-5.4.2.3, Anexo D (D.2.1, D.2.2, Tabela D.1, D.2.8-a/e/f/h)  bending FLT/FLM/FLA   p.54, 137-146
  5.4.3.1                                    shear, strong-axis web       p.57-58
  5.5.1.2                                    axial force + bending        p.61
  4.9.2.1 / Tabela 3                         gamma_a1, gamma_a2           p.25
"""
import math
import numpy as np
from .frame3d_model import obj, number, text, input_hash, fail
from .coldformed_design import roots, evaluate

VERSION = 'jpn.steel-i-design/1'
STANDARD = 'ABNT NBR 8800:2024 (Errata 1:2025)'
FORCES = ('nN', 'vyN', 'vzN', 'tNm', 'myNm', 'mzNm')
# Tabela 3: (gamma_a1 escoamento/instabilidade, gamma_a2 ruptura)
GAMMA = {'normal': (1.10, 1.35), 'special': (1.10, 1.35), 'exceptional': (1.00, 1.15)}
SIGMA_R = 0.30           # D.2.8-e: residual stress = 30 % of fy
G_RATIO = None           # G is declared (no default invented)


def section_properties(s):
    """Idealised plain I (no fillets): used for welded sections and to audit declared values."""
    d, bf, tf, tw = s['d_m'], s['bf_m'], s['tf_m'], s['tw_m']
    h = d-2*tf
    a = 2*bf*tf+h*tw
    ix = (bf*d**3-(bf-tw)*h**3)/12
    iy = (2*tf*bf**3+h*tw**3)/12
    return dict(area_m2=a, ix_m4=ix, iy_m4=iy, wx_m3=2*ix/d, wy_m3=2*iy/bf,
                zx_m3=bf*tf*(d-tf)+tw*h*h/4, zy_m3=tf*bf*bf/2+h*tw*tw/4,
                j_m4=(2*bf*tf**3+h*tw**3)/3, cw_m6=iy*(d-tf)**2/4)


# ------------------------------------------------------------------ compression (5.3)
def kc_factor(h, tw):
    """Tabela 4, nota a: kc = 4/sqrt(h/tw), 0,35 <= kc <= 0,76."""
    return min(0.76, max(0.35, 4/math.sqrt(h/tw)))


def effective_area(s, fy, e, chi):
    """5.3.4: Aef from Tabela 4 limits and Tabela 5 factors. Flanges are AL (4 half-flanges), web is AA (group 2)."""
    h, tw, bf, tf = s['h_m'], s['tw_m'], s['bf_m'], s['tf_m']
    welded = s['family'] == 'welded'
    kc = kc_factor(h, tw)
    lim_flange = (0.64*math.sqrt(e/(fy/kc))) if welded else 0.56*math.sqrt(e/fy)    # grupo 5 (soldado) / grupo 4 (laminado)
    lim_web = 1.49*math.sqrt(e/fy)                                                  # grupo 2
    reduction, items = 0., []
    for name, b, t, lim, c1, c2, count in (('flange', bf/2, tf, lim_flange, 0.22, 1.49, 4), ('web', h, tw, lim_web, 0.18, 1.31, 1)):
        slender, limit = b/t, lim/math.sqrt(chi)
        if slender <= limit:
            bef = b
        else:
            sig_el = (c2*lim/slender)**2*fy
            bef = b*(1-c1*math.sqrt(sig_el/(chi*fy)))*math.sqrt(sig_el/(chi*fy))
        reduction += count*(b-bef)*t
        items.append(dict(element=name, b_over_t=slender, limit=lim, chi_limit=limit, b_m=b, bef_m=bef, count=count))
    ag = s['area_m2']
    return dict(aef_m2=ag-reduction, items=items, kc=kc)


def compression_resistance(s, fy, e, g, lx, ly, lz, gamma_a1):
    """5.3.2: Nc,Rd = chi Aef fy / gamma_a1; Ne = min(Nex, Ney, Nez) for doubly symmetric sections (5.3.5.1)."""
    ix, iy, cw, j = s['ix_m4'], s['iy_m4'], s['cw_m6'], s['j_m4']
    ag = s['area_m2']
    r0sq = (ix+iy)/ag                                   # x0 = y0 = 0
    nex, ney = math.pi**2*e*ix/lx**2, math.pi**2*e*iy/ly**2
    nez = (math.pi**2*e*cw/lz**2+g*j)/r0sq
    ne = min(nex, ney, nez)
    l0 = math.sqrt(ag*fy/ne)
    chi = 0.658**(l0*l0) if l0 <= 1.5 else 0.877/(l0*l0)
    ef = effective_area(s, fy, e, chi)
    nrd = chi*ef['aef_m2']*fy/gamma_a1
    modes = dict(flexure_x=nex, flexure_y=ney, torsion=nez)
    return dict(design=nrd, chi=chi, slenderness_l0=l0, ne=ne, critical_modes=modes, governing_mode=min(modes, key=modes.get),
                effective_area=ef, gamma=gamma_a1, clauses=['5.3.2', '5.3.3', '5.3.4', '5.3.5.1', 'Tabela 4', 'Tabela 5'])


def tension_resistance(ag, fy, fu, net, gamma_a1, gamma_a2):
    """5.2.2: Ag fy/gamma_a1 and Ae fu/gamma_a2 with Ae = Ct An (5.2.3); Ct = 1,0 where 5.2.5-a applies (Errata 1)."""
    ae = net['ct']*net['net_connection_m2']
    modes = dict(gross_yield=ag*fy/gamma_a1, net_rupture=ae*fu/gamma_a2)
    return dict(design=min(modes.values()), modes=modes, governing_mode=min(modes, key=modes.get), ae_m2=ae,
                clauses=['5.2.2-a', '5.2.2-b', '5.2.3'])


# ------------------------------------------------------------------ bending (Anexo D)
def flt_parameters(s, fy, e, g, lb, cb):
    """D.2.8-a, doubly symmetric I: lambda, lambda_p, lambda_r, Mr, Mcr."""
    iy, cw, j, w = s['iy_m4'], s['cw_m6'], s['j_m4'], s['wx_m3']
    ry = math.sqrt(iy/s['area_m2'])
    mr = (fy-SIGMA_R*fy)*w
    beta1 = mr/(e*j)
    lam_r = 1.38*cb*math.sqrt(iy*j)/(ry*j*beta1)*math.sqrt(1+math.sqrt(1+27*cw*beta1**2/(cb**2*iy)))
    mcr = cb*math.pi**2*e*iy/lb**2*math.sqrt(cw/iy*(1+0.039*j*lb**2/cw))
    return dict(lam=lb/ry, lam_p=1.76*math.sqrt(e/fy), lam_r=lam_r, mr=mr, mcr=mcr, ry=ry, beta1=beta1)


def _interp(mpl, mr, lam, lam_p, lam_r, mcr, gamma, allow_cr):
    if lam <= lam_p:
        return mpl/gamma, 'plastic'
    if lam <= lam_r:
        return (mpl-(mpl-mr)*(lam-lam_p)/(lam_r-lam_p))/gamma, 'inelastic'
    return (mcr/gamma, 'elastic') if allow_cr else (None, 'blocked')


def strong_axis_bending(s, fy, e, g, lb, cb, gamma_a1):
    """D.2.1 / D.2.2 / Tabela D.1 for I/H bent about the major axis: FLT, FLM, FLA. Mrd <= 1,5 W fy/gamma_a1 (5.4.2.2)."""
    w, zx = s['wx_m3'], s['zx_m3']
    mpl, mr = zx*fy, (fy-SIGMA_R*fy)*w
    modes = {}
    p = flt_parameters(s, fy, e, g, lb, cb)
    modes['FLT'] = dict(zip(('mrd', 'regime'), _interp(mpl, p['mr'], p['lam'], p['lam_p'], p['lam_r'], min(p['mcr'], 1e30), gamma_a1, True)),
                        lam=p['lam'], lam_p=p['lam_p'], lam_r=p['lam_r'], mcr=p['mcr'], cb=cb)
    # FLM, D.2.8-f/h
    lam = s['bf_m']/2/s['tf_m']
    if s['family'] == 'welded':
        kc = kc_factor(s['h_m'], s['tw_m']);lam_r = 0.95*math.sqrt(e/((fy-SIGMA_R*fy)/kc));mcr = 0.90*e*kc/lam**2*w
    else:
        lam_r = 0.83*math.sqrt(e/(fy-SIGMA_R*fy));mcr = 0.69*e/lam**2*w
    lam_p = 0.38*math.sqrt(e/fy)
    modes['FLM'] = dict(zip(('mrd', 'regime'), _interp(mpl, mr, lam, lam_p, lam_r, mcr, gamma_a1, True)), lam=lam, lam_p=lam_p, lam_r=lam_r, mcr=mcr)
    # FLA, Tabela D.1: lambda = h/tw, lambda_p = 3,76 sqrt(E/fy), lambda_r = 5,70 sqrt(E/fy), Mr = fy W; beyond lambda_r: Anexo E
    lam = s['h_m']/s['tw_m'];lam_p = 3.76*math.sqrt(e/fy);lam_r = 5.70*math.sqrt(e/fy)
    mrd, regime = _interp(mpl, fy*w, lam, lam_p, lam_r, 0., gamma_a1, False)
    modes['FLA'] = dict(mrd=mrd, regime=regime, lam=lam, lam_p=lam_p, lam_r=lam_r)
    if any(m['mrd'] is None for m in modes.values()):
        return dict(blocked='FLA: alma esbelta (lambda > lambda_r = 5,70 sqrt(E/fy)); exige o Anexo E, não implementado.', modes=modes)
    cap = 1.5*w*fy/gamma_a1
    raw = min(m['mrd'] for m in modes.values())
    return dict(design=min(raw, cap), uncapped=raw, cap_5_4_2_2=cap, modes=modes, governing_mode=min(modes, key=lambda k: modes[k]['mrd']),
                mpl=mpl, gamma=gamma_a1, clauses=['5.4.2.1', '5.4.2.2', '5.4.2.3', 'D.2.1', 'D.2.2', 'Tabela D.1', 'D.2.8-a', 'D.2.8-e', 'D.2.8-f', 'D.2.8-h'])


def weak_axis_bending(s, fy, e, gamma_a1):
    """Tabela D.1, I/H about the minor axis: only FLM applies (FLT is major-axis only, D.2.8-g; FLA is U-web only, D.2.8-c)."""
    w, zy = s['wy_m3'], s['zy_m3']
    mpl, mr = zy*fy, (fy-SIGMA_R*fy)*w
    lam = s['bf_m']/2/s['tf_m'];lam_p = 0.38*math.sqrt(e/fy)
    if s['family'] == 'welded':
        kc = kc_factor(s['h_m'], s['tw_m']);lam_r = 0.95*math.sqrt(e/((fy-SIGMA_R*fy)/kc));mcr = 0.90*e*kc/lam**2*s['wy_m3']
    else:
        lam_r = 0.83*math.sqrt(e/(fy-SIGMA_R*fy));mcr = 0.69*e/lam**2*s['wy_m3']
    mrd, regime = _interp(mpl, mr, lam, lam_p, lam_r, mcr, gamma_a1, True)
    cap = 1.5*w*fy/gamma_a1
    return dict(design=min(mrd, cap), uncapped=mrd, cap_5_4_2_2=cap, modes=dict(FLM=dict(mrd=mrd, regime=regime, lam=lam, lam_p=lam_p, lam_r=lam_r, mcr=mcr)),
                governing_mode='FLM', mpl=mpl, gamma=gamma_a1, clauses=['5.4.2.1', '5.4.2.2', 'D.2.2', 'Tabela D.1', 'D.2.8-c', 'D.2.8-e', 'D.2.8-f', 'D.2.8-h'])


def shear_resistance(s, fy, e, a_over_h, gamma_a1):
    """5.4.3.1.1-5.4.3.1.2: strong-axis shear carried by the web. kv = 5,34 without stiffeners or a/h > 3; else 5 + 5/(a/h)^2."""
    d, tw, h = s['d_m'], s['tw_m'], s['h_m']
    vpl = 0.60*d*tw*fy
    kv = 5.34 if (a_over_h is None or a_over_h > 3) else 5.0+5.0/a_over_h**2
    lam, lam_p, lam_r = h/tw, 1.10*math.sqrt(kv*e/fy), 1.37*math.sqrt(kv*e/fy)
    if lam <= lam_p:
        v, branch = vpl, 'plastic'
    elif lam <= lam_r:
        v, branch = lam_p/lam*vpl, 'inelastic'
    else:
        v, branch = 1.24*(lam_p/lam)**2*vpl, 'elastic'
    return dict(design=v/gamma_a1, characteristic=v, vpl=vpl, kv=kv, slenderness=lam, lam_p=lam_p, lam_r=lam_r, branch=branch,
                gamma=gamma_a1, clauses=['5.4.3.1.1', '5.4.3.1.2'])


def cb_factor(m):
    """5.4.2.3-a with Rm = 1 (doubly symmetric): Cb = 12,5 Mmax/(2,5 Mmax + 3 MA + 4 MB + 3 MC); quarter points of the unbraced length."""
    mmax, ma, mb, mc = m
    if mmax <= 0:
        return 1.0
    return 12.5*mmax/(2.5*mmax+3*ma+4*mb+3*mc)


def _obj_section(raw):
    obj(raw, 'family shape d_m bf_m tf_m tw_m fy_pa fu_pa e_pa g_pa effective_length_x_m effective_length_y_m effective_length_z_m unbraced_length_m '
             'properties fillet_radius_m source revision', 'section')
    if raw['shape'] != 'i-h-doubly-symmetric':
        fail('UNSUPPORTED_FAMILY', 'This procedure supports only doubly symmetric I/H (shape i-h-doubly-symmetric).')
    if raw['family'] not in ('welded', 'rolled'):
        fail('UNSUPPORTED_FAMILY', 'family must be welded or rolled.')
    for k in ('d_m', 'bf_m', 'tf_m', 'tw_m', 'fy_pa', 'fu_pa', 'e_pa', 'g_pa', 'effective_length_x_m', 'effective_length_y_m', 'effective_length_z_m', 'unbraced_length_m'):
        number(raw[k], 1e-9, 1e20, k)
    for k in ('source', 'revision'):
        text(raw[k], k)
    if raw['fu_pa'] < raw['fy_pa']:
        fail('INVALID_MATERIAL', 'fu < fy.')
    if 2*raw['tf_m'] >= raw['d_m'] or raw['tw_m'] >= raw['bf_m']:
        fail('INVALID_GEOMETRY', 'Impossible I-section dimensions.')
    s = dict(raw)
    ideal = section_properties(raw)
    h_ideal = raw['d_m']-2*raw['tf_m']
    if raw['family'] == 'welded':
        if raw['fillet_radius_m'] is not None or raw['properties'] is not None:
            fail('INVALID_INPUT', 'Welded sections use the plain-I dimensions: no radius or declared properties.')
        s.update(ideal);s['h_m'] = h_ideal
    else:
        p = raw['properties']
        if p is None or raw['fillet_radius_m'] is None:
            fail('INVALID_INPUT', 'Rolled sections require the declared section properties and the web-flange fillet radius (no catalog is inferred).')
        obj(p, 'area_m2 ix_m4 iy_m4 wx_m3 wy_m3 zx_m3 zy_m3 j_m4 cw_m6', 'properties')
        for k, v in p.items():
            number(v, 1e-30, 1e20, k)
        number(raw['fillet_radius_m'], 0, 1, 'fillet radius')
        for k in ('area_m2', 'ix_m4', 'iy_m4'):          # plausibility against the idealised I (fillets add at most a few percent)
            if not 0.9 <= p[k]/ideal[k] <= 1.3:
                fail('INCONSISTENT_PROPERTIES', f'{k} differs more than the plausible fillet effect from the declared dimensions.')
        s.update(p);s['h_m'] = h_ideal-2*raw['fillet_radius_m']
    if s['h_m'] <= 0:
        fail('INVALID_GEOMETRY', 'Non-positive web height.')
    return s


def analyze_steel_i_design(raw):
    obj(raw, 'schema_version units piece_id combination_id combination_kind binding section tension web fields', 'steel I member design')
    if raw['schema_version'] != VERSION or raw['units'] != 'SI':
        fail('UNSUPPORTED_MODEL', 'Use the explicit SI steel I/H design contract.')
    for k in ('piece_id', 'combination_id'):
        text(raw[k], k)
    if raw['combination_kind'] not in GAMMA:
        fail('INVALID_INPUT', 'combination_kind must be normal, special or exceptional.')
    g1, g2 = GAMMA[raw['combination_kind']]
    obj(raw['binding'], 'mechanical_sha256 analysis_input_sha256 analysis_result_sha256', 'binding')
    for v in raw['binding'].values():
        if type(v) is not str or len(v) != 64 or any(c not in '0123456789abcdef' for c in v):
            fail('INVALID_INPUT', 'SHA256 required.')
    s = _obj_section(raw['section'])
    fy, fu, e, g = s['fy_pa'], s['fu_pa'], s['e_pa'], s['g_pa']
    tension = raw['tension']
    if tension is not None:
        if type(tension) is not dict:
            fail('INVALID_INPUT', 'Tension connection must be an explicit object.')
        if tension.get('basis') == 'no-holes-all-elements-connected':
            obj(tension, 'basis source revision', 'full-section connection')
            tension = {**tension, 'net_connection_m2': s['area_m2'], 'ct': 1.0}          # 5.2.4.2 An = Ag; 5.2.5-a Ct = 1,0 (Errata 1)
        else:
            obj(tension, 'basis net_connection_m2 ct source revision', 'tension connection data')
            if tension['basis'] != 'declared-net-area':
                fail('UNSUPPORTED_CONNECTION', 'Explicit net-section basis required.')
            number(tension['net_connection_m2'], 1e-20, s['area_m2'], 'An');number(tension['ct'], 1e-12, 1, 'Ct')
        for k in ('source', 'revision'):
            text(tension[k], k)
    web = raw['web']
    obj(web, 'transverse_stiffener_spacing_m', 'web')
    a = web['transverse_stiffener_spacing_m']
    if a is not None:
        number(a, 1e-9, 1e6, 'a')
    fields = raw['fields']
    if type(fields) is not list or not 1 <= len(fields) <= 320:
        fail('INPUT_LIMIT', '1–320 segments required.')
    ids, models = set(), set()
    for f in fields:
        obj(f, 'segment_id offset_m length_m forces', 'continuous field');text(f['segment_id'], 'segment id')
        if f['segment_id'] in ids:
            fail('DUPLICATE_ID', 'Repeated segment.')
        ids.add(f['segment_id']);number(f['offset_m'], 0, 1e6, 'offset');number(f['length_m'], 1e-8, 1e6, 'length')
        obj(f['forces'], ' '.join(FORCES), 'force polynomials')
        for c in f['forces'].values():
            if c is not None:
                if type(c) is not list or not 1 <= len(c) <= 3:
                    fail('INVALID_INPUT', 'Force polynomial degree at most two.')
                for v in c:
                    number(v, -1e15, 1e15, 'force coefficient')
        if f['forces']['nN'] is None:
            fail('INVALID_INPUT', 'Axial field required.')
        present = [f['forces'][k] is not None for k in FORCES[1:]]
        if any(present) and not all(present):
            fail('INCOMPLETE_FORCE_FIELD', 'A frame needs all six force components, including explicit zeros.')
        models.add('frame' if all(present) else 'axial')
    if len(models) != 1:
        fail('INCONSISTENT_FORCE_MODEL', 'One original member cannot mix frame and axial-only result fields.')
    fields = sorted(fields, key=lambda f: f['offset_m'])
    cursor = 0.
    for f in fields:
        if not math.isclose(f['offset_m'], cursor, rel_tol=1e-12, abs_tol=1e-10):
            fail('DISCONNECTED_MODEL', 'Original piece segments must be contiguous and complete.')
        cursor += f['length_m']
    member_length = cursor
    scales = {k: max([abs(a_) for f in fields for a_ in (f['forces'][k] or [])] or [0.]) for k in FORCES}
    eps = {k: 128*np.finfo(float).eps*max(1., scales[k]) for k in FORCES}

    def point(f, u):
        return dict(segment_id=f['segment_id'], position_m=f['offset_m']+u*f['length_m'], segment_position_m=u*f['length_m'],
                    combination_id=raw['combination_id'], forces={k: evaluate(c, u) if c is not None else None for k, c in f['forces'].items()})
    extrema = {k: [point(f, u) for f in fields if f['forces'][k] is not None
                   for u in [0., 1., *roots(np.polynomial.polynomial.polyder(f['forces'][k]))]] for k in FORCES}
    checks = []

    def blocked(key, reason):
        checks.append(dict(id=key, status='BLOCKED', reason=reason, utilization=None, governing=None))

    def emit(key, demand, capacity, governing, clauses):
        deps = ['Section dimensions, steel properties, effective/unbraced lengths and net-area data are externally declared; the NBR 8800 professional review is pending.']
        if capacity is None:
            return blocked(key, 'Required capacity missing.')
        ratio = demand/capacity
        checks.append(dict(id=key, status='FAIL' if ratio > 1 else 'CONDITIONAL', demand=demand, resistance=capacity, utilization=ratio,
                           governing=governing, clauses=clauses, conditional_dependencies=deps))
    n_vals = [p['forces']['nN'] for p in extrema['nN']]
    constant_n = max(n_vals)-min(n_vals) <= eps['nN']
    capacities = {}
    compression_needed = any(v < -eps['nN'] for v in n_vals)
    tension_needed = any(v > eps['nN'] for v in n_vals)
    lx, ly, lz = s['effective_length_x_m'], s['effective_length_y_m'], s['effective_length_z_m']
    if compression_needed:
        capacities['compression'] = compression_resistance(s, fy, e, g, lx, ly, lz, g1)
    if tension and tension_needed:
        capacities['tension'] = tension_resistance(s['area_m2'], fy, fu, tension, g1, g2)
    # bending capacities
    my_present = any(abs(p['forces']['myNm']) > eps['myNm'] for p in extrema['myNm']) if extrema['myNm'] else False
    mz_present = any(abs(p['forces']['mzNm']) > eps['mzNm'] for p in extrema['mzNm']) if extrema['mzNm'] else False
    cb_info = None
    if my_present:
        lb = s['unbraced_length_m']
        if not math.isclose(lb, member_length, rel_tol=1e-9, abs_tol=1e-9):
            blocked('my', 'Unbraced length different from the member length needs the moment field per unbraced segment for Cb (5.4.2.3); not implemented.')
        else:
            samples = []
            for q in (0., .25, .5, .75, 1.):
                pos = q*member_length
                f = next(f for f in reversed(fields) if f['offset_m'] <= pos+1e-12)
                samples.append(abs(evaluate(f['forces']['myNm'], min(1., (pos-f['offset_m'])/f['length_m']))))
            mmax = max(abs(p['forces']['myNm']) for p in extrema['myNm'])
            cb = cb_factor((mmax, samples[1], samples[2], samples[3]))
            cb_info = dict(mmax=mmax, ma=samples[1], mb=samples[2], mc=samples[3], cb=cb, clause='5.4.2.3-a (Rm = 1,0)')
            res = strong_axis_bending(s, fy, e, g, lb, cb, g1)
            if 'blocked' in res:
                blocked('my', res['blocked'])
            else:
                capacities['my'] = res
    if mz_present:
        capacities['mz'] = weak_axis_bending(s, fy, e, g1)
    web_ratio = None if web['transverse_stiffener_spacing_m'] is None else web['transverse_stiffener_spacing_m']/s['h_m']
    shear_needed = bool(extrema['vzN']) and any(abs(p['forces']['vzN']) > eps['vzN'] for p in extrema['vzN'])
    if shear_needed:
        capacities['shear_z'] = shear_resistance(s, fy, e, web_ratio, g1)
    # --- simple checks
    if compression_needed:
        p = min(extrema['nN'], key=lambda p: p['forces']['nN'])
        emit('compression', -p['forces']['nN'], capacities['compression']['design'], p, capacities['compression']['clauses'])   # Nc,Sd = maximum compression (5.3.1)
        geometric = max(lx/math.sqrt(s['ix_m4']/s['area_m2']), ly/math.sqrt(s['iy_m4']/s['area_m2']))
        emit('compression-slenderness', geometric, 200., None, ['5.3.7.1'])           # recommendation: 5.3.7.2 lets the engineer set other limits
    if tension_needed:
        p = max(extrema['nN'], key=lambda p: p['forces']['nN'])
        emit('tension', p['forces']['nN'], capacities['tension']['design'] if 'tension' in capacities else None, p, ['5.2.2', '5.2.3', '5.2.5-a'])
        geometric = max(lx/math.sqrt(s['ix_m4']/s['area_m2']), ly/math.sqrt(s['iy_m4']/s['area_m2']))
        emit('tension-slenderness', geometric, 300., None, ['5.2.8.1'])
    if my_present and 'my' in capacities:
        p = max(extrema['myNm'], key=lambda p: abs(p['forces']['myNm']))
        emit('my', abs(p['forces']['myNm']), capacities['my']['design'], p, capacities['my']['clauses'])
        checks[-1]['cb'] = cb_info
    if mz_present:
        p = max(extrema['mzNm'], key=lambda p: abs(p['forces']['mzNm']))
        emit('mz', abs(p['forces']['mzNm']), capacities['mz']['design'], p, capacities['mz']['clauses'])
    if shear_needed:
        p = max(extrema['vzN'], key=lambda p: abs(p['forces']['vzN']))
        emit('shear_z', abs(p['forces']['vzN']), capacities['shear_z']['design'], p, capacities['shear_z']['clauses'])
    for key in ('vyN', 'tNm'):
        if extrema[key] and any(abs(p['forces'][key]) > eps[key] for p in extrema[key]):
            blocked('unsupported-'+key, 'Flange shear (5.4.3.5) and torsion (5.5.2) are not implemented for I/H.')
    # --- 5.5.1.2 interaction (true maxima of the piecewise expression)
    moments_present = my_present or mz_present
    if moments_present and (compression_needed or tension_needed):
        key_n = 'compression' if compression_needed else 'tension'
        cap_n = capacities.get(key_n)
        if cap_n is None or (my_present and 'my' not in capacities) or (mz_present and 'mz' not in capacities):
            blocked('combined-5.5.1.2', 'A required resistance (N, Mx or My) is missing.')
        else:
            nrd = cap_n['design'];mx_rd = capacities['my']['design'] if my_present else None;my_rd = capacities['mz']['design'] if mz_present else None
            gov = []
            for f in fields:
                poly = f['forces']
                dn = np.array(poly['nN'], float)
                cuts = {0., 1., *roots(poly['nN']), *roots(poly['myNm'] or [0]), *roots(poly['mzNm'] or [0])}
                for sgn in (1., -1.):   # |N| = 0,2 NRd crossings
                    q = dn.copy();q[0] -= sgn*0.2*nrd
                    cuts.update(roots(q))
                cuts = sorted(c for c in cuts if 0. <= c <= 1.)
                for left, right in zip(cuts, cuts[1:]):
                    mid = (left+right)/2
                    sn = 1. if evaluate(poly['nN'], mid) >= 0 else -1.
                    big = abs(evaluate(poly['nN'], mid))/nrd >= 0.2
                    c = np.zeros(3)
                    nterm = np.pad(np.array(poly['nN'], float), (0, 3-len(poly['nN'])))*sn/nrd
                    c += nterm*(1. if big else 0.5)
                    for comp, rd in (('myNm', mx_rd), ('mzNm', my_rd)):
                        if rd is None or not poly[comp]:
                            continue
                        sm = 1. if evaluate(poly[comp], mid) >= 0 else -1.
                        c += np.pad(np.array(poly[comp], float), (0, 3-len(poly[comp])))*sm/rd*(8/9 if big else 1.)
                    for u in [left, right, *[u for u in roots(np.polynomial.polynomial.polyder(c)) if left < u < right]]:
                        gov.append((evaluate(c, u), point(f, u), 'a' if big else 'b'))
            ratio, p, branch = max(gov, key=lambda x: x[0])
            emit('combined-5.5.1.2', ratio, 1., p, ['5.5.1.2-'+branch])
    if not checks:
        blocked('no-demand', 'No nonzero design demand in this combination.')
    status = 'FAIL' if any(c['status'] == 'FAIL' for c in checks) else 'BLOCKED' if any(c['status'] == 'BLOCKED' for c in checks) else 'CONDITIONAL-EXTERNAL-INPUTS'
    return dict(schema_version='jpn.steel-i-design-result/1', units='SI', input_sha256=input_hash(raw), binding=raw['binding'],
                piece_id=raw['piece_id'], combination_id=raw['combination_id'], combination_kind=raw['combination_kind'], standard=STANDARD,
                evaluator_version='jpn.nbr8800-i-h/1', gamma_a1=g1, gamma_a2=g2, section_properties={k: s[k] for k in (
                    'area_m2', 'ix_m4', 'iy_m4', 'wx_m3', 'wy_m3', 'zx_m3', 'zy_m3', 'j_m4', 'cw_m6', 'h_m')},
                capacities=capacities, checks=checks, status=status, errata_1_2025_applied=['5.2.5-a Ct=1,0'],
                errata_not_relevant_to_implemented_scope=['5.3.5.4.3-b (cantoneiras)', '5.4.3.1.3-c (enrijecedores: j >= 0,5)', '6.5.4-b', '6.7.2.1', 'Anexos E, G, H, I, K, L, O'],
                member_all_limit_states_verified=False, computed_structural_approval=False, approved_for_fabrication=False,
                remaining=['Web openings, flange shear, torsion, localized transverse forces (5.7), slender webs (Anexo E) and connections are not verified.',
                           'Serviceability (deflections, Anexo B) is separate.',
                           'Professional review of NBR 8800:2024 application and of the declared section/lengths is pending.'])
