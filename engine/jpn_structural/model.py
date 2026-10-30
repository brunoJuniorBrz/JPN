"""Strict, versioned SI input; no inferred material, section, load or support."""

from dataclasses import asdict, dataclass
import hashlib
import json
import math


class AnalysisError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Node:
    id: str
    x_m: float
    y_m: float


@dataclass(frozen=True)
class Member:
    id: str
    start: str
    end: str
    e_pa: float
    area_m2: float


@dataclass(frozen=True)
class Support:
    node: str
    ux_m: float | None
    uy_m: float | None


@dataclass(frozen=True)
class Load:
    node: str
    fx_n: float
    fy_n: float


@dataclass(frozen=True)
class Request:
    schema_version: str
    units: str
    nodes: tuple[Node, ...]
    members: tuple[Member, ...]
    supports: tuple[Support, ...]
    loads: tuple[Load, ...]

    def digest(self) -> str:
        encoded = json.dumps(asdict(self), sort_keys=True, separators=(",", ":"), allow_nan=False)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _object(value, fields, path):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise AnalysisError("INVALID_INPUT", f"{path}: expected exactly {', '.join(fields)}")
    return value


def _number(value, path, positive=False):
    if type(value) not in (int, float):
        raise AnalysisError("INVALID_INPUT", f"{path}: finite number required")
    try:
        value = float(value)
    except OverflowError as exc:
        raise AnalysisError("INVALID_INPUT", f"{path}: number out of range") from exc
    if not math.isfinite(value) or (positive and value <= 0):
        raise AnalysisError("INVALID_INPUT", f"{path}: finite {'positive ' if positive else ''}number required")
    return value


def _id(value, path):
    if not isinstance(value, str) or not value.strip() or len(value) > 100:
        raise AnalysisError("INVALID_INPUT", f"{path}: nonempty identifier up to 100 characters required")
    return value


def parse_request(data) -> Request:
    _object(data, ("schema_version", "units", "nodes", "members", "supports", "loads"), "request")
    if data["schema_version"] != "jpn.truss/1" or data["units"] != "SI":
        raise AnalysisError("UNSUPPORTED_MODEL", "Only jpn.truss/1 in m, N, Pa, m² is supported")
    for field, limit in (("nodes", 200), ("members", 1000), ("supports", 200), ("loads", 1000)):
        if not isinstance(data[field], list) or len(data[field]) > limit:
            raise AnalysisError("INVALID_INPUT", f"{field}: list with at most {limit} entries required")
    if len(data["nodes"]) < 2 or not data["members"]:
        raise AnalysisError("INVALID_INPUT", "At least two nodes and one member required")
    nodes, members, supports, loads = [], [], [], []
    node_ids, member_ids, edges, supported = set(), set(), set(), set()
    for raw in data["nodes"]:
        _object(raw, ("id", "x_m", "y_m"), "node")
        nid = _id(raw["id"], "node.id")
        if nid in node_ids:
            raise AnalysisError("INVALID_INPUT", f"Duplicate node {nid}")
        node_ids.add(nid)
        nodes.append(Node(nid, _number(raw["x_m"], "x_m"), _number(raw["y_m"], "y_m")))
    for raw in data["members"]:
        _object(raw, ("id", "start", "end", "e_pa", "area_m2"), "member")
        mid = _id(raw["id"], "member.id")
        a, b = _id(raw["start"], "start"), _id(raw["end"], "end")
        edge = tuple(sorted((a, b)))
        if mid in member_ids or edge in edges or a == b or a not in node_ids or b not in node_ids:
            raise AnalysisError("INVALID_INPUT", f"Member {mid}: duplicate, self-reference or unknown node")
        member_ids.add(mid)
        edges.add(edge)
        members.append(Member(mid, a, b, _number(raw["e_pa"], "e_pa", True), _number(raw["area_m2"], "area_m2", True)))
    for raw in data["supports"]:
        _object(raw, ("node", "ux_m", "uy_m"), "support")
        nid = _id(raw["node"], "support.node")
        if nid not in node_ids or nid in supported or (raw["ux_m"] is None and raw["uy_m"] is None):
            raise AnalysisError("INVALID_INPUT", "Unknown, repeated or empty support")
        supported.add(nid)
        supports.append(Support(nid, *[None if raw[k] is None else _number(raw[k], k) for k in ("ux_m", "uy_m")]))
    for raw in data["loads"]:
        _object(raw, ("node", "fx_n", "fy_n"), "load")
        nid = _id(raw["node"], "load.node")
        if nid not in node_ids:
            raise AnalysisError("INVALID_INPUT", f"Load on unknown node {nid}")
        loads.append(Load(nid, _number(raw["fx_n"], "fx_n"), _number(raw["fy_n"], "fy_n")))
    return Request("jpn.truss/1", "SI", tuple(nodes), tuple(members), tuple(supports), tuple(loads))
