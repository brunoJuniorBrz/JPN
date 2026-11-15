"""JPN Z-up local axis reference, realised ONLY through PyNite's own `rotation`.

PyNite 3.2.1 builds member axes for a Y-up world (Member3D.T). JPN is Z-up, so
with a declared roll of zero the section's physical orientation depended on
the member's global direction. This module defines one reference:

    x      start -> end
    y_ref  unit(ez x x)          horizontal
    z_ref  x cross y_ref         in the member's vertical plane, upward
    exactly vertical members:    y_ref = +Y global

The declared roll is a right-hand rotation of (y_ref, z_ref) about x. Reversing
a non-vertical member's ends keeps z_ref and flips y_ref, so the physical
section is unchanged. Members within one degree of vertical, but not exactly
vertical, are refused: there the horizontal reference flips with a tiny lean.

No stiffness, element formulation or tolerance of the solver is modified.
"""
import math

import numpy as np

from .frame3d_model import fail

CONVENTION = "jpn-z-up/1"
EXACT_VERTICAL = 1e-9
NEAR_VERTICAL = math.sin(math.radians(1.))
ANGLE_TOLERANCE_DEG = 1e-7


def _unit_x(a, b):
    d = np.asarray(b, dtype=float)-np.asarray(a, dtype=float)
    length = float(np.linalg.norm(d))
    if not length > 0:
        fail("INVALID_GEOMETRY", "Barra de comprimento nulo.")
    return d/length


def reference_basis(a, b, member="barra"):
    """Rows x, y_ref, z_ref in global coordinates for zero declared roll."""
    x = _unit_x(a, b)
    horizontal = np.cross([0., 0., 1.], x)
    size = float(np.linalg.norm(horizontal))
    if size <= EXACT_VERTICAL:
        y = np.array([0., 1., 0.])
    elif size < NEAR_VERTICAL:
        fail("AXIS_REFERENCE_NEAR_VERTICAL", f"{member}: a menos de 1 grau da vertical a referência horizontal é ambígua; "
             "modele a barra exatamente vertical ou revise a geometria.")
    else:
        y = horizontal/size
    z = np.cross(x, y)
    return np.array([x, y, z/np.linalg.norm(z)])


def rolled(basis, degrees):
    """Right-hand roll of rows y, z about row x (same rule PyNite applies)."""
    x, t = basis[0], math.radians(degrees)
    turn = lambda v: v*math.cos(t)+np.cross(x, v)*math.sin(t)+x*float(x@v)*(1-math.cos(t))
    return np.array([x, turn(basis[1]), turn(basis[2])])


def pynite_zero_roll_basis(a, b):
    """The library's own basis for these exact coordinates, never a re-derivation."""
    from Pynite import FEModel3D
    model = FEModel3D()
    model.add_node("a", *map(float, a)); model.add_node("b", *map(float, b))
    model.add_material("m", 1., 1., .3, 0.); model.add_section("s", 1., 1., 1., 1.)
    model.add_member("e", "a", "b", "m", "s")
    return np.asarray(model.members["e"].T()[:3, :3], dtype=float)


def wrap(degrees):
    value = (degrees+180.) % 360.-180.
    return 180. if value == -180. else value


def offset_deg(a, b, member="barra"):
    """Signed angle about x from PyNite's zero-roll y to the JPN y_ref."""
    native, reference = pynite_zero_roll_basis(a, b), reference_basis(a, b, member)
    x, y0, y = native[0], native[1], reference[1]
    return math.degrees(math.atan2(float(x@np.cross(y0, y)), float(y0@y)))


def pynite_rotation(a, b, declared_deg, member="barra"):
    return wrap(declared_deg+offset_deg(a, b, member))


def legacy_axis_ambiguity(data):
    """Frame members of a /1 or /2 request whose PHYSICAL section orientation
    is decided by PyNite's Y-up branches instead of the declared roll.

    Members with equal principal inertias are unaffected. An offset of exactly
    0 or 180 degrees gives the same physical section (180 only flips local
    signs), so those are not ambiguous either. Input must already be valid.
    """
    points = {n["id"]: (n["x_m"], n["y_m"], n["z_m"]) for n in data["nodes"]}
    sections = {s["id"]: s for s in data["sections"]}
    found = []
    for m in data["members"]:
        if m.get("kind") != "frame":
            continue
        s = sections[m["section"]]
        if math.isclose(s["iy_m4"], s["iz_m4"], rel_tol=1e-9, abs_tol=0.):
            continue
        x = _unit_x(points[m["start"]], points[m["end"]])
        lean = float(np.linalg.norm(np.cross([0., 0., 1.], x)))
        if EXACT_VERTICAL < lean < NEAR_VERTICAL:
            found.append(m["id"]); continue
        delta = offset_deg(points[m["start"]], points[m["end"]], m["id"])
        if min(abs(delta), abs(abs(delta)-180.)) > ANGLE_TOLERANCE_DEG:
            found.append(m["id"])
    return found


def refuse_ambiguous_legacy_axes(data):
    members = legacy_axis_ambiguity(data)
    if members:
        fail("AXIS_CONVENTION_AMBIGUOUS", "Nos contratos mixed3d/1 e /2 a orientação física da seção destas barras "
             "(Iy diferente de Iz) depende da direção global, não do giro declarado: "
             + ", ".join(members[:8])+("..." if len(members) > 8 else "")
             + ". Use jpn.mixed3d/3 com local_axes='jpn-z-up/1' e revise o giro de cada peça.")
