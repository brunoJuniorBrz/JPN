"""Compara o solver jpn.truss/1 do JPN com um oráculo independente de equilíbrio
(treliça isostática: A·N = -F, sem rigidez) para Pratt/Howe/Warren do editor."""
import json, sys, numpy as np
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "engine"))
from jpn_structural.solver import analyze

d = json.load(open(HERE / "ufcg-jpn-editor-geometry.json"))
U90, U100 = d["profiles"]["U90"]["kgPerM"], d["profiles"]["U100"]["kgPerM"]
# Carga gravitacional ilustrativa a partir dos dados do TCC UFCG: 1,4·(telha 2,10 + terça ~6/1,67 kgf/m²) + 1,4·SC 25 kgf/m², tesouras a 3 m.
g = 9.80665e-3
q_kN_m2 = 1.4 * (2.10 + 6 / 1.667) * g + 1.4 * 25 * g
w = q_kN_m2 * 3.0 * 1000  # N/m ao longo do vão (projeção horizontal)

def build(c):
    L, st, tops = c["L"], c["stations"], c["tops"]
    xs = sorted(set([round(s, 1) for s in st] + [round(2 * L - s, 1) for s in st]))
    top_of = {round(s, 1): h for s, h in zip(st, tops)}
    top_of.update({round(2 * L - s, 1): h for s, h in zip(st, tops)})
    nodes, key = [], {}
    for x in xs:
        for lvl, y in (("B", 0.0), ("T", top_of[x])):
            nid = f"{lvl}{len([n for n in nodes if n['id'][0]==lvl])}"
            key[(x, round(y, 1))] = nid
            nodes.append({"id": nid, "x_m": x / 1000, "y_m": y / 1000})
    find = lambda p: key[(round(p[0], 1), round(p[1], 1))]
    members, edges = [], set()
    def add(a, b, kind):
        e = tuple(sorted((a, b)))
        if a != b and e not in edges:
            edges.add(e); members.append({"id": f"{kind}{len(members)}", "start": a, "end": b, "kind": kind})
    for i in range(len(xs) - 1):  # banzos divididos nos nós (estações)
        add(key[(xs[i], 0.0)], key[(xs[i + 1], 0.0)], "BI")
        add(key[(xs[i], round(top_of[xs[i]], 1))], key[(xs[i + 1], round(top_of[xs[i + 1]], 1))], "BS")
    for p in c["pieces"]:
        if p["kind"] in ("M", "D"):
            add(find(p["a"]), find(p["b"]), p["kind"])
    return nodes, members, xs, top_of, key

def oracle(nodes, members, supports, loads):
    idx = {n["id"]: i for i, n in enumerate(nodes)}; P = {n["id"]: np.array([n["x_m"], n["y_m"]]) for n in nodes}
    cols = [m["id"] for m in members] + [f"R{s['node']}{k}" for s in supports for k in ("x", "y") if s[k] is not None]
    A = np.zeros((2 * len(nodes), len(cols))); F = np.zeros(2 * len(nodes))
    for j, m in enumerate(members):
        u = P[m["end"]] - P[m["start"]]; u /= np.linalg.norm(u)
        A[2*idx[m["start"]]:2*idx[m["start"]]+2, j] += u; A[2*idx[m["end"]]:2*idx[m["end"]]+2, j] -= u
    j = len(members)
    for s in supports:
        for k, dof in (("x", 0), ("y", 1)):
            if s[k] is not None: A[2 * idx[s["node"]] + dof, j] = 1; j += 1
    for l in loads: F[2 * idx[l["node"]]] += l["fx_n"]; F[2 * idx[l["node"]] + 1] += l["fy_n"]
    assert A.shape[0] == A.shape[1], f"não isostática: {A.shape}"
    N = np.linalg.solve(A, -F)
    return dict(zip(cols, N))

def area(kind, name):
    prof = {"Pratt": {"BS": U100}, "Warren": {"BI": U100, "M": U100, "D": U100}}.get(name, {})
    return prof.get(kind, U90) / 7850

report = []
for c in d["cases"]:
    nodes, members, xs, top_of, key = build(c)
    first, last = key[(xs[0], 0.0)], key[(xs[-1], 0.0)]
    supports = [{"node": first, "x": 0, "y": 0}, {"node": last, "x": None, "y": 0}]
    for case in ("gravidade", "lateral"):
        loads = []
        for i, x in enumerate(xs):
            trib = ((xs[min(i + 1, len(xs) - 1)] - xs[max(i - 1, 0)]) / 2) / 1000
            nid = key[(x, round(top_of[x], 1))]
            if case == "gravidade": loads.append({"node": nid, "fx_n": 0.0, "fy_n": -w * trib})
            elif x <= xs[-1] / 2: loads.append({"node": nid, "fx_n": 1000.0 * trib, "fy_n": 0.0})
        req = {"schema_version": "jpn.truss/1", "units": "SI", "nodes": nodes,
               "members": [{"id": m["id"], "start": m["start"], "end": m["end"], "e_pa": 200e9, "area_m2": area(m["kind"], c["name"])} for m in members],
               "supports": [{"node": s["node"], "ux_m": s["x"], "uy_m": s["y"]} for s in supports],
               "loads": [l for l in loads if l["fx_n"] or l["fy_n"]]}
        res = analyze(req)
        jpn = {k: v["axial_n"] for k, v in res["members"].items()}
        orc = oracle(nodes, members, supports, req["loads"])
        diff = max(abs(jpn[k] - orc[k]) for k in jpn)
        scale = max(abs(v) for k, v in orc.items() if not k.startswith("R"))
        kinds = {m["id"]: m["kind"] for m in members}
        ext = lambda k: (round(max([v for i, v in orc.items() if kinds.get(i) == k] + [0]) / 1000, 2), round(min([v for i, v in orc.items() if kinds.get(i) == k] + [0]) / 1000, 2))
        report.append({"tesoura": c["name"], "painel_mm": c["panel"], "caso": case, "barras": len(members), "nos": len(nodes),
                       "max_dif_N": diff, "dif_relativa": diff / scale,
                       "BS_kN": ext("BS"), "BI_kN": ext("BI"), "M_kN": ext("M"), "D_kN": ext("D")})
json.dump(report, open(HERE / "truss-types-oracle-report.json", "w"), indent=1)
worst = max(r["dif_relativa"] for r in report)
for r in report:
    if r["caso"] == "gravidade": print(r["tesoura"], r["painel_mm"], "barras", r["barras"], "dif rel %.1e" % r["dif_relativa"], "BS", r["BS_kN"], "BI", r["BI_kN"], "M", r["M_kN"], "D", r["D_kN"])
assert worst < 1e-9, f"JPN difere do oráculo de equilíbrio: {worst}"
print("casos:", len(report), "pior diferença relativa JPN x oráculo:", "%.2e" % worst, "| carga q =", round(q_kN_m2, 3), "kN/m²")
