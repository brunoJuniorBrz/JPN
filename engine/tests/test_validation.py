"""Independent equilibrium cross-checks and metamorphic tests for linear 2D trusses.
No result from this suite is a structural design approval.
"""
import copy
import math
import random
import unittest
import numpy as np
from engine import AnalysisError, analyze


def warren(span=12., height=2., loads=(-7., -12., -4.), area=0.002):
    nodes = [
        {"id": f"B{i}", "x_m": span*i/3, "z_m": 0.,
         "fix_x": i==0, "fix_z": i in (0,3)} for i in range(4)
    ] + [
        {"id": f"T{i}", "x_m": span*(i+.5)/3, "z_m": height,
         "fix_x": False, "fix_z": False} for i in range(3)
    ]
    ends = [("B0","B1"),("B1","B2"),("B2","B3"),
            ("T0","T1"),("T1","T2"),
            ("B0","T0"),("T0","B1"),("B1","T1"),
            ("T1","B2"),("B2","T2"),("T2","B3")]
    members = [{"id": f"M{i}", "start": a, "end": b,
                "e_kn_m2": 200e6, "area_m2": area}
               for i,(a,b) in enumerate(ends)]
    return {"schema": "jpn-truss2d-v1", "units": "m-kN",
            "nodes": nodes, "members": members,
            "loads": [{"node": f"T{i}", "fx_kn": 0., "fz_kn": float(f)}
                      for i,f in enumerate(loads)]}


def independent_joints(p):
    """Solve nodal force equilibrium without stiffness matrices (determinate only)."""
    nodes = {n["id"]: n for n in p["nodes"]}
    index = {name: 2*i for i,name in enumerate(nodes)}
    fixed = [(n["id"], c) for n in p["nodes"]
             for c in ("x", "z") if n["fix_"+c]]
    names = [m["id"] for m in p["members"]] + [n+":R"+c for n,c in fixed]
    equilibrium = np.zeros((2*len(nodes),len(names)))
    rhs = np.zeros(2*len(nodes))
    for i,m in enumerate(p["members"]):
        a,b = nodes[m["start"]], nodes[m["end"]]
        dx,dz = b["x_m"]-a["x_m"],b["z_m"]-a["z_m"]
        length = math.hypot(dx,dz)
        for name,sgn in ((m["start"],1),(m["end"],-1)):
            equilibrium[index[name],i] += sgn*dx/length
            equilibrium[index[name]+1,i] += sgn*dz/length
    for i,(name,c) in enumerate(fixed):
        equilibrium[index[name]+(1 if c=="z" else 0),len(p["members"])+i]=1
    for load in p["loads"]:
        rhs[index[load["node"]]] -= load["fx_kn"]
        rhs[index[load["node"]]+1] -= load["fz_kn"]
    assert equilibrium.shape[0] == equilibrium.shape[1]
    return dict(zip(names,np.linalg.solve(equilibrium,rhs)))


class CrossValidation(unittest.TestCase):
    def test_100_independent_random_warren_trusses(self):
        rng = random.Random(20261030)
        for case in range(100):
            p = warren(rng.uniform(5,35), rng.uniform(1,7),
                       tuple(rng.uniform(-35,15) for _ in range(3)),
                       rng.uniform(.0005,.005))
            calc = analyze(p)
            independent = independent_joints(p)
            for m in calc["members"]:
                self.assertAlmostEqual(m["axial_kn"],independent[m["id"]],delta=1e-6,
                                       msg=f"case {case}: {m['id']}")
            for n in calc["nodes"]:
                for direction in ("x","z"):
                    self.assertAlmostEqual(n["r"+direction+"_kn"],
                                           independent.get(n["id"]+":R"+direction,0),delta=1e-6)
            self.assertLess(calc["equilibrium_error_kn"],1e-6)

    def test_linearity_reversed_loads_and_stiffness(self):
        p = warren()
        initial = analyze(p)
        for scale in (0.25,2.,-1.,-4.):
            q = copy.deepcopy(p)
            for load in q["loads"]: load["fz_kn"] *= scale
            current = analyze(q)
            for old,new in zip(initial["members"],current["members"]):
                self.assertAlmostEqual(new["axial_kn"],old["axial_kn"]*scale,delta=1e-7)
        q = copy.deepcopy(p)
        for member in q["members"]: member["area_m2"] *= 10
        current = analyze(q)
        for old,new in zip(initial["members"],current["members"]):
            self.assertAlmostEqual(new["axial_kn"],old["axial_kn"],delta=1e-7)
        for old,new in zip(initial["nodes"],current["nodes"]):
            self.assertAlmostEqual(new["uz_m"],old["uz_m"]/10,delta=1e-8)

    def test_no_change_when_reversing_bar_or_node_order(self):
        p = warren()
        base = analyze(p)
        for member in p["members"]:
            member["start"],member["end"] = member["end"],member["start"]
        p["nodes"].reverse()
        modified = analyze(p)
        for old,new in zip(base["members"],modified["members"]):
            self.assertAlmostEqual(old["axial_kn"],new["axial_kn"],delta=1e-8)
        nodes = {n["id"]: n for n in modified["nodes"]}
        for old in base["nodes"]:
            for field in ("ux_m","uz_m","rx_kn","rz_kn"):
                self.assertAlmostEqual(old[field],nodes[old["id"]][field],delta=1e-8)

    def test_fixed_node_load_goes_to_reaction(self):
        p = warren()
        old = analyze(p)
        p["loads"].append({"node":"B0","fx_kn":-8.,"fz_kn":-3.})
        changed = analyze(p)
        for a,b in zip(old["members"],changed["members"]):
            self.assertAlmostEqual(a["axial_kn"],b["axial_kn"],delta=1e-7)
        a = next(n for n in old["nodes"] if n["id"]=="B0")
        b = next(n for n in changed["nodes"] if n["id"]=="B0")
        self.assertAlmostEqual(b["rx_kn"],a["rx_kn"]+8,delta=1e-7)
        self.assertAlmostEqual(b["rz_kn"],a["rz_kn"]+3,delta=1e-7)

    def test_superposition(self):
        p = warren()
        a = analyze(p)
        q = copy.deepcopy(p)
        q["loads"] = [{"node":"T1","fx_kn":4.,"fz_kn":0.}]
        b = analyze(q)
        q["loads"] = p["loads"] + q["loads"]
        result = analyze(q)
        for x,y,z in zip(a["members"],b["members"],result["members"]):
            self.assertAlmostEqual(x["axial_kn"]+y["axial_kn"],z["axial_kn"],delta=1e-8)

    def test_rejects_unconnected_bars_and_missing_sections(self):
        p = warren()
        p["nodes"].extend([
            {"id":"X","x_m":50,"z_m":0,"fix_x":False,"fix_z":False},
            {"id":"Y","x_m":51,"z_m":0,"fix_x":False,"fix_z":False}
        ])
        p["members"].append({"id":"XY","start":"X","end":"Y",
                             "e_kn_m2":200e6,"area_m2":0.001})
        with self.assertRaisesRegex(AnalysisError,"instável"):
            analyze(p)
        q = warren()
        q["members"][0]["area_m2"] = None
        with self.assertRaises(AnalysisError):
            analyze(q)

    def test_rejects_bad_numbers_and_duplicate_geometry(self):
        p = warren()
        p["loads"][0]["fz_kn"] = float("nan")
        with self.assertRaises(AnalysisError):
            analyze(p)
        p = warren()
        p["nodes"][1]["id"] = "B0"
        with self.assertRaisesRegex(AnalysisError,"duplicado"):
            analyze(p)
