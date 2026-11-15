"""Closed-form UDL checks against the original automatic differentiation."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

import numpy as np
import pytest

from jpn_structural import second_order_mixed as core
from jpn_structural.local_axes import reference_basis
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.second_jet import variables
from jpn_structural.spatial_corotational import dot, exponential, rotate

from .test_mixed3d_second_order_int3d import released_request

ROOT = Path(__file__).resolve().parents[2]/"validation"/"int-3e"
TOL = json.loads((ROOT/"criteria.json").read_text())["absolute_and_relative_equivalence"]
spec = spec_from_file_location("frame_candidate",ROOT/"frame_candidate.py")
candidate = module_from_spec(spec)
spec.loader.exec_module(candidate)


def jet_centroid(row, q):
    a,b = row["coordinates"]
    v = variables(q)
    chord = [float(b[i]-a[i])+v[6+i]-v[i] for i in range(3)]
    length = dot(chord,chord)**.5
    axis = [c/length for c in chord]
    di,dj = [rotate(exponential(v[k:k+3]),[float(c) for c in row["basis"][0]]) for k in (3,9)]
    ni,nj = dot(di,axis),dot(dj,axis)
    center = [(float(b[i]-a[i])+v[i]+v[6+i])/2+length*(di[i]/ni-dj[i]/nj)/12 for i in range(3)]
    return (a+np.array([c.v for c in center]),np.array([c.g for c in center]),np.array([c.h for c in center]))


@pytest.mark.parametrize("angle",(0.,1e-5,1e-4,.002,.03,.1,.37))
def test_closed_form_centroid_derivatives(angle):
    a,b = np.array([[.13,.78,-2.25],[2.73,-.12,7.9]])
    row = dict(coordinates=np.array([a,b]),basis=reference_basis(a,b,"inclined"))
    q = np.array([.01,-.015,.02,angle,-.34*angle,.7*angle,
                  -.03,.018,.009,-.57*angle,.42*angle,-.65*angle])
    for analytical,reference in zip(core.uniform_centroid(row,q),jet_centroid(row,q)):
        np.testing.assert_allclose(analytical,reference,rtol=TOL,atol=TOL)


def test_second_order_with_releases_matches_ad_in_full_result(monkeypatch):
    raw,_,_ = released_request("purlin-portal")
    raw["member_loads"] = [dict(id="q",member="P2",case="NL",coordinate_system="global",
                               force_per_length_n_m=[.2,-.4,-1.],source="INT-3e",revision="1")]
    after = analyze_mixed3d_v3(raw)
    monkeypatch.setattr(core,"uniform_centroid",jet_centroid)
    before = analyze_mixed3d_v3(raw)
    for result in (before,after):
        del result["diagnostics"]["elapsed_seconds"]

    def compare(a,b):
        if isinstance(a,dict):
            assert a.keys() == b.keys()
            for k in a:
                compare(a[k],b[k])
        elif isinstance(a,list):
            assert len(a) == len(b)
            for i,j in zip(a,b):
                compare(i,j)
        elif isinstance(a,float):
            assert a == pytest.approx(b,rel=TOL,abs=TOL)
        else:
            assert a == b
    compare(after,before)


def test_candidate_frame_material_and_geometric_tangent_match_ad_at_element_level():
    a,b = np.array([[.13,.78,-2.25],[2.73,-.12,7.9]])
    row = dict(coordinates=np.array([a,b]),basis=reference_basis(a,b,"inclined"),
               ea=2e8,eiy=1.13e6,eiz=1e5,gj=4e5)
    q = np.random.default_rng(81).normal(size=(12,12))*np.geomspace(1e-6,.005,12)[:,None]
    rows = [row]*len(q)
    for actual,reference in zip(candidate.frame_responses(rows,q),core.frame_responses(rows,q)):
        for k in ("force","tangent","physical_end_actions","current_basis","axial_n"):
            np.testing.assert_allclose(actual[k],reference[k],rtol=TOL,atol=TOL,err_msg=k)
