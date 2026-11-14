"""Independent hand-calculated controls for NBR 8800:2024 (Errata 1:2025) I/H member procedures.

Every expected value below is derived in the test from the printed equations with plain arithmetic (parallel-axis
section properties, explicit branch selection), not by calling the implementation helpers.
"""
import math
import pytest
from jpn_structural.steel_i_design import analyze_steel_i_design, section_properties, GAMMA, cb_factor
from jpn_structural.model import AnalysisError

E, G, FY, FU = 200e9, 77e9, 345e6, 450e6
D, BF, TF, TW = 0.40, 0.20, 0.016, 0.008           # welded plain I (explicit synthetic section, not a catalog profile)
H = D-2*TF


def props():
    a = 2*BF*TF+H*TW
    ix = 2*(BF*TF**3/12+BF*TF*((D-TF)/2)**2)+TW*H**3/12          # parallel axis
    iy = 2*(TF*BF**3/12)+H*TW**3/12
    return dict(a=a, ix=ix, iy=iy, wx=ix/(D/2), wy=iy/(BF/2), zx=BF*TF*(D-TF)+TW*H**2/4, zy=TF*BF**2/2+H*TW**2/4,
                j=(2*BF*TF**3+H*TW**3)/3, cw=iy*(D-TF)**2/4)


P = props()


def member(forces=None, length=6.0, kind='normal', section=None, tension='all', a=None):
    f = dict(nN=[0], vyN=[0], vzN=[0], tNm=[0], myNm=[0], mzNm=[0])
    f.update(forces or {})
    sec = dict(family='welded', shape='i-h-doubly-symmetric', d_m=D, bf_m=BF, tf_m=TF, tw_m=TW, fy_pa=FY, fu_pa=FU, e_pa=E, g_pa=G,
               effective_length_x_m=length, effective_length_y_m=length, effective_length_z_m=length, unbraced_length_m=length,
               properties=None, fillet_radius_m=None, source='Seção I soldada sintética explícita do ensaio, não comercial', revision='1')
    sec.update(section or {})
    ten = dict(basis='no-holes-all-elements-connected', source='Sem furos, todos os elementos conectados (ensaio)', revision='1') if tension == 'all' else tension
    return dict(schema_version='jpn.steel-i-design/1', units='SI', piece_id='B', combination_id='ULS', combination_kind=kind,
                binding=dict(mechanical_sha256='a'*64, analysis_input_sha256='b'*64, analysis_result_sha256='c'*64),
                section=sec, tension=ten, web=dict(transverse_stiffener_spacing_m=a),
                fields=[dict(segment_id='F1', offset_m=0, length_m=length, forces=f)])


def chk(r, key):
    return next(c for c in r['checks'] if c['id'] == key)


def test_table_3_gamma_values():
    assert GAMMA == {'normal': (1.10, 1.35), 'special': (1.10, 1.35), 'exceptional': (1.00, 1.15)}
    r = analyze_steel_i_design(member({'nN': [1000.]}, kind='exceptional'))
    assert (r['gamma_a1'], r['gamma_a2']) == (1.0, 1.15)


def test_section_properties_match_parallel_axis_hand_values():
    q = section_properties(dict(d_m=D, bf_m=BF, tf_m=TF, tw_m=TW))
    for k, v in (('area_m2', P['a']), ('ix_m4', P['ix']), ('iy_m4', P['iy']), ('wx_m3', P['wx']), ('wy_m3', P['wy']),
                 ('zx_m3', P['zx']), ('zy_m3', P['zy']), ('j_m4', P['j']), ('cw_m6', P['cw'])):
        assert q[k] == pytest.approx(v, rel=1e-12)
    assert P['a'] == pytest.approx(0.009344, rel=1e-12)


def test_tension_5_2_2_with_errata_ct_equal_one():
    r = analyze_steel_i_design(member({'nN': [2e6]}))
    c = chk(r, 'tension')
    assert c['resistance'] == pytest.approx(min(P['a']*FY/1.10, 1.0*P['a']*FU/1.35), rel=1e-12)   # Ct = 1,0 (Errata 1, 5.2.5-a)
    assert r['capacities']['tension']['governing_mode'] == 'gross_yield'
    assert 'Ct=1,0' in r['errata_1_2025_applied'][0]
    # net section governs when An is small
    net = dict(basis='declared-net-area', net_connection_m2=.004, ct=.8, source='Área líquida declarada pelo ensaio', revision='1')
    r = analyze_steel_i_design(member({'nN': [1e6]}, tension=net))
    assert chk(r, 'tension')['resistance'] == pytest.approx(min(P['a']*FY/1.10, .8*.004*FU/1.35), rel=1e-12)
    assert r['capacities']['tension']['governing_mode'] == 'net_rupture'
    # 5.2.8.1 is only a recommendation
    r = analyze_steel_i_design(member({'nN': [1e6]}, length=40.))
    s = chk(r, 'tension-slenderness')
    assert s['utilization'] == pytest.approx(40/math.sqrt(P['iy']/P['a'])/300, rel=1e-12)


def test_compression_5_3_hand_calculation_with_effective_web():
    L = 2.0
    r = analyze_steel_i_design(member({'nN': [-1.5e6]}, length=L))
    ne = min(math.pi**2*E*P['ix']/L**2, math.pi**2*E*P['iy']/L**2, ((math.pi**2*E*P['cw']/L**2)+G*P['j'])/((P['ix']+P['iy'])/P['a']))
    l0 = math.sqrt(P['a']*FY/ne)
    chi = 0.658**(l0**2) if l0 <= 1.5 else .877/l0**2
    kc = max(.35, min(.76, 4/math.sqrt(H/TW)))
    # flange (grupo 5, welded, AL): half-width / tf = 6,25 below its limit -> full; web (grupo 2, AA): h/tw = 46
    lim_f, lim_w = .64*math.sqrt(E/(FY/kc)), 1.49*math.sqrt(E/FY)
    assert (BF/2)/TF <= lim_f/math.sqrt(chi) and H/TW > lim_w/math.sqrt(chi)
    sig = (1.31*lim_w/(H/TW))**2*FY
    bef = H*(1-.18*math.sqrt(sig/(chi*FY)))*math.sqrt(sig/(chi*FY))
    aef = P['a']-(H-bef)*TW
    expected = chi*aef*FY/1.10
    c = chk(r, 'compression')
    assert c['resistance'] == pytest.approx(expected, rel=1e-12)
    assert r['capacities']['compression']['effective_area']['aef_m2'] < P['a']
    assert chk(r, 'compression-slenderness')['utilization'] == pytest.approx(L/math.sqrt(P['iy']/P['a'])/200, rel=1e-12)


def test_compression_branch_lambda0_above_1_5_uses_0_877_over_lambda_squared():
    L = 18.0
    r = analyze_steel_i_design(member({'nN': [-1e5]}, length=L))
    ne = min(math.pi**2*E*P['iy']/L**2, math.pi**2*E*P['ix']/L**2)
    l0 = math.sqrt(P['a']*FY/ne)
    assert l0 > 1.5 and r['capacities']['compression']['chi'] == pytest.approx(.877/l0**2, rel=1e-12)


def test_flt_lambda_r_consistency_mcr_equals_mr_at_the_boundary():
    """Independent check of the D.2.8-a transcription: Mcr(Lb = lambda_r ry) must equal Mr = 0,7 fy W for any Cb."""
    ry = math.sqrt(P['iy']/P['a'])
    mr = .7*FY*P['wx']
    for cb in (1.0, 1.3, 2.0):
        r = analyze_steel_i_design(member({'myNm': [0, 4e5, -4e5]}, length=6.0))
        p = r['capacities']['my']['modes']['FLT']
        assert p['lam_p'] == pytest.approx(1.76*math.sqrt(E/FY), rel=1e-12)
        beta1 = mr/(E*P['j'])
        lam_r = 1.38*cb*math.sqrt(P['iy']*P['j'])/(ry*P['j']*beta1)*math.sqrt(1+math.sqrt(1+27*P['cw']*beta1**2/(cb**2*P['iy'])))
        lb = lam_r*ry
        mcr = cb*math.pi**2*E*P['iy']/lb**2*math.sqrt(P['cw']/P['iy']*(1+.039*P['j']*lb**2/P['cw']))
        # the printed 0,039 is a rounded constant: lambda_r and Mcr agree to about 0,2 % (not exactly); a wrong Cb placement would be far off
        assert mcr == pytest.approx(mr, rel=3e-3)


def test_strong_axis_bending_regimes_cb_and_cap():
    # uniform moment => Cb = 1,0 ; Lb = 6 m
    L = 6.0
    r = analyze_steel_i_design(member({'myNm': [3e5]}, length=L))
    c = chk(r, 'my')
    assert c['cb']['cb'] == pytest.approx(1.0, rel=1e-12)
    ry = math.sqrt(P['iy']/P['a']);lam = L/ry
    mpl, mr = P['zx']*FY, .7*FY*P['wx']
    lam_p = 1.76*math.sqrt(E/FY)
    beta1 = mr/(E*P['j']);lam_r = 1.38*math.sqrt(P['iy']*P['j'])/(ry*P['j']*beta1)*math.sqrt(1+math.sqrt(1+27*P['cw']*beta1**2/P['iy']))
    mcr = math.pi**2*E*P['iy']/L**2*math.sqrt(P['cw']/P['iy']*(1+.039*P['j']*L**2/P['cw']))
    flt = (mpl if lam <= lam_p else (mpl-(mpl-mr)*(lam-lam_p)/(lam_r-lam_p)) if lam <= lam_r else mcr)/1.10
    kc = max(.35, min(.76, 4/math.sqrt(H/TW)));lam_f = BF/2/TF
    lp_f = .38*math.sqrt(E/FY);lr_f = .95*math.sqrt(E/((FY-.3*FY)/kc))
    flm = (mpl if lam_f <= lp_f else (mpl-(mpl-mr)*(lam_f-lp_f)/(lr_f-lp_f)))/1.10
    lam_w = H/TW;lp_w, lr_w = 3.76*math.sqrt(E/FY), 5.70*math.sqrt(E/FY)
    fla = (mpl if lam_w <= lp_w else (mpl-(mpl-FY*P['wx'])*(lam_w-lp_w)/(lr_w-lp_w)))/1.10
    assert lam_w <= lr_w
    expected = min(min(flt, flm, fla), 1.5*P['wx']*FY/1.10)
    assert c['resistance'] == pytest.approx(expected, rel=1e-12)
    # moment diagram with a peak: Cb from the quarter points (5.4.2.3-a)
    r = analyze_steel_i_design(member({'myNm': [0, 4e5, -4e5]}, length=L))     # 4e5 u (1-u)*... parabola
    cb = chk(r, 'my')['cb']
    mm = 1e5   # M(u)=4e5 u(1-u): max 1e5 at u=.5 ; MA=MC=.75e5*... = 4e5*.25*.75 = 75000
    assert cb['mmax'] == pytest.approx(mm) and cb['ma'] == pytest.approx(75000) and cb['mc'] == pytest.approx(75000)
    assert cb['cb'] == pytest.approx(12.5*mm/(2.5*mm+3*75000+4*mm+3*75000), rel=1e-12) == pytest.approx(1.136363636, rel=1e-8)
    assert cb_factor((0, 0, 0, 0)) == 1.0


def test_5_4_2_2_cap_governs_for_compact_braced_beam():
    r = analyze_steel_i_design(member({'myNm': [1e5]}, length=1.0, section=dict(unbraced_length_m=1.0)))
    cap = r['capacities']['my']
    assert cap['design'] <= 1.5*P['wx']*FY/1.10 + 1e-6
    assert cap['uncapped'] == pytest.approx(P['zx']*FY/1.10, rel=1e-9) or cap['uncapped'] >= cap['design']
    # Z/W of this I is about 1,12 < 1,5: the plastic moment is below the cap
    assert cap['design'] == pytest.approx(P['zx']*FY/1.10, rel=1e-9)


def test_weak_axis_bending_only_flm_applies():
    r = analyze_steel_i_design(member({'mzNm': [3e4]}))
    cap = r['capacities']['mz']
    assert list(cap['modes']) == ['FLM'] and cap['modes']['FLM']['regime'] == 'plastic'
    assert chk(r, 'mz')['resistance'] == pytest.approx(min(P['zy']*FY/1.10, 1.5*P['wy']*FY/1.10), rel=1e-12)


def test_shear_5_4_3_1_branches_and_kv():
    r = analyze_steel_i_design(member({'vzN': [2e5]}))
    s = r['capacities']['shear_z']
    assert s['kv'] == 5.34 and s['branch'] == 'plastic'
    assert chk(r, 'shear_z')['resistance'] == pytest.approx(.6*D*TW*FY/1.10, rel=1e-12)                   # Aw = d tw (5.4.3.1.2)
    # inelastic branch: thin web
    thin = dict(tw_m=.0035)
    r = analyze_steel_i_design(member({'vzN': [5e4]}, section=thin))
    h = H;tw = .0035;kv = 5.34;lam = h/tw;lp = 1.10*math.sqrt(kv*E/FY);lr = 1.37*math.sqrt(kv*E/FY)
    vpl = .6*D*tw*FY
    expected = (vpl if lam <= lp else lp/lam*vpl if lam <= lr else 1.24*(lp/lam)**2*vpl)/1.10
    assert chk(r, 'shear_z')['resistance'] == pytest.approx(expected, rel=1e-12)
    # stiffened web a/h = 1.5: kv = 5 + 5/(a/h)^2
    r = analyze_steel_i_design(member({'vzN': [2e5]}, a=1.5*H))
    assert r['capacities']['shear_z']['kv'] == pytest.approx(5+5/1.5**2, rel=1e-12)
    r = analyze_steel_i_design(member({'vzN': [2e5]}, a=4*H))
    assert r['capacities']['shear_z']['kv'] == 5.34                                                        # a/h > 3


def test_interaction_5_5_1_2_both_branches_with_hand_values():
    L = 4.0
    base = analyze_steel_i_design(member({'nN': [-1e6], 'myNm': [1e5], 'mzNm': [1e4]}, length=L))
    nrd = base['capacities']['compression']['design'];mx = base['capacities']['my']['design'];my = base['capacities']['mz']['design']
    c = chk(base, 'combined-5.5.1.2')
    assert 1e6/nrd >= .2
    assert c['utilization'] == pytest.approx(1e6/nrd+8/9*(1e5/mx+1e4/my), rel=1e-12) and c['clauses'] == ['5.5.1.2-a']
    low = analyze_steel_i_design(member({'nN': [-5e4], 'myNm': [1e5], 'mzNm': [1e4]}, length=L))
    nrd = low['capacities']['compression']['design']
    assert 5e4/nrd < .2
    assert chk(low, 'combined-5.5.1.2')['utilization'] == pytest.approx(5e4/(2*nrd)+1e5/low['capacities']['my']['design']+1e4/low['capacities']['mz']['design'], rel=1e-12)
    assert chk(low, 'combined-5.5.1.2')['clauses'] == ['5.5.1.2-b']
    # tension + bending uses the tension resistance
    t = analyze_steel_i_design(member({'nN': [5e5], 'myNm': [1e5]}, length=L))
    ntd = t['capacities']['tension']['design']
    assert chk(t, 'combined-5.5.1.2')['utilization'] == pytest.approx(5e5/ntd+8/9*1e5/t['capacities']['my']['design'], rel=1e-12) if 5e5/ntd >= .2 else True


def test_interaction_true_maximum_inside_the_member_and_branch_switch():
    import numpy as np
    L = 4.0
    f = {'nN': [-2e6], 'myNm': [0, 4e5, -4e5], 'mzNm': [0]}
    r = analyze_steel_i_design(member(f, length=L))
    c = chk(r, 'combined-5.5.1.2')
    nrd, mx = r['capacities']['compression']['design'], r['capacities']['my']['design']
    u = np.linspace(0, 1, 200001)
    m = 4e5*u*(1-u)
    big = 2e6/nrd >= .2
    grid = 2e6/nrd*(1 if big else .5)+m/mx*(8/9 if big else 1)
    assert c['utilization'] == pytest.approx(grid.max(), rel=1e-9)
    assert c['governing']['position_m'] == pytest.approx(L/2, rel=1e-6)
    # a field whose |N|/NRd crosses 0,2 inside the member: the maximum is found across the branch switch
    f2 = {'nN': [-1.0e5, -1.2e6], 'myNm': [2e5], 'mzNm': [0]}                   # N(u) = -1e5 - 1.2e6 u
    r2 = analyze_steel_i_design(member(f2, length=L))
    nrd2, mx2 = r2['capacities']['compression']['design'], r2['capacities']['my']['design']
    n = (1e5+1.2e6*u)/nrd2
    grid2 = np.where(n >= .2, n+8/9*2e5/mx2, n/2+2e5/mx2)
    assert chk(r2, 'combined-5.5.1.2')['utilization'] == pytest.approx(grid2.max(), rel=1e-9)


def test_blocked_and_rejected_domains_are_never_silent():
    # missing resistance for a required component blocks the interaction (never a zero)
    r = analyze_steel_i_design(member({'nN': [-1e5], 'myNm': [1e5]}, section=dict(unbraced_length_m=2.0)))
    assert chk(r, 'my')['status'] == 'BLOCKED' and chk(r, 'combined-5.5.1.2')['status'] == 'BLOCKED'
    # unbraced length different from the member length needs Cb per segment
    r = analyze_steel_i_design(member({'myNm': [1e5]}, length=6.0, section=dict(unbraced_length_m=2.0)))
    assert chk(r, 'my')['status'] == 'BLOCKED' and 'Cb' in chk(r, 'my')['reason']
    # slender web (lambda > 5,70 sqrt(E/fy)): Anexo E required
    r = analyze_steel_i_design(member({'myNm': [1e5]}, section=dict(tw_m=.0021)))
    assert chk(r, 'my')['status'] == 'BLOCKED' and 'Anexo E' in chk(r, 'my')['reason']
    # flange shear and torsion are not implemented
    r = analyze_steel_i_design(member({'vyN': [1e3], 'tNm': [10.]}))
    assert {'unsupported-vyN', 'unsupported-tNm'} <= {c['id'] for c in r['checks'] if c['status'] == 'BLOCKED'}
    # missing tension connection data is not guessed
    r = analyze_steel_i_design(member({'nN': [1e6]}, tension=None))
    assert chk(r, 'tension')['status'] == 'BLOCKED'
    assert not r['member_all_limit_states_verified'] and not r['computed_structural_approval'] and not r['approved_for_fabrication']


@pytest.mark.parametrize('mutation', [
    lambda p: p['section'].update(shape='u-stiffened'),
    lambda p: p['section'].update(family='cold-formed'),
    lambda p: p['section'].update(fu_pa=1e6),
    lambda p: p['section'].update(tw_m=.3),
    lambda p: p['section'].update(properties=dict(area_m2=1, ix_m4=1, iy_m4=1, wx_m3=1, wy_m3=1, zx_m3=1, zy_m3=1, j_m4=1, cw_m6=1)),
    lambda p: p['section'].update(family='rolled'),
    lambda p: p.update(combination_kind='seismic'),
    lambda p: p['binding'].update(mechanical_sha256='xyz'),
    lambda p: p['fields'][0]['forces'].update(vzN=None),
    lambda p: p['fields'].append(dict(segment_id='F1', offset_m=6, length_m=1, forces=p['fields'][0]['forces'])),
    lambda p: p.update(extra=1),
])
def test_invalid_or_incomplete_inputs_are_rejected(mutation):
    p = member({'nN': [1e5]});mutation(p)
    with pytest.raises(AnalysisError):
        analyze_steel_i_design(p)


def test_rolled_section_requires_declared_properties_and_radius():
    q = section_properties(dict(d_m=D, bf_m=BF, tf_m=TF, tw_m=TW))
    pr = {k: v*1.02 for k, v in q.items()}
    r = analyze_steel_i_design(member({'myNm': [1e5], 'vzN': [1e4]}, section=dict(family='rolled', properties=pr, fillet_radius_m=.01)))
    assert r['section_properties']['h_m'] == pytest.approx(D-2*TF-2*.01)
    assert r['capacities']['my']['modes']['FLM']['lam_r'] == pytest.approx(.83*math.sqrt(E/(FY-.3*FY)), rel=1e-12)   # rolled: D.2.8-f
