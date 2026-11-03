"""Independent arithmetic controls, branch limits and true interaction extrema."""
from decimal import Decimal, localcontext
import math
import pytest
from jpn_structural.coldformed_design import (compression_mrd,bending_mrd,effective_inertia_mrd,
    tension_resistance,shear_unstiffened,analyze_coldformed_design)
from jpn_structural.model import AnalysisError


def triplet(a,b,c):return {'global':a,'local':b,'distortional':c}


def member():
    return dict(schema_version='jpn.coldformed-design/1',units='SI',piece_id='B',combination_id='ULS',
        binding=dict(mechanical_sha256='a'*64,analysis_input_sha256='b'*64,analysis_result_sha256='c'*64),
        section=dict(family='cold-formed',shape='u-stiffened',area_m2=.001,fy_pa=100e6,fu_pa=150e6,e_pa=200e9,
            iy_m4=1e-5,iz_m4=2e-6,wy_m3=1e-4,wz_m3=5e-5,effective_length_y_m=2,effective_length_z_m=2,
            source='Explicit synthetic mathematical reference, not a commercial section',revision='1'),
        study=dict(source='Independent explicit critical-load control',revision='1',responsible='Synthetic test',basis_sha256='a'*64,
            boundary_and_load_pattern='Declared pinned uniform-stress reference; no manufactured steel assumption',minimum_search='reviewed-elastic-mode-minima'),
        critical={k:triplet(1e12,1e12,1e12) for k in ['compression','my_positive','my_negative','mz_positive','mz_negative']},
        tension=dict(basis='declared-net-areas',net_outside_m2=.001,net_connection_m2=.001,ct=1,source='Explicit synthetic full section',revision='1'),
        web=dict(flat_height_m=.1,thickness_m=.002,unstiffened_single_web=True),
        fields=[dict(segment_id='F1',offset_m=0,length_m=2,forces=dict(nN=[-10000],vyN=[0],vzN=[0],tNm=[0],myNm=[0,40000,-40000],mzNm=[0]))])


def test_compression_independent_hand_constructed_all_modes():
    # lambda0=1 => Ng=65800; lambda_local=1 => Nl=.85*65800;
    # lambda_dist=1 => Nd=.75*100000. No implementation helper is the oracle.
    x=compression_mrd(100000,triplet(100000,65800,100000))
    assert x['modes']==pytest.approx(dict(global_=65800,local=55930,distortional=75000))
    assert x['design']==pytest.approx(46608.333333333333)
    assert x['governing_mode']=='local'


@pytest.mark.parametrize('l0',[.1,1.5,math.nextafter(1.5,math.inf),2.,100.])
def test_compression_branches_against_50_digit_decimal(l0):
    with localcontext() as ctx:
        ctx.prec=50;P=Decimal('100000');Ne=P/Decimal(str(l0))**2
        expected=P*Decimal('.658')**(P/Ne) if l0<=1.5 else Decimal('.877')*Ne
    r=compression_mrd(100000,triplet(float(Ne),1e15,1e15))
    assert r['modes']['global_']==pytest.approx(float(expected),rel=3e-14)


def test_bending_independent_exact_ratios_and_sls_no_gamma():
    r=bending_mrd(10000,triplet(10000,8014.2,10000))
    assert r['modes']==pytest.approx(dict(global_=8014.2,local=6812.07,distortional=7800))
    assert r['design']==pytest.approx(6192.790909090909)
    assert effective_inertia_mrd(1e-5,10000,triplet(10000,8014.2,10000))==pytest.approx(6.81207e-6)
    assert effective_inertia_mrd(1e-5,0,triplet(10000,8014.2,10000))==1e-5


@pytest.mark.parametrize('l0',[.6,.60001,1.,1.33599,1.336,2.])
def test_bending_global_boundaries_preserve_normative_piecewise_coefficients(l0):
    ne=10000/l0**2;ratio=10000/ne
    expected=10000 if math.sqrt(ratio)<=.6 else 1.11*(1-.278*ratio)*10000 if math.sqrt(ratio)<1.336 else ne
    r=bending_mrd(10000,triplet(ne,1e15,1e15))
    assert r['modes']['global_']==pytest.approx(expected,rel=1e-14)


def test_tension_net_outside_connection_shear_three_branches_and_units():
    r=tension_resistance(.001,250e6,400e6,dict(net_outside_m2=.0009,net_connection_m2=.0008,ct=.8))
    assert r['design']==pytest.approx(155151.51515151514)
    assert r['governing_mode']=='net_connection'
    for h,branch in [(.1,'yield'),(.16,'inelastic-buckling'),(.5,'elastic-buckling')]:
        r=shear_unstiffened(200e9,250e6,h,.002);assert r['branch']==branch
        expected=(.6*250e6*h*.002 if branch=='yield' else .65*.002**2*math.sqrt(5*250e6*200e9) if branch=='inelastic-buckling' else .905*5*200e9*.002**3/h)/1.1
        assert r['design']==pytest.approx(expected)


def test_continuous_governing_interaction_not_union_of_component_maxima_and_fail():
    raw=member();f=raw['fields'][0]['forces'];f['nN']=[0];f['myNm']=[0,10000];f['mzNm']=[5000,0,-5000]
    r=analyze_coldformed_design(raw);c=next(c for c in r['checks'] if c['id']=='combined-9.9')
    # RMy=10000/1.1, RMz=5000/1.1: utilization = 1.1*(u+1-u²).
    assert c['governing']['position_m']==pytest.approx(1.)
    assert c['utilization']==pytest.approx(1.375)
    assert c['governing']['forces']['myNm']==pytest.approx(5000)
    assert c['governing']['forces']['mzNm']==pytest.approx(3750)
    assert c['status']=='FAIL' and not r['computed_structural_approval']
    for key in ('myNm','mzNm'):f[key]=[x/2 for x in f[key]]
    r=analyze_coldformed_design(raw);c=next(c for c in r['checks'] if c['id']=='combined-9.9')
    assert c['status']=='CONDITIONAL' and c['utilization']==pytest.approx(.6875)
    assert c['conditional_dependencies']


def test_segmented_original_piece_continuity_and_critical_location():
    r=member();r['fields']=[dict(segment_id='A',offset_m=0,length_m=1,forces=dict(nN=[-10000],vyN=[0],vzN=[0],tNm=[0],myNm=[0,20000,-10000],mzNm=[0])),dict(segment_id='B',offset_m=1,length_m=1,forces=dict(nN=[-10000],vyN=[0],vzN=[0],tNm=[0],myNm=[10000,0,-10000],mzNm=[0]))]
    out=analyze_coldformed_design(r);check=next(c for c in out['checks'] if c['id']=='my_positive')
    assert check['governing']['position_m']==pytest.approx(1.)
    assert check['demand']==pytest.approx(10000)


@pytest.mark.parametrize('mutation',[lambda p:p['study'].update(basis_sha256='0'*64),lambda p:p['study'].update(minimum_search='sampled-grid'),lambda p:p['critical']['compression'].update(local=0),lambda p:p['tension'].update(ct=1.1),lambda p:p['fields'][0].update(offset_m=.5),lambda p:p['section'].update(family='rolled')])
def test_missing_invalid_or_stale_model_not_approved(mutation):
    p=member();mutation(p)
    with pytest.raises(AnalysisError):analyze_coldformed_design(p)


def test_missing_modes_torsion_variable_axial_force_and_shear_interaction_block():
    p=member();p['critical']['compression']=None;p['fields'][0]['forces'].update(tNm=[1],nN=[-10000,20],vzN=[10])
    r=analyze_coldformed_design(p);ids={c['id'] for c in r['checks'] if c['status']=='BLOCKED'}
    assert {'compression','unsupported-tNm','combined-9.9','bending-shear-9.8.4'}<=ids
    assert not r['member_all_limit_states_verified'] and not r['approved_for_fabrication']


def test_pure_tension_needs_no_fabricated_elastic_mode_and_cannot_mask_bending():
    p=member();p['study']['minimum_search']='not-required-pure-tension';p['critical']={k:None for k in p['critical']}
    p['fields'][0]['forces'].update(nN=[1000],myNm=[0])
    r=analyze_coldformed_design(p);assert r['status']=='CONDITIONAL-EXTERNAL-INPUTS'
    p['fields'][0]['forces']['myNm']=[1]
    with pytest.raises(AnalysisError,match='Pure-tension'):analyze_coldformed_design(p)


def test_connection_declaration_must_be_an_object_not_an_uncaught_attribute_error():
    p=member();p['tension']=[]
    with pytest.raises(AnalysisError,match='explicit object'):analyze_coldformed_design(p)


def test_arbitrarily_high_declared_critical_values_never_become_independent_pass():
    p=member();p['critical']={k:triplet(1e20,1e20,1e20) for k in p['critical']}
    p['fields'][0]['forces']['myNm']=[0,4000,-4000]
    out=analyze_coldformed_design(p)
    assert out['status']=='CONDITIONAL-EXTERNAL-INPUTS'
    assert all(c['status']=='CONDITIONAL' for c in out['checks'] if c['id']in ('compression','my_positive','combined-9.9'))
    assert not out['computed_structural_approval']
