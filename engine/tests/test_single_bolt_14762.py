"""Independent unit & adversarial checks for NBR 14762:2010 single-bolt subset."""
import copy
import math
import pytest
from jpn_structural.single_bolt_14762 import check_single_bolt, BoltCheckError


def example():
    return dict(schema_version='jpn.single-bolt-nbr14762/1',units='mm-MPa-N',
                connection_id='J1',combination_id='ULS-W',source='Synthetic isolated one-bolt',
                revision='1',load_source='Declared bolt demand, synthetic case',
                hypothesis='one-bolt-two-plates-concentric-single-shear-bearing-type',
                bolt=dict(diameter_mm=10.,ultimate_mpa=800.,threads_in_shear_plane=True,
                          grade_class='qualified-structural',source='Declared bolt strength',revision='1'),
                plates=[dict(id=name,thickness_mm=2.,yield_mpa=250.,ultimate_mpa=400.,
                             hole_diameter_mm=10.8,edge_in_shear_direction_mm=26.,edge_transverse_mm=26.,
                             source='Declared physical plate',revision='1') for name in ('P1','P2')],
                demand=dict(tension_n=1000.,shear_n=5000.),
                axial_member=dict(applies=False,design_resistance_n=None))


def test_independent_hand_calculation_strengths_and_interaction():
    p=example();r=check_single_bolt(p);c={i['mode']:i for i in r['checks']}
    a=math.pi*10**2/4
    ft=.75*a*800/1.35
    fv=.4*a*800/1.35
    tear=2*26*400/1.45
    bearing=(.183*2+1.53)*10*2*400/1.55
    assert c['bolt-tension']['resistance_n']==pytest.approx(ft)
    assert c['bolt-shear']['resistance_n']==pytest.approx(fv)
    assert c['P1:edge-tearout']['resistance_n']==pytest.approx(tear)
    assert c['P2:bearing']['resistance_n']==pytest.approx(bearing)
    assert c['bolt-tension-shear-interaction']['utilization']==pytest.approx((1000/ft)**2+(5000/fv)**2)
    assert r['status']=='PASS-ISOLATED-CHECKS-ONLY'
    assert not r['joint_all_limit_states_verified'] and not r['fabrication_approved']


def test_load_increase_fails_plate_and_bolt():
    p=example();p['demand']['shear_n']=30000
    r=check_single_bolt(p)
    assert r['status']=='FAIL-ISOLATED-CHECKS'
    assert any(x['status']=='FAIL' for x in r['checks'])


def test_threads_change_shear_and_unqualified_changes_interaction():
    p=example();p['bolt']['threads_in_shear_plane']=False
    a=check_single_bolt(p)
    assert next(x['resistance_n'] for x in a['checks'] if x['mode']=='bolt-shear')==pytest.approx(math.pi*25*800*.5/1.35)
    p['bolt']['grade_class']='unqualified'
    b=check_single_bolt(p)
    assert next(x['utilization'] for x in b['checks'] if x['mode']=='bolt-tension-shear-interaction')>next(x['utilization'] for x in a['checks'] if x['mode']=='bolt-tension-shear-interaction')


def test_axial_member_minimum_50_percent_is_not_ignored():
    p=example();p['axial_member']={'applies':True,'design_resistance_n':40000.}
    r=check_single_bolt(p);assert r['required_shear_n']==20000
    assert r['status']=='FAIL-ISOLATED-CHECKS'
    assert next(x['demand_n'] for x in r['checks'] if x['mode']=='bolt-shear')==20000


@pytest.mark.parametrize('mutation',[lambda p:p['plates'][0].update(thickness_mm=5),
                                    lambda p:p['plates'][0].update(hole_diameter_mm=12),
                                    lambda p:p['plates'][0].update(edge_in_shear_direction_mm=14),
                                    lambda p:p['plates'][0].update(ultimate_mpa=200),
                                    lambda p:p['plates'][1].update(id='P1'),
                                    lambda p:p['demand'].update(shear_n=-1),
                                    lambda p:p['demand'].update(tension_n=float('nan')),
                                    lambda p:p['bolt'].update(threads_in_shear_plane=1),
                                    lambda p:p.update(hypothesis='eccentric-bolts'),
                                    lambda p:p.update(unexpected=True)])
def test_unsafe_or_incomplete_models_rejected(mutation):
    p=example();mutation(p)
    with pytest.raises(BoltCheckError):check_single_bolt(p)


def test_no_load_or_axial_transfer_without_shear_rejected():
    p=example();p['demand']={'tension_n':0.,'shear_n':0.}
    with pytest.raises(BoltCheckError):check_single_bolt(p)
    p=example();p['axial_member']={'applies':True,'design_resistance_n':20000.};p['demand']={'tension_n':1000.,'shear_n':0.}
    with pytest.raises(BoltCheckError):check_single_bolt(p)


def test_round_trip_input_sha_and_comparison():
    p=example();a=check_single_bolt(p);b=check_single_bolt(copy.deepcopy(p))
    assert a==b
    p['plates'][0]['edge_in_shear_direction_mm']=27.
    assert check_single_bolt(p)['input_sha256']!=a['input_sha256']
