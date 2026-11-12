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
# Four elements match displacement but FAIL the existing 1e-6 shear-reaction
# gate in PyNite 3.2.1. Explicit mesh refinement, not a relaxed force tolerance,
# is required for this isolated reference. Never refine a client model here.
REFERENCE_SEGMENTS = 64


def exact_cantilever_tip_displacement(P, H=HORIZONTAL):
    """Exact small-strain beam-column solution, fixed base / free upper end.

    A compressive dead force P and transverse point force H are applied at
    the same tip. Effective length K=2 ONLY in this isolated cantilever.
    Not suitable for other end restraints, braced frames, or P-delta design.
    """
    if type(P) not in (float, int) or not math.isfinite(P) or P < 0:
        raise ValueError("M43_REFERENCE_INVALID_COMPRESSION")
    if type(H) not in (float, int) or not math.isfinite(H):
        raise ValueError("M43_REFERENCE_INVALID_TRANSVERSE_LOAD")
    if P >= 0.8 * P_EULER:
        raise ValueError("M43_REFERENCE_NEAR_CRITICAL: benchmark outside domain")
    if P == 0:
        return H * LENGTH**3 / (3 * E * I)
    k = math.sqrt(P / (E * I))
    q2 = P * LENGTH**2 / (E * I)
    if q2 < 1e-4:
        # (tan(q)-q)/q**3 = 1/3 + 2*q**2/15 + 17*q**4/315
        #                         + 62*q**6/2835 + O(q**8).
        # The omitted term is < 9e-19 here. Direct subtraction loses the
        # linear limit (and can return zero) for tiny POSITIVE compression.
        return H * LENGTH**3 / (E * I) * (
            1/3 + q2 * (2/15 + q2 * (17/315 + q2 * 62/2835))
        )
    return (H / P) * (math.tan(k * LENGTH) / k - LENGTH)


def _pynite_column(P, segments=REFERENCE_SEGMENTS, nonlinear=False, H=HORIZONTAL):
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
        reaction_force_n=[getattr(model.nodes["N0"], k)["BENCHMARK"]
                          for k in ("RxnFX", "RxnFY", "RxnFZ")],
        reaction_moment_nm=[getattr(model.nodes["N0"], k)["BENCHMARK"]
                            for k in ("RxnMX", "RxnMY", "RxnMZ")],
    )


def _assert_beam_column_reactions(result, P, H=HORIZONTAL):
    # Dead forces keep global directions. The small-strain beam-column
    # reference includes P*DX; it is NOT full equilibrium in a finite-strain
    # deformed geometry (in particular H*DZ is outside this idealization).
    delta = exact_cantilever_tip_displacement(P, H)
    assert result["reaction_force_n"] == pytest.approx(
        [-H, 0, P], rel=1e-6, abs=1e-8)
    assert result["reaction_moment_nm"] == pytest.approx(
        [0, -H * LENGTH - P * delta, 0], rel=1e-6, abs=1e-8)


@pytest.mark.parametrize("compression_ratio", [0.05, 0.2, 0.4])
def test_pynite_pdelta_matches_independent_exact_cantilever(compression_ratio):
    P = compression_ratio * P_EULER
    first = _pynite_column(P, nonlinear=False)
    second = _pynite_column(P, nonlinear=True)
    reference = exact_cantilever_tip_displacement(P)
    linear_reference = exact_cantilever_tip_displacement(0.0)

    assert first["tip_x_m"] == pytest.approx(linear_reference, rel=5e-5)
    # The explicitly refined benchmark must agree with the exact solution.
    # This acceptance is restricted to a prismatic frame-only cantilever.
    assert second["tip_x_m"] == pytest.approx(reference, rel=1e-6)
    assert second["tip_x_m"] > first["tip_x_m"]
    assert second["horizontal_reaction_n"] == pytest.approx(-HORIZONTAL, rel=1e-6)
    assert second["vertical_reaction_n"] == pytest.approx(P, rel=1e-6)
    assert second["tip_x_m"] / LENGTH < 0.01  # small-displacement pilot only
    _assert_beam_column_reactions(second, P)


def test_zero_compression_does_not_create_spurious_second_order_amplification():
    first = _pynite_column(0.0, nonlinear=False)
    second = _pynite_column(0.0, nonlinear=True)
    assert second["tip_x_m"] == pytest.approx(first["tip_x_m"], rel=5e-5)
    assert second["tip_x_m"] == pytest.approx(exact_cantilever_tip_displacement(0.0), rel=5e-5)
    _assert_beam_column_reactions(second, 0.0)


def test_explicit_mesh_convergence_preserves_original_force_gate():
    P = 0.4 * P_EULER
    reference = exact_cantilever_tip_displacement(P)
    force_errors, displacement_errors = [], []
    for n in (1, 2, 4, 8, 16, 32, REFERENCE_SEGMENTS):
        result = _pynite_column(P, segments=n, nonlinear=True)
        force_errors.append(abs(result["horizontal_reaction_n"] + HORIZONTAL))
        displacement_errors.append(abs(result["tip_x_m"] - reference))
    assert all(b < a for a, b in zip(force_errors, force_errors[1:]))
    assert all(b < a for a, b in zip(displacement_errors, displacement_errors[1:]))
    assert force_errors[-1] <= 1e-6 * HORIZONTAL
    assert displacement_errors[-1] <= 1e-6 * reference


def test_reversed_dead_transverse_force_reverses_displacement_and_moment():
    P, H = 0.4 * P_EULER, -HORIZONTAL
    result = _pynite_column(P, nonlinear=True, H=H)
    assert result["tip_x_m"] == pytest.approx(
        exact_cantilever_tip_displacement(P, H), rel=1e-6)
    assert result["tip_x_m"] < 0
    assert abs(result["tip_x_m"]) / LENGTH < 0.01
    _assert_beam_column_reactions(result, P, H)


@pytest.mark.parametrize("ratio", [1e-20, 1e-16, 1e-12])
def test_positive_near_zero_compression_preserves_nonzero_linear_limit(ratio):
    value = exact_cantilever_tip_displacement(ratio * P_EULER)
    assert value > 0
    assert value == pytest.approx(HORIZONTAL * LENGTH**3 / (3 * E * I), rel=1e-10)


@pytest.mark.parametrize("H", [float("nan"), float("inf"), True])
def test_reference_rejects_nonphysical_transverse_force(H):
    with pytest.raises(ValueError, match="M43_REFERENCE_INVALID_TRANSVERSE_LOAD"):
        exact_cantilever_tip_displacement(0.2 * P_EULER, H)


def test_reference_explicitly_rejects_critical_and_nonphysical_inputs():
    with pytest.raises(ValueError, match="M43_REFERENCE_NEAR_CRITICAL"):
        exact_cantilever_tip_displacement(0.8 * P_EULER)
    with pytest.raises(ValueError, match="M43_REFERENCE_NEAR_CRITICAL"):
        exact_cantilever_tip_displacement(P_EULER)
    with pytest.raises(ValueError, match="M43_REFERENCE_INVALID_COMPRESSION"):
        exact_cantilever_tip_displacement(-100.0)
    with pytest.raises(ValueError, match="M43_REFERENCE_INVALID_COMPRESSION"):
        exact_cantilever_tip_displacement(float("nan"))


def test_production_mixed_worker_remains_explicitly_linear_on_same_column():
    """Benchmark cannot silently enable nonlinear design in the live worker."""
    from jpn_structural.mixed3d import analyze_mixed3d

    P = 0.2 * P_EULER
    n = REFERENCE_SEGMENTS
    data = dict(
        schema_version="jpn.mixed3d/1", units="SI",
        theory="linear-elastic-frame-axial",
        project=dict(id="M43-LINEAR", revision="R1",
                     source="Independent linear versus PDelta benchmark"),
        nodes=[dict(id=f"N{i}", x_m=0.0, y_m=0.0, z_m=i*LENGTH/n)
               for i in range(n+1)],
        members=[dict(id=f"C{i}", start=f"N{i}", end=f"N{i+1}",
                      kind="frame", material="M", section="S",
                      rotation_deg=0,
                      release_start=[False]*6, release_end=[False]*6)
                 for i in range(n)],
        materials=[dict(id="M", e_pa=E, g_pa=E/(2*(1+0.3)), nu=0.3,
                        source="Benchmark synthetic material", revision="R1")],
        sections=[dict(id="S", area_m2=AREA, iy_m4=I, iz_m4=I, j_m4=I,
                       source="Benchmark synthetic section", revision="R1")],
        supports=[dict(node="N0", restrained=[True]*6)],
        cases=[dict(id="H", source="Transverse benchmark lateral point load"),
               dict(id="P", source="Axial benchmark compressive load")],
        nodal_loads=[
            dict(node=f"N{n}", case="H", fx_n=HORIZONTAL, fy_n=0, fz_n=0,
                 mx_nm=0, my_nm=0, mz_nm=0),
            dict(node=f"N{n}", case="P", fx_n=0, fy_n=0, fz_n=-P,
                 mx_nm=0, my_nm=0, mz_nm=0),
        ],
        combinations=[dict(id="C", factors={"H":1,"P":1})],
    )
    solved = analyze_mixed3d(data)
    tip = solved["combinations"]["C"]["nodes"][f"N{n}"]["translation_m"][0]
    assert tip == pytest.approx(exact_cantilever_tip_displacement(0.0), rel=5e-5)
    assert tip < exact_cantilever_tip_displacement(P)
    assert solved["combinations"]["C"]["equilibrium"]["relative_residual"] < 1e-8
    assert solved["status"] == "analysis_completed_experimental"
