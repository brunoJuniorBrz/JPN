from contextlib import contextmanager
from copy import deepcopy

import numpy as np
import pytest

from jpn_structural.frame3d_model import input_hash
from jpn_structural.model import AnalysisError
from jpn_structural import second_order_frame as pilot
from tests.second_order_cases import frame_case, CANTILEVER_PCR
from tests.test_m43_pdelta_reference import exact_cantilever_tip_displacement


@contextmanager
def raises_code(code):
    with pytest.raises(AnalysisError) as error:
        yield
    assert error.value.code == code


def request(kind="cantilever", compression_ratio=.2, horizontal_n=2000., coarse=None):
    model = frame_case(kind, segments=1, compression_n=compression_ratio*CANTILEVER_PCR,
                       horizontal_n=horizontal_n)
    n = coarse if coarse is not None else 32 if kind == "cantilever" else 8
    return dict(schema_version=pilot.SCHEMA, units="SI", analysis_type="experimental-pdelta-diagnostic",
                binding=dict(model_sha256=input_hash(model), preparation_sha256="a"*64, mapping_sha256="b"*64),
                model=model, numerics=dict(coarse_subdivisions=n, fine_subdivisions=2*n,
                                          max_tc_iterations=30, equilibrium_relative_tolerance=1e-8,
                                          refinement_relative_tolerance=1e-4))


@pytest.mark.parametrize("ratio", [0., .05, .2, .4])
@pytest.mark.parametrize("horizontal", [-2000., 2000.])
def test_independent_cantilever_and_no_false_physical_convergence(ratio, horizontal):
    raw = request(compression_ratio=ratio, horizontal_n=horizontal)
    original = deepcopy(raw)
    result = pilot.analyze_second_order_frame(raw)
    assert raw == original
    assert result["input_sha256"] == input_hash(raw)
    combination = result["candidate"]["combinations"]["C"]
    tip = combination["nodes"]["T0"]["translation_m"][0]
    reference = exact_cantilever_tip_displacement(ratio*CANTILEVER_PCR, horizontal)
    assert tip == pytest.approx(reference, rel=1e-6)
    assert result["linear_baseline"]["combinations"]["C"]["nodes"]["T0"]["translation_m"][0] == pytest.approx(
        exact_cantilever_tip_displacement(0., horizontal), rel=1e-6)
    trace = combination["native_trace"]
    assert trace["elastic_assemblies"] == trace["geometric_assemblies"] == trace["tc_iterations"] == 1
    assert trace["nonlinear_equilibrium_iterations"] is None
    assert trace["algebraic_relative_residual"] <= 1e-8
    assert result["comparison"]["C"]["refinement_relative_displacement_error"] < 1e-4
    if ratio:
        assert result["status"] == "diagnostic-rejected"
        assert not combination["equilibrium"]["accepted"]
        assert "PDELTA_DEAD_LOAD_EQUILIBRIUM_NOT_VERIFIED:C" in result["blockers"]
    assert not result["physical_convergence_verified"]
    assert not result["production_enabled"]
    assert not result["computed_structural_approval"]
    assert not result["fabrication_release"]
    assert result["release_gate"] == "NOT_READY_BLOCKED"


@pytest.mark.parametrize("kind", ["sway", "braced", "spatial"])
def test_real_frame_geometries_record_all_components_without_claiming_verified_equilibrium(kind):
    result = pilot.analyze_second_order_frame(request(kind))
    candidate = result["candidate"]["combinations"]["C"]
    assert result["status"] == "diagnostic-rejected"
    assert candidate["native_trace"]["minimum_tangent_ratio"] > .6
    for node in candidate["nodes"].values():
        assert all(len(v) == 3 and np.isfinite(v).all() for v in node.values())
    assert len(candidate["equilibrium"]["force_residual_n"]) == 3
    assert len(candidate["equilibrium"]["deformed_geometry_moment_residual_nm"]) == 3
    assert all(len(m["end_actions_local"]) == len(m["end_actions_global"]) == 12
               for m in candidate["members"].values())


def test_declared_brace_reduces_sway_without_inventing_a_support():
    sway = pilot.analyze_second_order_frame(request("sway"))
    braced = pilot.analyze_second_order_frame(request("braced"))
    a = sway["candidate"]["combinations"]["C"]["nodes"]["T0"]["translation_m"][0]
    b = braced["candidate"]["combinations"]["C"]["nodes"]["T0"]["translation_m"][0]
    assert 0 < b < a/10
    assert len(request("sway")["model"]["supports"]) == len(request("braced")["model"]["supports"])


@pytest.mark.parametrize("ratio,code", [(.401, "PDELTA_DOMAIN_MARGIN"), (.8, "PDELTA_DOMAIN_MARGIN"),
                                        (1.01, "PDELTA_INSTABILITY")])
def test_explicit_near_instability_rejection_without_extrapolating_eighty_percent(ratio, code):
    with raises_code(code):
        pilot.analyze_second_order_frame(request(compression_ratio=ratio))


@pytest.mark.parametrize("change", ["geometry", "material", "load", "support"])
def test_model_mutation_invalidates_binding(change):
    raw = request()
    if change == "geometry": raw["model"]["nodes"][-1]["z_m"] += .1
    if change == "material": raw["model"]["materials"][0]["e_pa"] *= .9
    if change == "load": raw["model"]["nodal_loads"][0]["fz_n"] *= .9
    if change == "support": raw["model"]["supports"][0]["restrained"][0] = False
    with raises_code("PDELTA_BINDING"):
        pilot.analyze_second_order_frame(raw)


def test_axial_spring_rejected_before_pdelta_or_stability_inference():
    raw = request()
    m = raw["model"]["members"][0]
    raw["model"]["members"] = [dict(id=m["id"], start=m["start"], end=m["end"], kind="axial",
                                      e_pa=200e9, area_m2=.02, source="Declared axial reference", revision="1")]
    raw["model"]["supports"][0]["restrained"] = [True, True, True, False, False, False]
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    with raises_code("PDELTA_AXIAL_KG_UNSUPPORTED"):
        pilot.analyze_second_order_frame(raw)


def test_releases_and_mechanisms_are_technical_errors():
    raw = request()
    raw["model"]["members"][0]["release_start"][4] = True
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    with raises_code("PDELTA_RELEASE_PENDING"):
        pilot.analyze_second_order_frame(raw)
    raw = request()
    raw["model"]["supports"] = []
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    with raises_code("UNSTABLE"):
        pilot.analyze_second_order_frame(raw)


def test_limits_cannot_be_relaxed_and_insufficient_mesh_stays_rejected():
    raw = request(coarse=1)
    result = pilot.analyze_second_order_frame(raw)
    assert result["status"] == "diagnostic-rejected"
    assert "PDELTA_REFINEMENT_NOT_CONVERGED:C" in result["blockers"]
    raw["numerics"]["equilibrium_relative_tolerance"] = .1
    with raises_code("PDELTA_NUMERICS"):
        pilot.analyze_second_order_frame(raw)


def test_nonfinite_and_native_failure_cannot_publish_a_solution(monkeypatch):
    def native_failure(self, **kwargs): raise RuntimeError("Deliberate failure")
    monkeypatch.setattr(pilot.ObservedFrameModel, "analyze_PDelta", native_failure)
    with raises_code("PDELTA_NATIVE_FAILURE"):
        pilot.analyze_second_order_frame(request())


def test_silent_linear_substitution_is_detected(monkeypatch):
    def linear(self, **kwargs):
        kwargs.pop("max_iter")
        return self.analyze_linear(**kwargs)
    monkeypatch.setattr(pilot.ObservedFrameModel, "analyze_PDelta", linear)
    with raises_code("PDELTA_TRACE_INCOMPLETE"):
        pilot.analyze_second_order_frame(request())


def test_nonfinite_recovery_is_a_hard_error(monkeypatch):
    original = pilot.ObservedFrameModel.analyze_PDelta
    def damaged(self, **kwargs):
        original(self, **kwargs)
        self.nodes["T0"].DX["C"] = float("nan")
    monkeypatch.setattr(pilot.ObservedFrameModel, "analyze_PDelta", damaged)
    with raises_code("PDELTA_NONFINITE"):
        pilot.analyze_second_order_frame(request())


def test_extreme_real_length_ratio_is_rejected_as_ill_conditioned():
    raw = request(compression_ratio=0.,coarse=1)
    raw["model"] = frame_case("cantilever",segments=2,compression_n=0.)
    raw["model"]["nodes"][-1]["z_m"] = 3.999  # Actual 1 mm / 3999 mm segments.
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    with raises_code("ILL_CONDITIONED"):
        pilot.analyze_second_order_frame(raw)


def test_loaded_contract_with_only_nodal_actions_keeps_its_original_hash():
    raw = request()
    raw["model"].update(schema_version="jpn.mixed3d/2",member_loads=[],self_weight=None)
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    result = pilot.analyze_second_order_frame(raw)
    assert result["binding"] == raw["binding"]
    assert result["status"] == "diagnostic-rejected"
    assert not result["production_enabled"]


def test_uniform_loads_are_not_silently_replaced_by_nodal_loads():
    raw = request()
    raw["model"].update(schema_version="jpn.mixed3d/2",member_loads=[
        dict(id="UDL",member=raw["model"]["members"][0]["id"],case="H",coordinate_system="global",
             force_per_length_n_m=[0,0,-100],source="Explicit distributed load",revision="1")],self_weight=None)
    raw["binding"]["model_sha256"] = input_hash(raw["model"])
    with raises_code("PDELTA_DISTRIBUTED_LOAD_PENDING"):
        pilot.analyze_second_order_frame(raw)


def test_mesh_budget_is_preserved_before_allocating_a_large_matrix():
    with raises_code("INPUT_LIMIT"):
        pilot.analyze_second_order_frame(request("spatial",coarse=32))


def test_nonobject_and_non_si_inputs_are_explicit_technical_errors():
    raw = request();raw["model"] = None
    with raises_code("INVALID_INPUT"):
        pilot.analyze_second_order_frame(raw)
    raw = request();raw["units"] = "kN"
    with raises_code("PDELTA_CONTRACT"):
        pilot.analyze_second_order_frame(raw)
