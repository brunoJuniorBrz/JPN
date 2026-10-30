"""Cross-check the experimental 2D truss solver against PyNiteFEA 3.2.1.

Requires PyNiteFEA and its dependencies. Not a design-code verification.
This suite intentionally FAILS when PyNite is absent (no skipped validation).
"""
import copy
import json
import math
import random
import unittest
from pathlib import Path

from Pynite import FEModel3D

from engine.truss2d import analyze

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "triangulo.json"


def pynite_reference(request):
    """Create an independently solved 3D frame constrained to ideal pin-ended XZ truss behavior.

    Input m, kN, kN/m2, m2. All Y movements and rotations fixed;
    axial-only beams are obtained with both end bending releases.
    Pynite's convention: axial compression positive; our solver: tension positive.
    """
    model = FEModel3D()
    for node in request["nodes"]:
        model.add_node(node["id"], node["x_m"], 0.0, node["z_m"])
        model.def_support(node["id"], node["fix_x"], True, node["fix_z"], True, True, True)
    for member in request["members"]:
        mat = "MAT_" + member["id"]
        section = "SEC_" + member["id"]
        E = member["e_kn_m2"]
        A = member["area_m2"]
        model.add_material(mat, E, E / (2 * 1.3), 0.3, 0.0)
        # Nonzero section properties are required by FEModel3D;
        # beam bending is released at both ends and therefore not counted.
        model.add_section(section, A, max(A * 1e-4, 1e-12), max(A * 1e-4, 1e-12), max(A * 1e-4, 1e-12))
        model.add_member(member["id"], member["start"], member["end"], mat, section)
        model.def_releases(member["id"], Ryi=True, Rzi=True, Ryj=True, Rzj=True)
    for load in request["loads"]:
        model.add_node_load(load["node"], "FX", load["fx_kn"], "TEST")
        model.add_node_load(load["node"], "FZ", load["fz_kn"], "TEST")
    model.add_load_combo("COMPARE", {"TEST": 1.0})
    model.analyze_linear(log=False)
    return model


class CompareWithPyNite(unittest.TestCase):
    def compare_case(self, request, label):
        own = analyze(request)
        external = pynite_reference(request)
        combo = "COMPARE"
        for node in own["nodes"]:
            ref = external.nodes[node["id"]]
            self.assertAlmostEqual(node["ux_m"], ref.DX[combo], delta=1e-8, msg=f"{label} {node['id']} UX")
            self.assertAlmostEqual(node["uz_m"], ref.DZ[combo], delta=1e-8, msg=f"{label} {node['id']} UZ")
            self.assertAlmostEqual(node["rx_kn"], ref.RxnFX.get(combo, 0.0), delta=1e-6, msg=f"{label} {node['id']} RX")
            self.assertAlmostEqual(node["rz_kn"], ref.RxnFZ.get(combo, 0.0), delta=1e-6, msg=f"{label} {node['id']} RZ")
        for member in own["members"]:
            ref = external.members[member["id"]]
            # PyNite uses compression-positive, this prototype tension-positive.
            reference_tension = -float(ref.axial(ref.L() * 0.5, combo_name=combo))
            self.assertAlmostEqual(member["axial_kn"], reference_tension,
                                   delta=1e-5, msg=f"{label} {member['id']} axial")

    def test_three_bar_triangle(self):
        self.compare_case(json.loads(EXAMPLE.read_text()), "triangle")

    def test_random_warren_twelve_cases(self):
        rng = random.Random(20261030)
        for idx in range(12):
            span = rng.uniform(7,25)
            height = rng.uniform(1,5)
            nodes = [
                {"id": f"B{i}", "x_m": span*i/3, "z_m": 0.0,
                 "fix_x": i == 0, "fix_z": i in (0, 3)} for i in range(4)
            ] + [
                {"id": f"T{i}", "x_m": span*(i+0.5)/3, "z_m": height,
                 "fix_x": False, "fix_z": False} for i in range(3)
            ]
            edges = [("B0","B1"), ("B1","B2"), ("B2","B3"),
                     ("T0","T1"), ("T1","T2"), ("B0","T0"), ("T0","B1"),
                     ("B1","T1"), ("T1","B2"), ("B2","T2"), ("T2","B3")]
            members = [{"id":f"M{i}", "start":a, "end":b,
                         "e_kn_m2":200e6,"area_m2":rng.uniform(0.0005,0.005)}
                        for i,(a,b) in enumerate(edges)]
            loads = [{"node":f"T{i}", "fx_kn":rng.uniform(-5, 5), "fz_kn":rng.uniform(-25,-1)}
                     for i in range(3)]
            request = {"schema":"jpn-truss2d-v1","units":"m-kN","nodes":nodes,"members":members,"loads":loads}
            self.compare_case(request, f"warren_{idx}")
