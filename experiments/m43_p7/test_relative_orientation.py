"""Regressions for P8 relative orientations and the refined eccentric arm."""
import json
from pathlib import Path

import numpy as np
import pytest

from experiments.m43_p6 import element, pilot as p6
from experiments.m43_p7 import compiled, pilot

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("response", [element.element_response, compiled.element_response])
@pytest.mark.parametrize("vertical", [True, False])
def test_axial_state_has_no_spurious_section_rotation(response, vertical, monkeypatch):
    monkeypatch.setattr(element, "MATERIAL_CURVATURE", True)
    basis = np.array([[0., 0., 1.], [0., 1., 0.], [-1., 0., 0.]]) if vertical else np.eye(3)
    length = 0.0625
    x = np.array([np.zeros(3), length*basis[0]])
    q = np.zeros(12)
    q[6:9] = -1e-5*basis[0]

    ea = 4e9
    result = response(x, q, ea, 4e6, 7e6, 1e6, basis)
    axial = ea*np.dot(q[6:9], basis[0])/length
    expected_force = np.r_[-axial*basis[0], np.zeros(3), axial*basis[0], np.zeros(3)]
    assert result["local_rotation_i"] == [0., 0., 0.]
    assert result["local_rotation_j"] == [0., 0., 0.]
    assert result["arc_extension_m"] == 0.
    assert result["energy"] == pytest.approx(.5*axial**2*length/ea, rel=1e-13)
    np.testing.assert_allclose(result["physical_end_actions"], expected_force, rtol=1e-13, atol=1e-10)


def test_eccentric_arm_at_32_subdivisions_satisfies_physical_newton_gate(monkeypatch):
    baseline = json.loads((ROOT/"validation/m43-p5/p4-baseline.json").read_text())
    history = json.loads((ROOT/"validation/m43-p5/evidence.json").read_text())
    source, controls = next((a,b) for a,b in zip(baseline["cases"],history["cases"]) if a["case"] == "torsion")
    request = {**source["request"], "numerics": controls["requested_numerics"]}
    monkeypatch.setattr(element, "MATERIAL_CURVATURE", True)
    # Preserve the process-private hooks for the other historical tests.
    monkeypatch.setattr(p6.solver, "spatial_element", p6.solver.spatial_element)
    monkeypatch.setattr(p6.solver, "newton", p6.solver.newton)
    monkeypatch.setattr(pilot, "KERNEL", pilot.KERNEL)
    pilot.use_kernel("compiled")
    result = pilot.single_mesh_study(request, 32)
    combo = result["candidate"]["combinations"]["C"]
    final = combo["newton_steps"][-1]
    assert len(combo["newton_steps"]) == 10
    assert final["iterations"] < 30
    assert final["physical_equilibrium_at_convergence"]["accepted"]
    assert combo["physical_equilibrium_verified"]
    assert max(combo["equilibrium"]["force_relative_residual"]+combo["equilibrium"]["moment_relative_residual"]) <= 1e-8

    # Single support at the origin. Independently sum the declared dead
    # forces at the actual deformed positions and compare all six reactions.
    forces, moments = np.zeros(3), np.zeros(3)
    nodes = {n["id"]: np.array([n[k] for k in ("x_m","y_m","z_m")]) for n in request["model"]["nodes"]}
    factors = request["model"]["combinations"][0]["factors"]
    for load in request["model"]["nodal_loads"]:
        node = load["node"]
        force = factors[load["case"]]*np.array([load[k] for k in ("fx_n","fy_n","fz_n")])
        forces += force
        moments += np.cross(nodes[node]+combo["nodes"][node]["translation_m"], force)
    support = combo["nodes"]["B0"]
    np.testing.assert_allclose(support["reaction_force_n"], -forces, rtol=1e-8, atol=1e-8)
    np.testing.assert_allclose(support["reaction_moment_nm"], -moments, rtol=1e-8, atol=1e-8)
    assert result["computed_structural_approval"] is result["fabrication_release"] is False
    assert result["release_gate"] == "NOT_READY_BLOCKED"
