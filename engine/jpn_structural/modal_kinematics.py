"""Corrections to pyCUFSM 0.2.0 modal kinematics, checked against CUFSM.

Reference: thinwalled/cufsm-git ab449cef, yDOFs/base_vectors (MIT).
Finite-strip element matrices still come from the pinned real library.
Sectorial coordinates are defined up to 1,x,z: their complete global span
does not depend on the warping origin or on a principal-axis rotation.
"""
import numpy as np
from scipy.linalg import null_space

from .frame3d_model import fail


def corner_constraints(main, meta):
    rx,rz = [],[]
    for i,node in enumerate(main):
        adjacent = np.flatnonzero((meta[:,1]==i)|(meta[:,2]==i))
        if len(adjacent) <= 1:
            continue
        directions,rhs = [],[]
        for index in adjacent:
            edge = meta[index]
            other = int(edge[2] if int(edge[1])==i else edge[1])
            vector = main[other,1:3]-node[1:3]; length = np.linalg.norm(vector)
            directions.append(vector/length)
            row = np.zeros(len(main)); row[i] = 1/length; row[other] = -1/length; rhs.append(row)
        if len(directions)!=2 or abs(np.linalg.det(directions))<1e-12:
            fail('UNSUPPORTED_MODEL', 'Initial corrected Ue corner domain requires two nonparallel walls.')
        mapping = np.linalg.solve(directions,rhs)
        rx.append(mapping[0]); rz.append(mapping[1])
    return np.asarray(rx),np.asarray(rz)


def longitudinal_modes(nodes, edges, main, ryd, rud, nd):
    count = len(nodes)
    if len(edges) != count-1:
        fail('UNSUPPORTED_MODEL', 'Modal correction is restricted to a connected open tree section.')
    visited = np.zeros(count, dtype=bool); visited[int(edges[0,1])] = True
    omega = np.zeros(count)
    for _ in edges:
        for edge in edges:
            a,b = map(int,edge[1:3])
            if visited[a] != visited[b]:
                sector = nodes[a,1]*nodes[b,2]-nodes[b,1]*nodes[a,2]
                if visited[a]:
                    omega[b] = omega[a]+sector; visited[b] = True
                else:
                    omega[a] = omega[b]-sector; visited[a] = True
                break
        else:
            fail('UNSUPPORTED_MODEL', 'Disconnected or cyclic modal section.')
    indices = main[:,3].astype(int)
    global_modes = np.column_stack((np.ones(len(main)),main[:,1],main[:,2],omega[indices]))
    if np.linalg.matrix_rank(global_modes) != 4:
        fail('MODAL_BASIS_RANK_DEFICIENT', 'Four global longitudinal modes required for this Ue domain.')
    ch = np.linalg.cholesky(ryd).T
    complement = np.linalg.solve(ch,null_space((ch@global_modes).T))
    # Intersection with the admissible longitudinal constraint space, as in
    # original CUFSM. Preserve the entire space, including every dist. mode.
    constraints = np.column_stack((null_space(complement.T),null_space(rud.T)))
    dist = null_space(constraints.T)
    if dist.shape[1] != nd:
        fail('MODAL_BASIS_RANK_DEFICIENT', 'Distortional space dimension disagrees with native topology.')
    return np.column_stack((global_modes,dist))


def local_modes(nodes, edges, node_props, local_count):
    count = len(nodes)
    columns = []
    # A local mode admits cross-section rotations at all nodes. At nodes
    # within a straight wall and at free edges it also admits transverse
    # displacement NORMAL TO THAT WALL, not normal to element zero.
    for i in range(count):
        v = np.zeros(4*count); v[2*count+2*i+1] = 1.; columns.append(v)
    for i, prop in enumerate(node_props):
        if prop[3] in (2,3):
            adjacent = np.flatnonzero((edges[:,1]==i)|(edges[:,2]==i))
            a,b = edges[adjacent[0],1:3].astype(int)
            direction = nodes[b,1:3]-nodes[a,1:3]; direction /= np.linalg.norm(direction)
            v = np.zeros(4*count); v[2*i] = -direction[1]; v[2*count+2*i] = direction[0]
            columns.append(v)
    result = np.column_stack(columns)
    if result.shape[1] != local_count:
        fail('MODAL_BASIS_RANK_DEFICIENT', 'Local space dimension disagrees with native topology.')
    return result
