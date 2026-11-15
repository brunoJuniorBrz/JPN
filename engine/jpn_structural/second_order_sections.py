"""Recover section wrenches by equilibrium on the deforming element."""
import numpy as np
from numpy.polynomial.polynomial import polyder, polyval, polyroots
from scipy.spatial.transform import Rotation

from .frame3d_model import fail


def section_polynomial(element, answer, displacement):
    """Force and moment components versus initial length fraction, from the i end."""
    actions = answer["net_end_actions"]
    if element["kind"] == "axial":
        return None, np.array([[answer["axial_n"], 0., 0., 0., 0., 0.]])
    q = displacement[element["dofs"]].reshape(2, 6)
    a, b = element["coordinates"]
    chord = b-a+q[1, :3]-q[0, :3]
    axis = answer["current_basis"][0]
    length = np.linalg.norm(chord)
    directions = Rotation.from_rotvec(q[:, 3:]).apply(element["basis"][0])
    slopes = (length/(directions@axis))[:, None]*directions
    path = np.array([np.zeros(3), slopes[0], 3*chord-2*slopes[0]-slopes[1],
                     -2*chord+slopes[0]+slopes[1]])
    uniform = answer.get("uniform_action")
    total = np.zeros(3) if uniform is None else uniform["force"]
    coeff = np.zeros((5, 6))
    coeff[0] = -actions[:6]
    coeff[1, :3] = -total
    coeff[:4, 3:] += np.cross(path, actions[:3])
    # Integral of (r(s)-r(t)) cross W for t in [0,s].
    coeff[1:, 3:] += np.cross(path*(np.arange(4)/np.arange(1, 5))[:, None], total)
    return path, coeff


def local_polynomial(coeff, basis):
    return (coeff.reshape(-1, 2, 3)@basis.T).reshape(-1, 6)


def peak_efforts(elements, rows, displacement):
    """Exact absolute polynomial maxima, componentwise, swept over each bar."""
    peaks = {}
    for element, answer in zip(elements, rows):
        _, coeff = section_polynomial(element, answer, displacement)
        if element["kind"] == "frame":
            coeff = local_polynomial(coeff, answer["current_basis"])
        maxima = np.empty(6)
        for i, component in enumerate(coeff.T):
            derivative = np.trim_zeros(polyder(component), "b")
            roots = polyroots(derivative) if len(derivative)>1 else ()
            locations = [0., 1., *(r.real for r in roots if abs(r.imag)<1e-12 and 0.<r.real<1.)]
            maxima[i] = np.max(np.abs(polyval(locations, component)))
        parent = element["parent"]
        peaks[parent] = np.maximum(maxima, peaks.get(parent, 0.))
    return peaks
