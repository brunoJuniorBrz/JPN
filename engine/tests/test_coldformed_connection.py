import pytest
from jpn_structural.coldformed_connection import audit_member_connection
from jpn_structural.model import AnalysisError


def context():
    return dict(piece_id='UE',joints=[dict(id='JOINT',node_id='N',source='Explicit geometry control',revision='1',fixing='welded',has_bolts=False,holes=[],welds=[dict(id='W',type='fillet',size_mm=3,length_mm=50)])])


@pytest.mark.parametrize('edit',[
 lambda j:j.update(has_bolts=True),lambda j:j.update(fixing='combined'),
 lambda j:j['holes'].append(dict(id='H',component_id='PLATE',diameter_mm=12,y_mm=30,z_mm=40)),
 lambda j:j['holes'].append(dict(id='H',component_id='PLATE',diameter_mm=None,y_mm=None,z_mm=None)),
])
def test_full_welded_section_cannot_ignore_registered_holes_or_bolts(edit):
    raw=context();edit(raw['joints'][0])
    with pytest.raises(AnalysisError,match='contradicts'):audit_member_connection(raw,'UE',dict(basis='full-section-all-elements-welded'))


def test_no_inventory_or_a_weld_component_does_not_prove_full_section_coverage():
    for raw in [None,context()]:
        audit=audit_member_connection(raw,'UE',dict(basis='full-section-all-elements-welded'))
        assert audit['status']=='conditional-unverified'
        assert 'cutouts' in audit['warning']


def test_context_binding_units_and_strict_schema():
    with pytest.raises(AnalysisError):audit_member_connection(context(),'ANOTHER',None)
    raw=context();raw['joints'][0]['welds'][0]['size_mm']=-1
    with pytest.raises(AnalysisError):audit_member_connection(raw,'UE',None)
    raw=context();raw['joints'][0]['all_welds_verified']=True
    with pytest.raises(AnalysisError):audit_member_connection(raw,'UE',None)
