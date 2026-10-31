"""Isolated 3D pin-jointed axial truss prototype: 3 translations per node.

This module does not model frame rotation, moment transfer, bending, torsion,
wind, self-weight, nonlinear buckling, resistance or normative design. It is
NOT wired into the geometric/physical JPN adapter or deployed HTTP services.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time

import numpy as np
from scipy.linalg import eigvalsh, solve

from .frame3d_model import input_hash
from .model import AnalysisError

_LIMITS = {"nodes": 100, "members": 240, "supports": 100, "loads": 300}
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}\Z")


def _error(code: str, message: str):
    raise AnalysisError(code, message)


def _shape(v, fields, label):
    if type(v) is not dict or set(v) != set(fields):
        _error("INVALID_INPUT", f"{label}: campos obrigatórios ou extras inválidos.")


def _id(v, label):
    if type(v) is not str or not _ID.fullmatch(v) or v in ("constructor", "prototype"):
        _error("INVALID_INPUT", f"{label}: ID inválido.")


def _text(v, label):
    if type(v) is not str or not v.strip() or len(v) > 1000:
        _error("INVALID_INPUT", f"{label}: fonte/identificador obrigatório.")


def _number(v, label, low, high, strictly_positive=False):
    if type(v) not in (float, int):
        _error("INVALID_INPUT", f"{label}: valor finito fora do domínio.")
    try:
        value = float(v)
    except OverflowError:
        _error("INVALID_INPUT", f"{label}: valor fora do domínio numérico.")
    if not math.isfinite(value) or not low <= value <= high or (strictly_positive and value <= 0):
        _error("INVALID_INPUT", f"{label}: valor finito fora do domínio.")


def validate_truss3d(raw):
    """Exact-contract check, with no default physical assumptions."""
    _shape(raw, ("schema_version", "units", "theory", "project", "case", "nodes", "members", "supports", "loads"), "modelo")
    if raw["schema_version"] != "jpn.truss3d/1" or raw["units"] != "SI" or raw["theory"] != "linear-elastic-axial":
        _error("UNSUPPORTED_MODEL", "Somente treliças espaciais axiais em SI, primeira ordem.")
    _shape(raw["project"], ("id", "revision", "source"), "projeto")
    for k, v in raw["project"].items():
        _text(v, f"projeto.{k}")
    _shape(raw["case"], ("id", "source"), "caso")
    _id(raw["case"]["id"], "caso.id")
    _text(raw["case"]["source"], "caso.source")
    for key, limit in _LIMITS.items():
        values = raw[key]
        if type(values) is not list or len(values) > limit:
            _error("INPUT_LIMIT", f"{key}: máximo {limit} registros.")
    if len(raw["nodes"]) < 2 or not raw["members"] or not raw["supports"] or not raw["loads"]:
        _error("INCOMPLETE_MODEL", "Declare nós, barras, apoios e cargas explicitamente.")
    nodes, members, supports = set(), set(), set()
    node_coords = {}
    for n in raw["nodes"]:
        _shape(n, ("id", "x_m", "y_m", "z_m"), "nó")
        _id(n["id"], "nó.id")
        if n["id"] in nodes:
            _error("DUPLICATE_ID", "IDs de nós repetidos.")
        nodes.add(n["id"])
        for k in ("x_m", "y_m", "z_m"):
            _number(n[k], k, -10000, 10000)
        node_coords[n["id"]] = np.array([n[k] for k in ("x_m", "y_m", "z_m")], dtype=float)
    pairs = set()
    for m in raw["members"]:
        _shape(m, ("id", "start", "end", "e_pa", "area_m2", "source", "revision"), "barra")
        for k in ("id", "start", "end"):
            _id(m[k], "barra." + k)
        if m["id"] in members:
            _error("DUPLICATE_ID", "IDs de barras repetidos.")
        members.add(m["id"])
        if m["start"] not in nodes or m["end"] not in nodes or m["start"] == m["end"]:
            _error("INVALID_REFERENCE", "Barra com nós inexistentes ou extremos iguais.")
        edge = tuple(sorted((m["start"], m["end"])))
        if edge in pairs:
            _error("INVALID_GEOMETRY", "Barras coincidentes duplicadas.")
        pairs.add(edge)
        _number(m["e_pa"], "E", 1, 1e13, True)
        _number(m["area_m2"], "A", 1e-16, 1000, True)
        _text(m["source"], "fonte da barra")
        _text(m["revision"], "revisão da barra")
        if not 1e-5 <= float(np.linalg.norm(node_coords[m["start"]] - node_coords[m["end"]])) <= 1000:
            _error("INVALID_GEOMETRY", "Barra fora de 0,00001–1000 m.")
    for s in raw["supports"]:
        _shape(s, ("node", "restrained"), "apoio")
        _id(s["node"], "apoio.node")
        if s["node"] not in nodes or s["node"] in supports:
            _error("INVALID_REFERENCE", "Apoio inexistente/repetido.")
        supports.add(s["node"])
        a = s["restrained"]
        if type(a) is not list or len(a) != 3 or any(type(x) is not bool for x in a) or not any(a):
            _error("INVALID_INPUT", "Apoio deve declarar restrições UX UY UZ, sem rotações ou valores pendentes.")
    for load in raw["loads"]:
        _shape(load, ("node", "fx_n", "fy_n", "fz_n"), "carga")
        _id(load["node"], "carga.node")
        if load["node"] not in nodes:
            _error("INVALID_REFERENCE", "Carga em nó inexistente.")
        for k in ("fx_n", "fy_n", "fz_n"):
            _number(load[k], k, -1e9, 1e9)
    # No implicit knots, merged duplicates, or crossing-based connections.
    from .frame3d import geometry_check
    geometry_check(raw)
    return raw


def analyze_truss3d(raw):
    """Linear axial truss, positive tension. No rotational DOFs are introduced.

    Returns experimental displacements/reactions/axials only; no fabrication design.
    """
    started = time.perf_counter()
    data = validate_truss3d(raw)
    ordered = [n["id"] for n in data["nodes"]]
    index = {nid: i for i, nid in enumerate(ordered)}
    coord = {n["id"]: np.array([n[k] for k in ("x_m", "y_m", "z_m")], dtype=float) for n in data["nodes"]}
    count = 3 * len(ordered)
    k = np.zeros((count, count))
    segments = []
    for member in data["members"]:
        first, last = member["start"], member["end"]
        delta = coord[last] - coord[first]
        length = float(np.linalg.norm(delta))
        direction = delta / length
        b = np.concatenate((-direction, direction))
        indices = np.array([3 * index[first] + i for i in range(3)] + [3 * index[last] + i for i in range(3)])
        stiffness = member["e_pa"] * member["area_m2"] / length
        k[np.ix_(indices, indices)] += stiffness * np.outer(b, b)
        segments.append((member, b, direction, length, stiffness, indices))
    if not np.isfinite(k).all():
        _error("NUMERICAL_FAILURE", "Rigidez não finita.")
    f = np.zeros(count)
    for load in data["loads"]:
        i = 3 * index[load["node"]]
        f[i:i+3] += [load[key] for key in ("fx_n", "fy_n", "fz_n")]
    if not np.isfinite(f).all():
        _error("INVALID_INPUT", "Somatório de cargas não finito.")
    fixed = []
    for support in data["supports"]:
        fixed.extend(3 * index[support["node"]] + i for i, flag in enumerate(support["restrained"]) if flag)
    fixed_dofs = set(fixed)
    free = np.array([i for i in range(count) if i not in fixed_dofs], dtype=int)
    u = np.zeros(count)
    condition = 1.
    if len(free):
        kff = k[np.ix_(free, free)]
        diag = np.diag(kff)
        if not np.isfinite(kff).all() or np.any(diag <= 0):
            _error("UNSTABLE", "Grau sem rigidez; reveja apoios e conexões.")
        scale = np.sqrt(diag)
        scaled = kff / scale[:, None] / scale[None, :]
        spectrum = eigvalsh(scaled, check_finite=True)
        if spectrum[0] <= 10 * len(free) * np.finfo(float).eps * spectrum[-1]:
            _error("UNSTABLE", "Mecanismo ou movimento de corpo rígido; sem apoios artificiais.")
        condition = float(spectrum[-1] / spectrum[0])
        if condition > 1e10:
            _error("ILL_CONDITIONED", "Sistema fora do domínio numérico experimental.")
        try:
            u[free] = solve(kff, f[free], assume_a="pos", check_finite=True)
        except (ValueError, np.linalg.LinAlgError) as exc:
            raise AnalysisError("NUMERICAL_FAILURE", "Falha na solução do sistema elástico.") from exc
    if not np.isfinite(u).all():
        _error("NUMERICAL_FAILURE", "Deslocamento não finito.")
    extent = max(float(np.ptp(np.array(list(coord.values())), axis=0).max()), 1e-5)
    if max(np.abs(u), default=0) / extent > .01:
        _error("MODEL_LIMIT", "Deslocamento excede domínio linear experimental.")
    reaction = k @ u - f
    if not np.isfinite(reaction).all():
        _error("NUMERICAL_FAILURE", "Reações não finitas.")
    nodal = {}
    for node in ordered:
        ix = 3 * index[node]
        nodal[node] = {"translation_m": u[ix:ix+3].tolist(), "reaction_n": reaction[ix:ix+3].tolist()}
    member_results = {}
    for member, b, direction, length, stiffness, indices in segments:
        extension = float(b @ u[indices])
        if abs(extension / length) > .01:
            _error("MODEL_LIMIT", "Deformação axial excede domínio linear experimental.")
        member_results[member["id"]] = {"length_m": length, "axial_n": stiffness * extension,
            "strain": extension / length, "extension_m": extension}
    if not all(math.isfinite(v["axial_n"]) for v in member_results.values()):
        _error("NUMERICAL_FAILURE", "Força axial não finita.")
    external = f + reaction
    first = coord[ordered[0]]
    total_force = external.reshape(-1, 3).sum(axis=0)
    total_moment = sum((np.cross(coord[node] - first, external[3*i:3*i+3]) for i, node in enumerate(ordered)), np.zeros(3))
    magnitude = sum(float(np.linalg.norm(v)) for v in f.reshape(-1, 3)) + sum(float(np.linalg.norm(v)) for v in reaction.reshape(-1, 3))
    residual_free = float(np.linalg.norm((k@u - f)[free])) if len(free) else 0.
    residual = max(float(np.linalg.norm(total_force)), float(np.linalg.norm(total_moment))/extent, residual_free)/max(magnitude, 1e-30)
    if not np.isfinite(residual) or residual > 1e-8:
        _error("EQUILIBRIUM_FAILURE", "Falha no equilíbrio; nenhum resultado parcial publicado.")
    return {
        "schema_version": "jpn.truss3d-result/1", "status": "analysis_completed_experimental", "units": "SI",
        "project": data["project"], "case": data["case"], "input_sha256": input_hash(data),
        "assumptions": ["Barras axiais articuladas 3D, três translações por nó; sem rotações.",
            "Linear elástico, primeira ordem, cargas nodais; sem peso próprio, vento, flexão, flambagem, resistência ou aprovação para fabricação."],
        "diagnostics": {"free_dofs": len(free), "scaled_condition": condition, "relative_equilibrium_residual": residual,
                        "elapsed_seconds": time.perf_counter() - started},
        "nodes": nodal, "members": member_results,
        "equilibrium": {"force_n": total_force.tolist(), "moment_nm": total_moment.tolist()},
    }


def main():
    """Isolated local JSON CLI; intentionally NOT exposed by the HTTP service."""
    from .__main__ import _unique_object
    try:
        body = sys.stdin.buffer.read(500_001)
        if len(body) > 500_000:
            _error("INPUT_LIMIT", "Entrada de treliça 3D excede 500 kB.")
        request = json.loads(body.decode("utf-8"), object_pairs_hook=_unique_object,
                             parse_constant=lambda v: _error("INVALID_INPUT", f"Constante JSON inválida: {v}."))
        result = analyze_truss3d(request)
        print(json.dumps(result, allow_nan=False)); return 0
    except (AnalysisError, UnicodeError, ValueError, TypeError, RecursionError, OverflowError) as exc:
        print(json.dumps({"status": "error", "error": {"code": getattr(exc, "code", "INVALID_INPUT"),
                          "message": str(exc)}})); return 2


if __name__ == "__main__":
    sys.exit(main())
