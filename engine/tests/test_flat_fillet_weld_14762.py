"""Independent checks for flat fillet weld equations and strict applicability."""
import pytest
from jpn_structural.flat_fillet_weld_14762 import check_flat_fillet_weld
from jpn_structural.single_bolt_14762 import BoltCheckError


def case():
    return dict(schema_version='jpn.flat-fillet-nbr14762/1',units='mm-MPa-N',connection_id='W1',
      combination_id='ULS',source='synthetic',revision='1',load_source='synthetic isolated direct load',
      hypothesis='single-flat-fillet-lap-joint-direct-concentric',length_mm=30.,leg1_mm=2.,leg2_mm=2.,
      thickness1_mm=2.,thickness2_mm=2.,base_ultimate_mpa=400.,weld_ultimate_mpa=480.,
      force_n=2000.,direction='parallel-to-weld')


def test_parallel_short_against_independent_arithmetic():
    p=case();r=check_flat_fillet_weld(p)
    expected=(1-.01*30/2)*2*30*400/1.65
    assert r['checks'][0]['resistance_n']==pytest.approx(expected)
    assert r['branch']=='parallel-short' and len(r['checks'])==1
    assert r['status']=='PASS-ISOLATED-CHECKS-ONLY' and not r['structure_approved']


def test_parallel_long_branch_and_fail():
    p=case();p['length_mm']=50.;p['force_n']=20000
    r=check_flat_fillet_weld(p)
    assert r['branch']=='parallel-long'
    assert r['checks'][0]['resistance_n']==pytest.approx(.75*2*50*400/2)
    assert r['status']=='FAIL-ISOLATED-CHECKS'


def test_normal_with_weld_metal_cap_when_thickness_exceeds_2point5():
    p=case();p.update(thickness1_mm=3,thickness2_mm=3,leg1_mm=3,leg2_mm=3,
                      direction='normal-to-weld',length_mm=40.,force_n=20000.)
    r=check_flat_fillet_weld(p)
    a={x['mode']:x for x in r['checks']}
    assert a['base-metal']['resistance_n']==pytest.approx(3*40*400/1.55)
    assert a['weld-metal']['resistance_n']==pytest.approx(.75*(.7*3)*40*480/1.65)
    assert r['status']=='FAIL-ISOLATED-CHECKS'


@pytest.mark.parametrize('change',[dict(thickness1_mm=5),dict(leg1_mm=3),dict(direction='diagonal'),
                                   dict(force_n=0),dict(length_mm=-1),dict(hypothesis='eccentric'),
                                   dict(base_ultimate_mpa=float('nan'))])
def test_rejects_unsafe_or_unrepresented_conditions(change):
    p=case();p.update(change)
    with pytest.raises(BoltCheckError):check_flat_fillet_weld(p)
