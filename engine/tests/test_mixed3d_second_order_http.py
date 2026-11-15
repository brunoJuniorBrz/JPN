"""Actual WSGI subprocess checks for the second-order /3 envelope."""
import math

import pytest

from .test_mixed3d_second_order_int3c import cantilever
from .test_vercel_mixed_http import request, server


def test_http_refusal_identifies_the_failed_combination(server):
    # Same physical column, plus a preceding in-domain combination.
    raw = cantilever(0.,0.)
    ei = raw["materials"][0]["e_pa"]*raw["sections"][0]["iy_m4"]
    raw["cases"].append(dict(id="over",source="analytical cantilever"))
    raw["nodal_loads"].append(dict(raw["nodal_loads"][0],case="over",fz_n=-1.20*math.pi**2*ei/64))
    raw["combinations"].append(dict(id="above-Pcr:1",factors={"over":1.}))
    status,body,_ = request(server+"/api/analyze-mixed",raw)
    assert status == 422
    assert set(body) == {"error"}
    assert body["error"]["code"] == "SECOND_ORDER_BEYOND_CRITICAL"
    assert body["error"]["combination_id"] == "above-Pcr:1"


@pytest.mark.parametrize("spring,code",[(True,"SECOND_ORDER_UNSUPPORTED_SPRING"),
                                         (False,"SECOND_ORDER_UNSUPPORTED_RELEASE")])
def test_http_refuses_unsupported_restraints_explicitly(server,spring,code):
    raw = cantilever(10.,0.)
    if spring:
        raw["nodal_springs"] = [dict(node="top",kx_n_m=1000.)]
    else:
        raw["members"][0]["release_end"][2] = True
    status,body,_ = request(server+"/api/analyze-mixed",raw)
    assert status == 422 and set(body) == {"error"}
    assert body["error"]["code"] == code


def test_http_returns_converged_station_data(server):
    status,body,_ = request(server+"/api/analyze-mixed",cantilever(30.,10000.))
    assert status == 200
    result = body["result"]
    assert result["loading"] == {"member_loads":[],"self_weight":None}
    assert result["mesh_subdivisions"] == {"F":4}
    assert len(result["combinations"]["ULS"]["members"]["F"]["stations"]) == 5
    assert result["computedStructuralApproval"] is result["fabricationRelease"] is False
    assert result["releaseGate"] == "NOT_READY_BLOCKED"
