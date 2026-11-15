"""Recover section wrenches by equilibrium on the deforming element."""
import numpy as np
from numpy.polynomial.polynomial import polyder, polyval, polyroots
from scipy.spatial.transform import Rotation

from .frame3d_model import fail
from .second_order_mixed import EQUILIBRIUM_RELATIVE

STATION_KEYS = ("n_n", "vy_n", "vz_n", "t_nm", "my_nm", "mz_nm")


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


def recover_members(elements, rows, displacement, subdivisions):
    """Report original-member actions and the five standard design stations."""
    groups = {}
    joint_force = np.zeros(len(displacement)//6)
    joint_moment = np.zeros_like(joint_force)
    for element, row in zip(elements, rows):
        groups.setdefault(element["parent"], []).append((element, row))
        actions = row["net_end_actions"].reshape(2,-1)
        nodes = element["dofs"].reshape(2,-1)[:,0]//6
        joint_force[nodes] += np.linalg.norm(actions[:,:3],axis=1)
        if element["kind"] == "frame":
            joint_moment[nodes] += np.linalg.norm(actions[:,3:],axis=1)
    members = {}
    for mid, group in groups.items():
        first, last = group[0][1], group[-1][1]
        start, end = group[0][0], group[-1][0]
        length = float(np.linalg.norm(end["coordinates"][1]-start["coordinates"][0]))
        if start["kind"] == "axial":
            actions = first["net_end_actions"].reshape(2,3)
            chord = start["coordinates"][1]-start["coordinates"][0]+np.diff(
                displacement[start["dofs"]].reshape(2,3),axis=0)[0]
            residual = max(np.linalg.norm(actions.sum(axis=0)),
                           np.linalg.norm(np.cross(chord,actions[1]))/length)
            relative = residual/max(1.,float(np.linalg.norm(actions,axis=1).sum()))
            if relative >= EQUILIBRIUM_RELATIVE:
                fail("SECOND_ORDER_MEMBER_EQUILIBRIUM",f"{mid}: deformed axial equilibrium exceeds 1e-8.")
            members[mid] = dict(kind="axial", axial_n=first["axial_n"], length_m=length,
                                extension_m=first["length"]-length,
                                end_actions_global=first["net_end_actions"].tolist(),equilibrium_relative=float(relative))
            continue
        start_action, end_action = first["net_end_actions"][:6], last["net_end_actions"][6:]
        stations, axes, polynomials = [], [], []
        force = start_action[:3]+end_action[:3]
        base = start["coordinates"][0]+displacement[start["dofs"][:3]]
        tip = end["coordinates"][1]+displacement[end["dofs"][6:9]]
        moment = start_action[3:]+end_action[3:]+np.cross(tip-base,end_action[:3])
        scale = sum(np.linalg.norm(action[:3])+np.linalg.norm(action[3:])/length
                    for action in (start_action,end_action))
        for element,row in group:
            path, coeff = section_polynomial(element,row,displacement)
            root = element["coordinates"][0]+displacement[element["dofs"][:3]]
            load = row.get("uniform_action")
            if load is not None:
                force += load["force"]
                moment += np.cross(root-base+polyval(1.,path/np.arange(1,5)[:, None]),load["force"])
                scale += np.linalg.norm(load["force"])
            segment_length = np.linalg.norm(element["coordinates"][1]-element["coordinates"][0])
            tail = row["net_end_actions"][6:]
            residual = polyval(1.,coeff)-tail
            local_scale = sum(np.linalg.norm(action[:3])+np.linalg.norm(action[3:])/segment_length
                              for action in row["net_end_actions"].reshape(2,6))
            if np.linalg.norm(residual[:3])+np.linalg.norm(residual[3:])/segment_length > EQUILIBRIUM_RELATIVE*max(1.,local_scale):
                fail("SECOND_ORDER_MEMBER_EQUILIBRIUM",f"{mid}: section wrench does not close at the j end.")
            polynomials.append((element,row,path,coeff))
        # An unloaded member can join heavily loaded members. Its endpoint
        # mismatch inherits the Newton residual of those joints. Normalize
        # the assembled member check by the local joint force scale, while
        # keeping the independent child free-body checks scaled by own actions.
        ends = [start["dofs"][0]//6,end["dofs"][6]//6]
        joint_scale = np.max(joint_force[ends]+joint_moment[ends]/length)
        relative = max(np.linalg.norm(force),np.linalg.norm(moment)/length)/max(1.,scale,joint_scale)
        if relative >= EQUILIBRIUM_RELATIVE:
            fail("SECOND_ORDER_MEMBER_EQUILIBRIUM",f"{mid}: deformed member equilibrium exceeds 1e-8.")
        n = subdivisions[mid]
        for fraction in (0.,.25,.5,.75,1.):
            index = min(int(fraction*n),n-1)
            s = fraction*n-index
            element,row,path,coeff = polynomials[index]
            basis = row["current_basis"]
            translation = (displacement[element["dofs"][:3]]+polyval(s,path)
                           -s*(element["coordinates"][1]-element["coordinates"][0]))
            stations.append(dict(zip(STATION_KEYS,map(float,local_polynomial(polyval(s,coeff),basis)[0])),
                                 x_m=length*fraction,translation_local_m=(basis@translation).tolist()))
            axes.append(basis.tolist())
        local_ends = np.r_[local_polynomial(start_action,first["current_basis"])[0],
                           local_polynomial(end_action,last["current_basis"])[0]]
        members[mid] = dict(kind="frame",length_m=length,end_actions_global=np.r_[start_action,end_action].tolist(),
                            end_actions_local=local_ends.tolist(),stations=stations,station_global_to_local=axes,
                            equilibrium_relative=float(relative))
    return members
