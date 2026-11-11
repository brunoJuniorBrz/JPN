"""P5 acceptance: dimensional component bounds and physical SO(3) distance.

This is a validation tool, never a production solver or approval gate.
"""
import json
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation

CRITERIA = json.loads(Path(__file__).with_name("criteria.json").read_text())


def compare(candidate, reference, field, uncertainty=0.):
    a, b = np.asarray(candidate, dtype=float), np.asarray(reference, dtype=float)
    if a.shape != b.shape or not a.size:
        raise ValueError("Missing/mismatched physical components")
    u = np.broadcast_to(uncertainty, a.shape)
    if not all(np.isfinite(v).all() for v in (a, b, u)) or np.any(u < 0):
        raise ValueError("Nonfinite values or invalid reference uncertainty")
    allowed = CRITERIA["absolute"][field]+CRITERIA["reference_relative"]*np.maximum(abs(a), abs(b))
    error = abs(a-b)
    utilization = (error+u)/allowed
    worst = np.unravel_index(int(np.argmax(utilization)), a.shape)
    return dict(bounds_met=bool(np.all(utilization <= 1)), compared_components=int(a.size),
                violating_components=int(np.count_nonzero(utilization > 1)),
                maximum_absolute_error=float(error.max()), maximum_reference_uncertainty=float(u.max()),
                maximum_bound_utilization=float(utilization.max()), worst_component=list(map(int, worst)),
                candidate_at_worst=float(a[worst]), reference_at_worst=float(b[worst]),
                uncertainty_at_worst=float(u[worst]), relative_tolerance=CRITERIA["reference_relative"],
                absolute_tolerance=CRITERIA["absolute"][field])


def orientation(value):
    matrix = np.asarray(value, dtype=float)
    if (matrix.shape != (3, 3) or not np.isfinite(matrix).all() or
            np.max(abs(matrix.T@matrix-np.eye(3))) > 2e-10 or abs(np.linalg.det(matrix)-1) > 2e-10):
        raise ValueError("Physical orientation must be a proper orthogonal matrix")
    return Rotation.from_matrix(matrix)


def compare_orientation(candidate, reference, uncertainty=0.):
    a, b = orientation(candidate), orientation(reference)
    if not np.isfinite(uncertainty) or uncertainty < 0:
        raise ValueError("Invalid angular uncertainty")
    error = float((a*b.inv()).magnitude())
    allowance = CRITERIA["absolute"]["rotation_rad"]+CRITERIA["reference_relative"]*max(a.magnitude(), b.magnitude())
    # Unit-director distance <= angle. Also retain all three director errors.
    directors = np.linalg.norm(a.as_matrix()-b.as_matrix(), axis=0)
    return dict(bounds_met=bool(error+uncertainty <= allowance), geodesic_error_rad=error,
                reference_uncertainty_rad=float(uncertainty), allowed_error_rad=float(allowance),
                bound_utilization=float((error+uncertainty)/allowance), director_error=directors.tolist())


def richardson(arrays):
    """Order-two estimate, not an exact solution. Two estimates bound study drift.

    The /15 remainder is conditional on a smooth even-power asymptotic series;
    callers retain all raw levels and an independent rod check where available.
    """
    a, b, c = [np.asarray(v, dtype=float) for v in arrays]
    estimate, previous = (4*c-b)/3, (4*b-a)/3
    return estimate, abs(estimate-previous)/15


def richardson_orientation(matrices):
    a, b, c = [orientation(m) for m in matrices]
    previous = Rotation.from_rotvec((b*a.inv()).as_rotvec()/3)*b
    estimate = Rotation.from_rotvec((c*b.inv()).as_rotvec()/3)*c
    return estimate.as_matrix(), float((estimate*previous.inv()).magnitude()/15)
