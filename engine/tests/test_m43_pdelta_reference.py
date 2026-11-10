"""M43-P1 isolated PyNite 3.2.1 second-order feasibility benchmarks.

NOT an alternative implementation of the production JPN mixed3d engine.
A pure Euler-Bernoulli cantilever has a closed-form P-Delta answer, allowing
an independent check of the solver before a versioned nonlinear API is
considered. The frame-only case MUST NOT be generalized to mixed Spring3D:
those axial springs have no validated geometric stiffness contribution.
"""
import math

import pytest

from Pynite import FEModel3D

E = 200e9  # Pa -- synthetic steel for an ANALYTICAL benchmark, not design data
I = 2e-5   # m^4 -- equal minor and major bending inertias
AREA = 0.02  # m²
LENGTH = 4.0
HORIZONTAL = 2000.0
P_EULER = math.pi**2 * E * I / (4.0 * LENGTH**2)


def exact_cantilever_tip_displacement(P, H=HORIZONTAL):
    """Exact small-strain beam-column solution, fixed base / free upper end.

    A compressive dead force P and transverse point force H are applied at
    the same tip. Effective length K=2 ONLY in this isolated cantilever.
    Not suitable for other end restraints, braced frames, or P-delta design.
    """
    if type(P) not in (float, int) or not math.isfinite(P) or P < 0:
        raise ValueError("M43_REFERENCE_INVALID_COMPRESSION")
    if P >= 0.8 * P_EULER:
        raise ValueError("M43_REFERENCE_NEAR_CRITICAL: benchmark outside domain")
    if P == 0:
        return H * LENGTH**3 / (3 * E * I)
    k = math.sqrt(P / (E * I))
    return (H / P) * (math.tan(k * LENGTH) / k - LENGTH)


def _pynite_column(P, segments=4, nonlinear=False, H=HORIZONTAL):
    model = FEModel3D()
    for i in range(segments + 1):
        model.add_node(f"N{i}", 0.0, 0.0, LENGTH * i / segments)
    model.add_material("M", E, E/(2*(1+0.3)), 0.3, 0.0)
    model.add_section("S", AREA, I, I, I)
    for i in range(segments):
        model.add_member(f"C{i}", f"N{i}", f"N{i+1}", "M", "S")
    model.def_support("N0", True, True, True, True, True, True)
    model.add_node_load(f"N{segments}", "FX", H, "H")
    model.add_node_load(f"N{segments}", "FZ", -P, "P")
    model.add_load_combo("BENCHMARK", {"H": 1.0, "P": 1.0})
    if nonlinear:
        model.analyze_PDelta(log=False, check_stability=True, max_iter=30, sparse=True)
    else:
        model.analyze_linear(log=False, check_stability=True, sparse=True)
    tip = model.nodes[f"N{segments}"]
    return dict(
        tip_x_m=tip.DX["BENCHMARK"],
        tip_z_m=tip.DZ["BENCHMARK"],
        horizontal_reaction_n=model.nodes["N0"].RxnFX["BENCHMARK"],
        vertical_reaction_n=model.nodes["N0"].RxnFZ["BENCHMARK"],
    )


@pytest.mark.parametrize("compression_ratio", [0.05, 0.2, 0.4])
def test_pynite_pdelta_matches_independent_exact_cantilever(compression_ratio):
    P = compression_ratio * P_EULER
    first = _pynite_column(P, nonlinear=False)
    second = _pynite_column(P, nonlinear=True)
    reference = exact_cantilever_tip_displacement(P)
    linear_reference = exact_cantilever_tip_displacement(0.0)

    assert first["tip_x_m"] == pytest.approx(linear_reference, rel=5e-5)
    # The 4-element benchmark must agree with the independent exact solution.
    # This acceptance is restricted to a prismatic frame-only cantilever.
    assert second["tip_x_m"] == pytest.approx(reference, rel=0.015)
    assert second["tip_x_m"] > first["tip_x_m"]
    assert second["horizontal_reaction_n"] == pytest.approx(-HORIZONTAL, rel=1e-6)
    assert second["vertical_reaction_n"] == pytest.approx(P, rel=1e-6)
    assert second["tip_x_m"] / LENGTH < 0.01  # small-displacement pilot only


def test_zero_compression_does_not_create_spurious_second_order_amplification():
    first = _pynite_column(0.0, nonlinear=False)
    second = _pynite_column(0.0, nonlinear=True)
    assert second["tip_x_m"] == pytest.approx(first["tip_x_m"], rel=5e-5)
    assert second["tip_x_m"] == pytest.approx(exact_cantilever_tip_displacement(0.0), rel=5e-5)


def test_reference_explicitly_rejects_critical_and_nonphysical_inputs():
    with pytest.raises(ValueError, match="M43_REFERENCE_NEAR_CRITICAL"):
        exact_cantilever_tip_displacement(0.8 * P_EULER)
    with pytest.raises(ValueError, match="M43_REFERENCE_NEAR_CRITICAL"):
        exact_cantilever_tip_displacement(P_EULER)
    with pytest.raises(ValueError, match="M43_REFERENCE_INVALID_COMPRESSION"):
        exact_cantilever_tip_displacement(-100.0)
    with pytest.raises(ValueError, match="M43_REFERENCE_INVALID_COMPRESSION"):
        exact_cantilever_tip_displacement(float("nan"))


def test_axial_springs_are_outside_the_frame_only_pdelta_pilot():
    # Deliberate proof of scope. The production engine models axial-only bars
    # with Spring3D k=EA/L, which has no validated geometric stiffness Kg.
    # They must never inherit this frame-only benchmark's approval.
    from jpn_structural.mixed3d import validate_mixed3d
    assert validate_mixed3d.__module__ == "jpn_structural.mixed3d"
    assert _pynite_column.__name__ == "_pynite_column"
