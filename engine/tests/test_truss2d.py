from __future__ import annotations
import copy
import json
import math
from pathlib import Path
import unittest
from engine import AnalysisError, analyze

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "triangulo.json"

class TrussTests(unittest.TestCase):
    def test_triangle_analytic_statics(self):
        r = analyze(json.loads(EXAMPLE.read_text()))
        reactions = {v["id"]: v for v in r["nodes"]}
        members = {v["id"]: v for v in r["members"]}
        self.assertAlmostEqual(reactions["A"]["rz_kn"], 5, places=8)
        self.assertAlmostEqual(reactions["B"]["rz_kn"], 5, places=8)
        self.assertAlmostEqual(members["AB"]["axial_kn"], 10/3, places=8)
        self.assertAlmostEqual(members["AC"]["axial_kn"], -5 * math.sqrt(13)/3, places=8)
        self.assertAlmostEqual(members["BC"]["axial_kn"], -5 * math.sqrt(13)/3, places=8)
        self.assertLess(r["equilibrium_error_kn"], 1e-6)

    def test_bar_deformation_and_reversed_load(self):
        p = {"schema":"jpn-truss2d-v1","units":"m-kN",
             "nodes":[{"id":"A","x_m":0,"z_m":0,"fix_x":True,"fix_z":True},
                      {"id":"B","x_m":2,"z_m":0,"fix_x":False,"fix_z":True}],
             "members":[{"id":"AB","start":"A","end":"B","e_kn_m2":200e6,"area_m2":0.001}],
             "loads":[{"node":"B","fx_kn":100,"fz_kn":0}]}
        r = analyze(p)
        self.assertAlmostEqual(r["nodes"][1]["ux_m"], 0.001, places=10)
        self.assertAlmostEqual(r["members"][0]["axial_kn"], 100, places=8)
        p["loads"][0]["fx_kn"] = -100
        self.assertAlmostEqual(analyze(p)["members"][0]["axial_kn"], -100, places=8)

    def test_unstable_rejected(self):
        p = json.loads(EXAMPLE.read_text())
        p["members"] = p["members"][:1]
        with self.assertRaisesRegex(AnalysisError, "instável"):
            analyze(p)

    def test_duplicate_rejected(self):
        p = json.loads(EXAMPLE.read_text())
        p["members"].append({**p["members"][0], "id":"DUP", "start":"B", "end":"A"})
        with self.assertRaisesRegex(AnalysisError, "duplicada"):
            analyze(p)

    def test_invalid_units_and_missing_section_rejected(self):
        p = json.loads(EXAMPLE.read_text())
        p["units"] = "mm-N"
        with self.assertRaisesRegex(AnalysisError, "unidades"):
            analyze(p)
        p = json.loads(EXAMPLE.read_text())
        del p["members"][0]["area_m2"]
        with self.assertRaisesRegex(AnalysisError, "campos inválidos"):
            analyze(p)

    def test_determinism_and_no_mutation(self):
        p = json.loads(EXAMPLE.read_text())
        original = copy.deepcopy(p)
        self.assertEqual(analyze(p), analyze(p))
        self.assertEqual(p, original)
