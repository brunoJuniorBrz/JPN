"""Stage 1 gate: can a native corotTruss reproduce the Euler beam benchmark?

Run with the independent OpenSees interpreter pinned by the diagnostic CI.
The portal experiments are conditional on this gate.
"""
import argparse
from math import isfinite, pi
from pathlib import Path
import json

import openseespy.opensees as ops

L = 4.
E = 200e9
A = .01
I = 1e-5  # Analytical Euler beam only. corotTruss has no EI input.
LOAD_RATIO = .75
TRANSVERSE_N = 1.
PROBE_M = (1e-5, 5e-6)
CRITERIA = {
    "amplification_relative": .01,
    "geometric_tangent_relative": 1e-6,
    "beam_elastic_tangent_relative": .01,
    "beam_geometric_tangent_relative": .01,
    "probe_refinement_n_m": 1.,
    "axial_force_relative": 1e-8,
    "positive_restoring_tangent_required": True,
}
P_CR = pi**2*E*I/L**2
K_BEAM = (E*I*pi**4)/(2*L**3)  # Projection on sin(pi*x/L), unit amplitude at midspan.


def build():
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 2)
    for node, x in ((1, 0.), (2, L/2), (3, L)):
        ops.node(node, x, 0.)
    ops.fix(1, 1, 1)
    ops.fix(3, 0, 1)
    ops.uniaxialMaterial("Elastic", 1, E)
    ops.element("corotTruss", 1, 1, 2, A, 1)
    ops.element("corotTruss", 2, 2, 3, A, 1)


def analysis(increment):
    ops.wipeAnalysis()
    ops.constraints("Transformation")
    ops.numberer("Plain")
    ops.system("FullGeneral")
    ops.test("NormDispIncr", 1e-12, 30)
    ops.algorithm("Newton")
    ops.integrator("LoadControl", increment)
    ops.analysis("Static")


def pattern(tag):
    ops.timeSeries("Linear", tag)
    ops.pattern("Plain", tag, tag)


def prescribed_state(compression, transverse_motion):
    build()
    pattern(1)
    # At the straight state the shortening corresponds exactly to -P.
    # The tangent transverse mode decouples from axial motion there.
    ops.sp(3, 1, -L*compression/(E*A))
    ops.sp(2, 2, transverse_motion)
    analysis(.25)
    if ops.analyze(4) != 0:
        raise RuntimeError("OpenSees refused the displacement-controlled probe")
    ops.reactions()
    return {
        "midpoint_reaction_n": ops.nodeReaction(2, 2),
        "axial_forces_n": [ops.eleResponse(tag, "axialForce")[0] for tag in (1, 2)],
        "shortened_length_m": L+ops.nodeDisp(3, 1),
    }


def tangent_probe(compression):
    straight = prescribed_state(compression, 0.)
    levels = []
    for step in PROBE_M:
        positive = prescribed_state(compression, step)
        negative = prescribed_state(compression, -step)
        levels.append({
            "step_m": step,
            "positive_reaction_n": positive["midpoint_reaction_n"],
            "negative_reaction_n": negative["midpoint_reaction_n"],
            "tangent_n_m": (positive["midpoint_reaction_n"]-negative["midpoint_reaction_n"])/(2*step),
        })
    return {
        "straight": straight,
        "levels": levels,
        "tangent_n_m": levels[-1]["tangent_n_m"],
        "refinement_change_n_m": abs(levels[1]["tangent_n_m"]-levels[0]["tangent_n_m"]),
    }


def transverse_load(compression):
    build()
    # Preload the straight configuration with a temporary midpoint guide.
    # Remove the guide before the transverse probe. Only pin/roller supports
    # remain in the measured configuration; there is no transverse spring.
    if compression:
        ops.fix(2, 0, 1)
        pattern(1)
        ops.load(3, -compression, 0.)
        analysis(.1)
        if ops.analyze(10) != 0:
            raise RuntimeError("OpenSees refused the straight axial preload")
        ops.loadConst("-time", 0.)
        ops.remove("sp", 2, 2)
    pattern(2)
    ops.load(2, 0., TRANSVERSE_N)
    analysis(1.)
    code = ops.analyze(1)
    result = {"return_code": int(code), "status": "converged" if code == 0 else "refused"}
    if code == 0:
        result["midpoint_displacement_m"] = ops.nodeDisp(2, 2)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("oracle.json"))
    args = parser.parse_args()
    if ops.version() != "3.8.0":
        raise RuntimeError("Use the OpenSees version pinned by the independent CI")
    compression = LOAD_RATIO*P_CR
    unloaded = tangent_probe(0.)
    loaded = tangent_probe(compression)
    unloaded_response = transverse_load(0.)
    loaded_response = transverse_load(compression)
    restoring = unloaded["tangent_n_m"] > CRITERIA["probe_refinement_n_m"] and loaded["tangent_n_m"] > 0.
    amplification = None
    if restoring and unloaded_response["status"] == loaded_response["status"] == "converged":
        u0, u = [result["midpoint_displacement_m"] for result in (unloaded_response, loaded_response)]
        if isfinite(u0) and isfinite(u) and u0 > 0. and u > 0.:
            amplification = u/u0

    # For two straight truss segments, both halves contribute N/(L_c/2).
    # For the continuous beam the projected geometric term is
    # -P * integral(phi_x**2 dx), with phi = sin(pi*x/L).
    actual_kg = loaded["tangent_n_m"]-unloaded["tangent_n_m"]
    truss_kg = -4.*compression/loaded["straight"]["shortened_length_m"]
    beam_kg = -LOAD_RATIO*K_BEAM
    expected_amplification = 1./(1.-LOAD_RATIO)
    checks = {
        "compression_realized": all(abs(n+compression)/compression <= CRITERIA["axial_force_relative"]
                                    for n in loaded["straight"]["axial_forces_n"]),
        "tangent_probe_refined": max(item["refinement_change_n_m"] for item in (unloaded, loaded))
                                 <= CRITERIA["probe_refinement_n_m"],
        "truss_kg_matches_piecewise_linear_expression": abs(actual_kg-truss_kg)/abs(truss_kg)
                                                      <= CRITERIA["geometric_tangent_relative"],
        "beam_elastic_tangent_matches": abs(unloaded["tangent_n_m"]-K_BEAM)/K_BEAM
                                       <= CRITERIA["beam_elastic_tangent_relative"],
        "beam_geometric_tangent_matches": abs(actual_kg-beam_kg)/abs(beam_kg)
                                         <= CRITERIA["beam_geometric_tangent_relative"],
        "positive_restoring_tangent": restoring,
        "beam_amplification_matches": amplification is not None
                                      and abs(amplification/expected_amplification-1.)
                                      <= CRITERIA["amplification_relative"],
    }
    passed = all(checks.values())
    record = {
        "schema_version": "jpn.int-3b-oracle/1",
        "opensees": ops.version(),
        "criteria": CRITERIA,
        "geometry": {"length_m": L, "area_m2": A, "e_pa": E, "analytical_beam_iy_m4": I,
                     "axial_elements": 2, "transverse_probe_force_n": TRANSVERSE_N},
        "euler_beam": {"critical_load_n": P_CR, "applied_compression_n": compression,
                       "critical_load_ratio": LOAD_RATIO, "elastic_modal_tangent_n_m": K_BEAM,
                       "projected_kg_n_m": beam_kg, "amplification": expected_amplification,
                       "linear_modal_displacement_m": TRANSVERSE_N/K_BEAM,
                       "loaded_modal_displacement_m": TRANSVERSE_N/(K_BEAM+beam_kg)},
        "corot_truss": {"unloaded": unloaded, "loaded": loaded, "measured_kg_n_m": actual_kg,
                       "expected_piecewise_linear_kg_n_m": truss_kg,
                       "truss_kg_relative_error": abs(actual_kg/truss_kg-1.),
                       "beam_kg_relative_error": abs(actual_kg/beam_kg-1.),
                       "transverse_load_unloaded": unloaded_response, "transverse_load_loaded": loaded_response,
                       "physical_amplification": amplification},
        "checks": checks,
        "passed": passed,
        "planar_portal": "not-run",
        "spatial_portal": "not-run",
        "computedStructuralApproval": False,
        "fabricationRelease": False,
        "releaseGate": "NOT_READY_BLOCKED",
    }
    args.output.write_text(json.dumps(record, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print("Stage 1:", "PASS" if passed else "FAIL")


if __name__ == "__main__":
    main()
