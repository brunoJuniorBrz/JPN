"""Mesh and section gates for the second-order /3 worker contract."""
import math

import numpy as np
import pytest

from jpn_structural import second_order_mesh
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError

from .test_mixed3d_second_order_int3b import request
from .test_second_order_mixed_int3b import portal_geometry

MOMENT_RTOL = .01
MEMBER_EQUILIBRIUM = 1e-8


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


def test_compressed_cantilever_moment_matches_closed_form():
    initial = cantilever(100.,0.)
    length = 4.
    ei = initial["materials"][0]["e_pa"]*initial["sections"][0]["iy_m4"]
    pressure = .75*math.pi**2*ei/(4*length**2)
    compression = cantilever(100.,pressure)
    m1 = 100.*length
    wavelength = length*math.sqrt(pressure/ei)
    expected_amplification = math.tan(wavelength)/wavelength
    combo = analyze_mixed3d_v3(compression)["combinations"]["ULS"]
    member = combo["members"]["F"]
    start = member["stations"][0]
    moment = math.hypot(start["my_nm"],start["mz_nm"])
    assert moment == pytest.approx(m1*expected_amplification,rel=MOMENT_RTOL)
    assert member["equilibrium_relative"] < MEMBER_EQUILIBRIUM
    assert [s["x_m"] for s in member["stations"]] == [0.,1.,2.,3.,4.]
    assert np.linalg.norm([member["stations"][-1][k] for k in ("t_nm","my_nm","mz_nm")]) < 1e-7


def test_distributed_load_section_actions_close_at_both_ends():
    raw = cantilever(0.,10000.)
    raw["member_loads"] = [dict(id="q", member="F", case="ULS", coordinate_system="global",
                               force_per_length_n_m=[17.,-11.,-3.], source="fixture",revision="1")]
    member = analyze_mixed3d_v3(raw)["combinations"]["ULS"]["members"]["F"]
    actions = np.asarray(member["end_actions_global"]).reshape(2,6)
    np.testing.assert_allclose(actions[:,:3].sum(axis=0),-4*np.array([17.,-11.,-3.]),atol=1e-7)
    keys = ("n_n","vy_n","vz_n","t_nm","my_nm","mz_nm")
    interior = member["stations"][2]
    assert all(math.isfinite(interior[k]) for k in keys)
    np.testing.assert_allclose([member["stations"][0][k] for k in keys],-np.array(member["end_actions_local"][:6]))
    np.testing.assert_allclose([member["stations"][-1][k] for k in keys],member["end_actions_local"][6:],atol=1e-7)
    assert member["equilibrium_relative"] < MEMBER_EQUILIBRIUM
