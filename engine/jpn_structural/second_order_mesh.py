"""Refinement policy for the experimental mixed second-order solver."""
import numpy as np

from .frame3d_model import fail

INITIAL_SUBDIVISIONS = 1
MIN_REFINEMENTS = 2
MAX_SUBDIVISIONS = 32
MAX_MESH_NODES = 384
AMPLIFICATION_RTOL = .01
EFFORT_RTOL = .02
EFFORT_ATOL = .01  # N or N m, per component


def refine(elements, coordinates, fixed, subdivisions):
    node_count = len(coordinates)+(subdivisions-1)*sum(e["kind"]=="frame" for e in elements)
    if node_count > MAX_MESH_NODES:
        fail("SECOND_ORDER_MESH_NOT_CONVERGED", f"Refinement exceeds {MAX_MESH_NODES} nodes.")
    if subdivisions > MAX_SUBDIVISIONS:
        fail("SECOND_ORDER_MESH_NOT_CONVERGED", f"Refinement exceeds {MAX_SUBDIVISIONS} subdivisions.")
    nodes = list(coordinates)
    segments = []
    for element in elements:
        parent = element["id"]
        if element["kind"] == "axial":
            segments.append(dict(element, parent=parent, part=0))
            continue
        a, b = element["coordinates"]
        chain = [element["dofs"][0]//6]
        for i in range(1, subdivisions):
            chain.append(len(nodes))
            nodes.append(a+(i/subdivisions)*(b-a))
        chain.append(element["dofs"][6]//6)
        for i, (j, k) in enumerate(zip(chain, chain[1:])):
            segments.append(dict(element, id=(parent, i), parent=parent, part=i,
                                 dofs=np.r_[6*j:6*j+6, 6*k:6*k+6],
                                 coordinates=np.array([nodes[j], nodes[k]])))
    return segments, np.array(nodes), np.pad(fixed, (0, 6*(len(nodes)-len(coordinates))))


def converged(previous, current):
    amp, peaks = current
    old_amp, old_peaks = previous
    if abs(amp-old_amp) > AMPLIFICATION_RTOL*max(amp, old_amp, 1.):
        return False
    return all(np.all(np.abs(value-old_peaks[mid]) <= EFFORT_ATOL+EFFORT_RTOL*np.maximum(value,old_peaks[mid]))
               for mid,value in peaks.items())
