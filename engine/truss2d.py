"""JPN experimental 2D pin-jointed truss analysis. NOT a structural design approval.
Input units: m, kN, kN/m², m². Small displacements, axial-only linear members.
"""
from __future__ import annotations
from hashlib import sha256
import json
import math
from typing import Any
import numpy as np
from scipy.linalg import LinAlgError, cho_factor, cho_solve


class AnalysisError(ValueError):
    """Invalid or unstable model; no results can be released."""


def _record(item: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(item, dict) or set(item) != keys:
        raise AnalysisError(f"{label}: campos inválidos; esperado {sorted(keys)}")
    return item


def _id(value: object, label: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 64 or not all(c.isascii() and (c.isalnum() or c in "_-") for c in value):
        raise AnalysisError(f"{label}: identificador inválido")
    return value


def _number(value: object, label: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AnalysisError(f"{label}: número obrigatório")
    value = float(value)
    if not math.isfinite(value) or abs(value) > 1e12 or (positive and value <= 0):
        raise AnalysisError(f"{label}: valor não finito, fora do limite ou não positivo")
    return value


def _boolean(value: object, label: str) -> bool:
    if not isinstance(value, bool):
        raise AnalysisError(f"{label}: use verdadeiro/falso")
    return value


def _array(value: object, label: str, maximum: int, minimum: int = 1) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise AnalysisError(f"{label}: exige {minimum} a {maximum} itens")
    return value


def analyze(request: object) -> dict[str, Any]:
    """Solve K u = F; axial forces and reactions ONLY, no code-based design."""
    req = _record(request, {"schema", "units", "nodes", "members", "loads"}, "entrada")
    if req["schema"] != "jpn-truss2d-v1" or req["units"] != "m-kN":
        raise AnalysisError("Versão/unidades não suportadas: exigido jpn-truss2d-v1, m-kN")
    raw_nodes = _array(req["nodes"], "nodes", 300, 2)
    raw_members = _array(req["members"], "members", 900)
    raw_loads = _array(req["loads"], "loads", 1200)
    nodes: dict[str, tuple[float, float, bool, bool]] = {}
    coordinates: set[tuple[float, float]] = set()
    for idx, raw in enumerate(raw_nodes):
        n = _record(raw, {"id", "x_m", "z_m", "fix_x", "fix_z"}, f"node[{idx}]")
        name = _id(n["id"], f"node[{idx}].id")
        if name in nodes:
            raise AnalysisError(f"Nó duplicado: {name}")
        x = _number(n["x_m"], f"{name}.x_m")
        z = _number(n["z_m"], f"{name}.z_m")
        if abs(x) > 1e5 or abs(z) > 1e5:
            raise AnalysisError(f"{name}: coordenada excede ±100 km")
        if (x, z) in coordinates:
            raise AnalysisError(f"{name}: nós com coordenadas idênticas")
        coordinates.add((x, z))
        nodes[name] = (x, z, _boolean(n["fix_x"], f"{name}.fix_x"), _boolean(n["fix_z"], f"{name}.fix_z"))
    order = list(nodes)
    offsets = {name: 2 * i for i, name in enumerate(order)}
    K = np.zeros((2 * len(nodes), 2 * len(nodes)), dtype=np.float64)
    F = np.zeros(2 * len(nodes), dtype=np.float64)
    members: dict[str, tuple[str, str, float, float, float, float, float]] = {}
    used_edges: set[frozenset[str]] = set()
    for idx, raw in enumerate(raw_members):
        b = _record(raw, {"id", "start", "end", "e_kn_m2", "area_m2"}, f"member[{idx}]")
        mid = _id(b["id"], f"member[{idx}].id")
        i = _id(b["start"], f"{mid}.start")
        j = _id(b["end"], f"{mid}.end")
        if mid in members or i not in nodes or j not in nodes or i == j:
            raise AnalysisError(f"{mid}: barras/nós duplicados, inexistentes ou coincidentes")
        edge = frozenset((i, j))
        if edge in used_edges:
            raise AnalysisError(f"{mid}: barra duplicada conectando os mesmos nós")
        used_edges.add(edge)
        E = _number(b["e_kn_m2"], f"{mid}.e_kn_m2", positive=True)
        A = _number(b["area_m2"], f"{mid}.area_m2", positive=True)
        xi, zi = nodes[i][:2]
        xj, zj = nodes[j][:2]
        L = math.hypot(xj - xi, zj - zi)
        if L <= 1e-8:
            raise AnalysisError(f"{mid}: barra de comprimento nulo ou muito pequeno")
        c, s = (xj - xi) / L, (zj - zi) / L
        t = np.array([-c, -s, c, s])
        kl = (E * A / L) * np.outer(t, t)
        dofs = [offsets[i], offsets[i] + 1, offsets[j], offsets[j] + 1]
        K[np.ix_(dofs, dofs)] += kl
        members[mid] = (i, j, E, A, L, c, s)
    for idx, raw in enumerate(raw_loads):
        p = _record(raw, {"node", "fx_kn", "fz_kn"}, f"load[{idx}]")
        name = _id(p["node"], f"load[{idx}].node")
        if name not in nodes:
            raise AnalysisError(f"load[{idx}]: nó inexistente: {name}")
        F[offsets[name]] += _number(p["fx_kn"], f"{name}.fx_kn")
        F[offsets[name] + 1] += _number(p["fz_kn"], f"{name}.fz_kn")
    if not np.isfinite(K).all() or not np.isfinite(F).all():
        raise AnalysisError("Valores extremos geraram estouro numérico")
    fixed = [offsets[n] + d for n in order for d, locked in enumerate(nodes[n][2:]) if locked]
    free = [i for i in range(2 * len(nodes)) if i not in fixed]
    if not fixed or not free:
        raise AnalysisError("Modelo sem apoios suficientes ou sem graus de liberdade livres")
    Kff = K[np.ix_(free, free)]
    spectrum = np.linalg.eigvalsh(Kff)
    if not np.isfinite(spectrum).all() or spectrum[-1] <= 0 or spectrum[0] <= spectrum[-1] * 1e-12:
        raise AnalysisError("Estrutura instável ou quase singular; reveja barras, nós e apoios")
    try:
        factor = cho_factor(Kff, check_finite=True)
        uf = cho_solve(factor, F[free], check_finite=True)
    except (LinAlgError, ValueError) as error:
        raise AnalysisError("Falha de convergência/fatoração; resultado indisponível") from error
    U = np.zeros_like(F)
    U[free] = uf
    reactions = K @ U - F
    tolerance_kn = max(1e-6, 1e-8 * float(np.sum(np.abs(F))))
    equilibrium = max(float(np.max(np.abs(reactions[free]))), abs(float(np.sum(F[::2] + reactions[::2]))), abs(float(np.sum(F[1::2] + reactions[1::2]))))
    if not np.isfinite(U).all() or equilibrium > tolerance_kn:
        raise AnalysisError("Verificação de equilíbrio não satisfeita; resultado indisponível")
    result_nodes = []
    for name in order:
        k = offsets[name]
        result_nodes.append({"id": name, "ux_m": float(U[k]), "uz_m": float(U[k+1]), "rx_kn": float(reactions[k]) if nodes[name][2] else 0.0, "rz_kn": float(reactions[k+1]) if nodes[name][3] else 0.0})
    result_members = []
    for mid, (i, j, E, A, L, c, s) in members.items():
        ia, ja = offsets[i], offsets[j]
        elongation = -c * U[ia] - s * U[ia+1] + c * U[ja] + s * U[ja+1]
        result_members.append({"id": mid, "length_m": L, "elongation_m": float(elongation), "axial_kn": float(E * A / L * elongation)})
    canonical = json.dumps(req, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return {
        "schema": "jpn-analysis-result-v1",
        "status": "ANALYSIS_ONLY_NOT_DESIGN",
        "input_sha256": sha256(canonical).hexdigest(),
        "solver": "symmetric linear truss stiffness + scipy.linalg.cho_solve",
        "units": {"length": "m", "force": "kN", "displacement": "m"},
        "equilibrium_error_kn": equilibrium,
        "nodes": result_nodes,
        "members": result_members,
        "limitations": [
            "Treliça plana, nós articulados, pequenas deformações, comportamento linear.",
            "Carregamentos nodais informados manualmente; não são gerados vento, peso próprio ou combinações.",
            "Não verifica flambagem, resistência, flecha admissível, soldas, ligações, normas ou segurança para fabricação."
        ],
    }
