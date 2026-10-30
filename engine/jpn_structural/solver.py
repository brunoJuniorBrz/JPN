"""Small-displacement, linear elastic, pin-jointed axial bars in global XY.

Assembly is explicit; eigensolution and SPD solve use SciPy/LAPACK, with no
inverse, penalty stiffness, pseudoinverse or artificial mechanism restraints.
"""

from dataclasses import asdict
import warnings

import numpy as np
import scipy
from scipy import linalg

from . import __version__
from .model import AnalysisError, Request, parse_request

ASSUMPTIONS = [
    "Experimental first-order planar pin-jointed truss; axial deformation only.",
    "SI: m, N, Pa, m². Global +X right, +Y up. Axial +tension, -compression.",
    "Linear elastic E and A supplied per member; loads act only at nodes.",
    "No self-weight, wind, combinations, beam bending, joints, buckling or code checks inferred.",
    "Convergence is not design approval or authorization for construction.",
]
EQUILIBRIUM_RTOL = 1e-9
MAX_SCALED_CONDITION = 1e10
MAX_RAW_CONDITION = 1e12
MAX_LINEAR_RATIO = 0.01


def analyze(data: dict | Request) -> dict:
    # Revalidate even typed dataclasses so callers cannot bypass the boundary.
    raw = asdict(data) if isinstance(data, Request) else data
    if isinstance(data, Request):
        raw = {k: list(v) if isinstance(v, tuple) else v for k, v in raw.items()}
    request = parse_request(raw)
    try:
        with np.errstate(over="raise", invalid="raise", divide="raise", under="ignore"), warnings.catch_warnings():
            warnings.simplefilter("error", linalg.LinAlgWarning)
            return _analyze(request)
    except AnalysisError:
        raise
    except (FloatingPointError, OverflowError, linalg.LinAlgError, linalg.LinAlgWarning) as exc:
        raise AnalysisError("NUMERICAL_FAILURE", "Nonfinite arithmetic or failed matrix factorization") from exc


def _analyze(request):
    index = {node.id: i for i, node in enumerate(request.nodes)}
    xy = np.array([[n.x_m, n.y_m] for n in request.nodes])
    ndof = xy.size
    span = float(np.max(np.ptp(xy, axis=0)))
    coordinate_scale = max(span, float(np.max(np.abs(xy))), np.finfo(float).tiny)
    minimum_length = 64 * np.finfo(float).eps * coordinate_scale
    for i in range(len(xy)):
        for j in range(i):
            if np.hypot(*(xy[i] - xy[j])) <= minimum_length:
                raise AnalysisError("INVALID_GEOMETRY", "Coincident or numerically indistinguishable nodes")
    stiffness = np.zeros((ndof, ndof))
    force = np.zeros(ndof)
    displacement = np.zeros(ndof)
    restrained = np.zeros(ndof, dtype=bool)
    elements = []
    connected = set()
    for member in request.members:
        i, j = index[member.start], index[member.end]
        delta = xy[j] - xy[i]
        length = float(np.hypot(*delta))
        direction = delta / length
        b = np.concatenate((-direction, direction))
        dofs = np.array([2*i, 2*i+1, 2*j, 2*j+1])
        ea = member.e_pa * member.area_m2
        axial_stiffness = ea / length
        if not np.isfinite(axial_stiffness) or axial_stiffness <= 0:
            raise AnalysisError("NUMERICAL_FAILURE", f"Unrepresentable stiffness in {member.id}")
        stiffness[np.ix_(dofs, dofs)] += axial_stiffness * np.outer(b, b)
        elements.append((member, dofs, b, length, axial_stiffness))
        connected.update((member.start, member.end))
    if connected != set(index):
        raise AnalysisError("INVALID_GEOMETRY", "Isolated node without members")
    for load in request.loads:
        i = 2 * index[load.node]
        force[i:i+2] += (load.fx_n, load.fy_n)
    for support in request.supports:
        for offset, value in enumerate((support.ux_m, support.uy_m)):
            if value is not None:
                dof = 2 * index[support.node] + offset
                restrained[dof] = True
                displacement[dof] = value
    free = np.flatnonzero(~restrained)
    fixed = np.flatnonzero(restrained)
    scaled_condition = raw_condition = 1.0
    if free.size:
        kff = stiffness[np.ix_(free, free)]
        diagonal = np.diag(kff)
        if np.any(diagonal <= 0):
            raise AnalysisError("UNSTABLE", "Unrestrained degree of freedom without stiffness")
        scaling = 1 / np.sqrt(diagonal)
        scaled = scaling[:, None] * kff * scaling[None, :]
        eigenvalues = linalg.eigvalsh(scaled)
        if eigenvalues[0] <= np.finfo(float).eps * free.size * eigenvalues[-1] * 10:
            raise AnalysisError("UNSTABLE", "Singular stiffness: rigid body motion or internal mechanism")
        scaled_condition = float(eigenvalues[-1] / eigenvalues[0])
        raw_condition = float(np.linalg.cond(kff))
        if scaled_condition > MAX_SCALED_CONDITION or raw_condition > MAX_RAW_CONDITION:
            raise AnalysisError("ILL_CONDITIONED", "Stiffness condition exceeds experimental numerical limits")
        rhs = force[free] - stiffness[np.ix_(free, fixed)] @ displacement[fixed]
        displacement[free] = scaling * linalg.solve(scaled, scaling * rhs, assume_a="pos")
    internal = np.zeros(ndof)
    member_results = {}
    energy = 0.0
    max_strain = 0.0
    for member, dofs, b, length, axial_stiffness in elements:
        extension = float(b @ displacement[dofs])
        axial = axial_stiffness * extension
        internal[dofs] += axial * b
        energy += 0.5 * axial * extension
        max_strain = max(max_strain, abs(extension / length))
        member_results[member.id] = {"length_m": length, "extension_m": extension, "strain": extension / length, "axial_n": axial}
    # Reconstruct element end forces independently of assembled K for equilibrium.
    reaction = np.zeros(ndof)
    reaction[fixed] = (internal - force)[fixed]
    residual = internal - force - reaction
    force_scale = max(float(np.sum(np.abs(force))), float(np.sum(np.abs(internal))), np.finfo(float).tiny)
    residual_relative = float(np.max(np.abs(residual)) / force_scale)
    net = (force + reaction).reshape(-1, 2)
    balance = np.sum(net, axis=0)
    centered_xy = xy - xy[0]
    moment = float(np.sum(centered_xy[:, 0] * net[:, 1] - centered_xy[:, 1] * net[:, 0]))
    moment_relative = abs(moment) / (force_scale * max(span, np.finfo(float).tiny))
    if residual_relative > EQUILIBRIUM_RTOL or np.max(np.abs(balance)) / force_scale > EQUILIBRIUM_RTOL or moment_relative > EQUILIBRIUM_RTOL:
        raise AnalysisError("EQUILIBRIUM_FAILURE", "Nodal/global equilibrium residual exceeds numerical tolerance")
    motion_ratio = float(np.max(np.abs(displacement))) / max(span, np.finfo(float).tiny)
    if max(max_strain, motion_ratio) > MAX_LINEAR_RATIO:
        raise AnalysisError("MODEL_LIMIT", "Displacement/span or axial strain exceeds 1%; first-order model not accepted")
    result = {
        "schema_version": "jpn.truss-result/1", "status": "analyzed_experimental", "units": "SI",
        "input_sha256": request.digest(),
        "solver": {"name": "jpn-linear-truss", "version": __version__, "numpy": np.__version__, "scipy": scipy.__version__},
        "assumptions": ASSUMPTIONS.copy(),
        "nodes": {n.id: {"ux_m": float(displacement[2*i]), "uy_m": float(displacement[2*i+1]), "rx_n": float(reaction[2*i]), "ry_n": float(reaction[2*i+1])} for i, n in enumerate(request.nodes)},
        "members": member_results,
        "diagnostics": {"free_dofs": int(free.size), "scaled_condition": scaled_condition, "raw_condition": raw_condition,
            "nodal_residual_relative": residual_relative, "balance_fx_n": float(balance[0]), "balance_fy_n": float(balance[1]),
            "balance_moment_nm": moment, "moment_residual_relative": moment_relative, "strain_energy_j": energy,
            "max_abs_strain": max_strain, "displacement_span_ratio": motion_ratio},
    }
    # Includes energies and diagnostics: never publish Infinity or NaN.
    import json
    try:
        json.dumps(result, allow_nan=False)
    except ValueError as exc:
        raise AnalysisError("NUMERICAL_FAILURE", "Nonfinite result") from exc
    return result
