"""Mesh and section gates for the second-order /3 worker contract."""
import pytest

from jpn_structural import second_order_mesh
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError

from .test_mixed3d_second_order_int3b import request
from .test_second_order_mixed_int3b import portal_geometry


def cantilever(transverse, compression):
    physical,_,_ = portal_geometry(False,mesh=1)
    physical["members"] = [dict(physical["members"][0],id="F",start="base",end="top")]
    physical["sections"][0].update(area_m2=.01,iy_m4=2e-5,iz_m4=2e-5)
    return request({"ULS":{"top":[transverse,0.,-compression]}},physical,
                   {"base":(0.,0.,0.),"top":(0.,0.,4.)},{"base":[True]*6})


def test_mesh_cap_refuses_the_whole_request(monkeypatch):
    monkeypatch.setattr(second_order_mesh,"MAX_SUBDIVISIONS",2)
    with pytest.raises(AnalysisError) as caught:
        analyze_mixed3d_v3(cantilever(30.,10000.))
    assert caught.value.code == "SECOND_ORDER_MESH_NOT_CONVERGED"
