"""Exact energy pullback for independent end rotations at corotational hinges."""
import numpy as np

from .second_jet import value, variables
from .spatial_corotational import exponential, logarithm, multiply


def prepare_releases(elements, fixed):
    """Add free hinge coordinates and remove only unused joint rotations."""
    if not any(any(e.get("releases", ())) for e in elements):
        return elements, fixed, None

    next_dof = len(fixed)
    retained = {}
    affected = set()
    prepared = []
    for element in elements:
        if element["kind"] == "axial":
            prepared.append(element)
            continue
        indices = list(element["dofs"])
        hinges = []
        for end, offset in enumerate((0, 6)):
            release = element["releases"][3*end:3*end+3]
            axes = element["basis"][release]
            node = indices[offset]//6
            retained.setdefault(node, []).extend(element["basis"][~release])
            if len(axes):
                affected.add(node)
                start = len(indices)
                hinges.append((offset+3, axes, slice(start, start+len(axes))))
                indices.extend(range(next_dof, next_dof+len(axes)))
                next_dof += len(axes)
        prepared.append(dict(element, assembly_dofs=np.array(indices), hinges=hinges))

    fixed = np.pad(fixed, (0, next_dof-len(fixed)))
    available = ~fixed
    partial = []
    for node in sorted(affected):
        slots = np.flatnonzero(available[6*node+3:6*node+6])
        if not len(slots):
            continue
        span = np.asarray(retained[node]).reshape(-1,3)[:, slots]
        _, strength, directions = np.linalg.svd(span, full_matrices=False)
        rank = np.count_nonzero(strength > 1e-12)
        if rank == len(slots):
            continue
        dofs = 6*node+3+slots
        available[dofs] = False
        partial.append((dofs, directions[:rank]))

    if not partial:
        return prepared, fixed, None
    # Each column is a free virtual displacement in the full coordinates.
    blocks = [np.eye(next_dof)[:, available]]
    for dofs, directions in partial:
        block = np.zeros((next_dof, len(directions)))
        block[dofs] = directions.T
        blocks.append(block)
    return prepared, fixed, np.column_stack(blocks)


def section_coordinates(row, q):
    """R_section = R_joint exp(relative rotation in declared material axes)."""
    dofs = variables(q)
    section = dofs[:12]
    for start, axes, slots in row["hinges"]:
        relative = [sum(float(a)*v for a,v in zip(column,dofs[slots])) for column in axes.T]
        section[start:start+3] = logarithm(multiply(exponential(dofs[start:start+3]),exponential(relative)))
    return np.array([value(v) for v in section]), np.array([v.g for v in section]), np.array([v.h for v in section])


def pullback(jacobian, curvature, force, tangent):
    return jacobian.T@force, jacobian.T@tangent@jacobian+np.einsum("i,ijk->jk",force,curvature)
