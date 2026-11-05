"""Opt-in metadata through real authenticated HTTP; no remote deployment."""
import json
import urllib.request
import pytest
from .test_vercel_mixed_http import http,call,server  # shared real WSGI fixture
from .test_mixed3d_loads import beam
from .test_mixed3d import beam_and_axial


def test_joint_option_is_authenticated_and_not_an_auth_bypass(monkeypatch):
    monkeypatch.setenv('JPN_ANALYSIS_TOKEN','local-integration-token')
    def forbidden(*args,**kwargs):pytest.fail('Unauthorized/invalid option reached worker')
    monkeypatch.setattr(http,'_worker',forbidden)
    payload=json.dumps(beam()).encode()
    assert call(payload,HTTP_X_JPN_JOINT_ACTIONS='1',HTTP_AUTHORIZATION='')[0]==401
    status,body=call(payload,HTTP_X_JPN_JOINT_ACTIONS='yes')
    assert status==422 and body['error']['code']=='INVALID_INPUT'


@pytest.mark.parametrize('version',[1,2])
def test_real_http_joint_basis_and_legacy_response_are_distinct_opt_in(server,version):
    payload=json.dumps(beam() if version==2 else beam_and_axial()).encode()
    for enabled in (False,True):
        headers={'Authorization':'Bearer local-integration-token','Content-Type':'application/json'}
        if enabled:headers['X-JPN-Joint-Actions']='1'
        req=urllib.request.Request(server+'/api/analyze-mixed',data=payload,headers=headers)
        with urllib.request.urlopen(req,timeout=25) as response:
            raw=response.read();assert response.status==200 and len(raw)<=2000000
            body=json.loads(raw)
        assert ('joint_actions' in body)==enabled
        assert body['result']['schema_version']==f'jpn.mixed3d-result/{version}'
        assert body['execution']['memory_limit_bytes']==805306368 and body['execution']['isolation']=='subprocess'
        if enabled:
            trace=body['joint_actions'];assert trace['input_sha256']==body['result']['input_sha256']
            assert trace['members']['BEAM']['global_to_local']==[[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]]
            assert 'members' not in trace['combinations']['LC']  # redundant vectors not transported
            assert trace['combinations']['LC']['nodal_loads']['A']==[0.]*6
