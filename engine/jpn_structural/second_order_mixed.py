"""Research mixed corotational assembly with M43 frames and true axial bars."""
from math import fsum

import numpy as np

from .frame3d_model import fail
from .mixed_initial_stress import axial_geometric, stable_solve
from .model import AnalysisError
from .spatial_corotational import element_response, left_jacobian
from .second_order_releases import pullback, section_coordinates
from .second_order_uniform import uniform_centroid
from . import second_order_system as system

NEWTON_RELATIVE = 1e-11
EQUILIBRIUM_RELATIVE = 1e-8
MAX_ITERATIONS = 30


def axial_response(x, u, ea):
    """Exact derivatives of EA*(L-L0)**2/(2*L0), tension positive."""
    reference = x[1]-x[0]
    relative = u[3:]-u[:3]
    chord = reference+relative
    initial, length = float(np.linalg.norm(reference)), float(np.linalg.norm(chord))
    if initial < 1e-5 or length < 1e-5:
        fail("SECOND_ORDER_NOT_CONVERGED", "Degenerate axial chord.")
    extension = float((2*reference@relative+relative@relative)/(length+initial))
    if abs(extension) > .01*initial:
        fail("SECOND_ORDER_NOT_CONVERGED", "Axial strain exceeds the elastic research domain.")
    direction = chord/length
    normal = ea*extension/initial
    axis = np.r_[-direction,direction]
    geometric = axial_geometric(direction,normal,length)
    force = normal*axis
    return dict(force=force, tangent=ea/initial*np.outer(axis,axis)+geometric,
                physical_end_actions=force, axial_n=normal, geometric=geometric, length=length)


def frame_response(row, q):
    # Apply the fixed reference change of coordinates before evaluating P4.
    # It represents the initial chord exactly along X and avoids subtracting
    # O(1) reference-quaternion terms to recover tiny end rotations.
    basis = row["basis"]
    length = float(np.linalg.norm(row["coordinates"][1]-row["coordinates"][0]))
    transform = np.kron(np.eye(4),basis)
    coordinates = np.array([[0.,0.,0.],[length,0.,0.]])
    result = element_response(coordinates,transform@q,row["ea"],row["eiy"],row["eiz"],row["gj"],np.eye(3))
    result["force"] = transform.T@result["force"]
    result["tangent"] = transform.T@result["tangent"]@transform
    result["physical_end_actions"] = transform.T@result["physical_end_actions"]
    result["current_basis"] = result["current_basis"]@basis
    return result


def frame_responses(rows, coordinates):
    return [frame_response(row,q) for row,q in zip(rows,coordinates)]


def dead_uniform_action(row, q, force, *, centroid=None):
    center,jacobian,hessian = uniform_centroid(row,q) if centroid is None else centroid
    generalized = force@jacobian
    physical = generalized.copy()
    for k in (3,9):
        physical[k:k+3] = np.linalg.solve(left_jacobian(q[k:k+3]).T,physical[k:k+3])
    return dict(generalized=generalized,tangent=np.einsum("i,ijk->jk",force,hessian),physical=physical,
                force=force,center=center)


def _section_displacement(u, low, dofs, end):
    q = u[dofs]
    # Both potentials are invariant in their derivatives under a common
    # translation. Evaluate the chord from the high and low differences.
    for i in range(3):
        q[end+i] = fsum((q[end+i],-q[i],low[dofs[end+i]],-low[dofs[i]]))
    q[:3] = 0.
    return q


def assemble(elements, u, spring, uniform=None, *, low=None):
    force = spring@u if spring is not None else np.zeros(len(u))
    if spring is not None and low is not None:
        force += spring@low
    tangent = spring.copy() if spring is not None else np.zeros((len(u),len(u)))
    frame_rows,frame_q,hinges = [],[],{}
    for i,row in enumerate(elements):
        if row["kind"]=="frame":
            dofs = row.get("assembly_dofs",row["dofs"])
            q = u[dofs] if low is None else _section_displacement(u,low,dofs,6)
            if row.get("hinges"):
                q,jacobian,curvature = section_coordinates(row,q)
                hinges[i] = (jacobian,curvature)
            frame_rows.append(row)
            frame_q.append(q)
    responses = iter(zip(frame_responses(frame_rows,frame_q),frame_q)) if frame_rows else iter(())
    rows = []
    for i,row in enumerate(elements):
        dofs = row.get("assembly_dofs",row["dofs"])
        x = row["coordinates"]
        if row["kind"] == "axial":
            q = u[dofs] if low is None else _section_displacement(u,low,dofs,3)
            answer = axial_response(x,q,row["ea"])
        else:
            answer,section = next(responses)
            if low is not None:
                answer["section_q"] = section
                answer["translation_origin"] = u[dofs[:3]]+low[dofs[:3]]
            if i in hinges:
                jacobian,curvature = hinges[i]
                answer["force"],answer["tangent"] = pullback(jacobian,curvature,answer["force"],answer["tangent"])
                answer.update(section_q=section,release_derivatives=(jacobian,curvature))
        force[dofs] += answer["force"]
        tangent[np.ix_(dofs,dofs)] += answer["tangent"]
        rows.append(answer)
    state = (force,tangent,rows)
    return apply_uniform(elements,u,uniform,state) if uniform else state


def apply_uniform(elements, u, uniform, state, centroids=None):
    # The undeformed material response is shared, but loads and their
    # tangent are evaluated independently for each combination.
    force,tangent,rows = state[0].copy(),state[1].copy(),list(state[2])
    for i,row in enumerate(elements):
        value = uniform.get(row["id"])
        if value is None:
            continue
        dofs = row.get("assembly_dofs",row["dofs"])
        answer = rows[i]
        section = answer["section_q"] if "section_q" in answer else u[dofs]
        if centroids is None:
            action = dead_uniform_action(row,section,value)
        else:
            if i not in centroids:
                centroids[i] = uniform_centroid(row,section)
            action = dead_uniform_action(row,section,value,centroid=centroids[i])
        if "translation_origin" in answer:
            action["center"] += answer["translation_origin"]
        if row.get("hinges"):
            action["generalized"],action["tangent"] = pullback(
                *answer["release_derivatives"],action["generalized"],action["tangent"])
        rows[i] = {**rows[i],"uniform_action":action}
        force[dofs] -= action["generalized"]
        tangent[np.ix_(dofs,dofs)] -= action["tangent"]
    return force,tangent,rows


def _sum_with_roundoff(a,b):
    summed = a+b
    part = summed-a
    return summed,(a-(summed-part))+(b-part)


def _solve(matrix, force, free, *, reference=False, cache=None):
    try:
        if reference and cache is not None:
            if "factor" not in cache:
                cache["factor"] = system.factor_system(matrix,free)
            return cache["factor"](force)
        if len(free)>=system.BAND_THRESHOLD:
            return system.factor_system(matrix,free)(force)
        return stable_solve(matrix,force,free)
    except AnalysisError as error:
        if error.code == "UNSTABLE":
            if reference:
                fail("SECOND_ORDER_NOT_CONVERGED", "The unloaded model has a mechanism.")
            fail("SECOND_ORDER_BEYOND_CRITICAL", "The reduced tangent lost positive definiteness.")
        if error.code == "ILL_CONDITIONED":
            fail("SECOND_ORDER_NOT_CONVERGED", "The reduced tangent is ill-conditioned.")
        raise


def solve_combination(elements, coordinates, fixed, load, *, spring=None, initial=None, uniform=None, projection=None,
                      reference_cache=None):
    """Dead nodal forces. The optional elastic spring is for the research fixture."""
    span = max(1e-5,float(np.ptp(coordinates,axis=0).max()))
    physical_size = 6*len(coordinates)
    if np.any(load[:physical_size].reshape(-1,6)[:,3:]):
        fail("SECOND_ORDER_UNSUPPORTED_LOAD", "General dead couples lack a scalar SO(3) potential.")
    free = np.flatnonzero(~fixed)
    units = np.r_[np.tile([1.,1.,1.,span,span,span],len(coordinates)),
                  np.full(len(load)-physical_size,span)]
    def norm(residual):
        if projection is not None:
            return float(np.linalg.norm(projection.T@(residual/units)))
        return float(np.linalg.norm(residual[free]/units[free]))
    def solve(matrix, rhs, *, reference=False):
        if projection is None:
            return _solve(matrix,rhs,free,reference=reference,cache=reference_cache)
        values,condition = _solve(projection.T@matrix@projection,projection.T@rhs,
                                  np.arange(projection.shape[1]),reference=reference,cache=reference_cache)
        return projection@values,condition
    u = np.zeros(len(load))
    elastic = assemble(elements,u,spring) if initial is None else initial
    centroids = reference_cache.setdefault("centroids",{}) if reference_cache is not None else None
    state = apply_uniform(elements,u,uniform,elastic,centroids) if uniform else elastic
    rhs = load-state[0]
    denominator = max(1.,norm(rhs))
    linear,_ = solve(elastic[1],rhs,reference=True)
    low = None
    def search(delta, residual_norm, correction):
        for exponent in range(9):
            step = delta*(2.**-exponent)
            if correction is None:
                trial,tail = u+step,None
            else:
                trial,roundoff = _sum_with_roundoff(u,step)
                trial,tail = _sum_with_roundoff(trial,correction+roundoff)
            try:
                trial_state = assemble(elements,trial,spring,uniform,low=tail)
            except AnalysisError as error:
                if error.code.startswith("SPATIAL_") or error.code=="SECOND_ORDER_NOT_CONVERGED":
                    continue
                raise
            if norm(trial_state[0]-load) < residual_norm:
                return trial,trial_state,tail
        return None

    for iteration in range(MAX_ITERATIONS+1):
        internal,tangent,rows = state
        residual = internal-load
        delta,condition = solve(tangent,-residual)
        relative_norm = norm(residual)
        if relative_norm <= NEWTON_RELATIVE*denominator:
            break
        if iteration == MAX_ITERATIONS:
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton iteration limit reached.")
        advancing = search(delta,relative_norm,low)
        if advancing is None and low is None and np.any((delta[free]!=0.)&(u[free]+delta[free]==u[free])):
            # Re-evaluate the same iterate before applying the correction.
            # Otherwise the Newton direction would include the rounding
            # error of the original chord calculation.
            low = np.zeros_like(u)
            state = assemble(elements,u,spring,uniform,low=low)
            residual = state[0]-load
            delta,condition = solve(state[1],-residual)
            relative_norm = norm(residual)
            if relative_norm<=NEWTON_RELATIVE*denominator:
                internal,tangent,rows = state
                break
            advancing = search(delta,relative_norm,low)
        if advancing is None:
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton search could not reduce the free residual.")
        u,state,low = advancing

    motion = u[:physical_size].reshape(-1,6)
    if np.max(np.linalg.norm(motion[:,:3],axis=1))/span > .01 or np.max(np.linalg.norm(motion[:,3:],axis=1)) > .05:
        fail("SECOND_ORDER_NOT_CONVERGED", "Motion exceeds the corotational research domain.")
    spring_force = spring@u if spring is not None else np.zeros(len(u))
    if spring is not None and low is not None:
        spring_force += spring@low
    physical = spring_force.copy()
    line_loads = []
    for element,row in zip(elements,rows):
        net = row["physical_end_actions"].copy()
        if action := row.get("uniform_action"):
            net -= action["physical"]
            line_loads.append(action)
        row["net_end_actions"] = net
        physical[element["dofs"]] += net
    support = np.where(fixed,physical-load,0.)
    wrenches = (load+support-spring_force)[:physical_size].reshape(-1,6)
    locations = coordinates-coordinates[0]+motion[:,:3]
    force = np.sum(wrenches[:,:3],axis=0)
    moment = np.sum(wrenches[:,3:]+np.cross(locations,wrenches[:,:3]),axis=0)
    scale = max(1.,float(np.sum(np.linalg.norm(wrenches[:,:3],axis=1)
                               +np.linalg.norm(wrenches[:,3:],axis=1)/span)))
    for action in line_loads:
        total = action["force"]
        force += total
        moment += np.cross(action["center"]-coordinates[0],total)
        scale += float(np.linalg.norm(total))
    # Include the declared-free hinge torque residual from the differentiated
    # potential. There are no physical nodal reactions at hinge coordinates.
    physical[physical_size:] = internal[physical_size:]
    relative = max(norm(physical-load)/denominator,float(np.linalg.norm(force))/scale,
                   float(np.linalg.norm(moment))/(scale*span))
    if relative > EQUILIBRIUM_RELATIVE:
        fail("SECOND_ORDER_NOT_CONVERGED", "Deformed equilibrium exceeds 1e-8.")
    return dict(u=u,linear=linear,rows=rows,reactions=support,iterations=iteration,
                relative_equilibrium=relative,force=force,moment=moment,condition=condition)

def physical_model(data, points, frame_nodes, supports):
    """Build corotational elements from reviewed physical declarations."""
    from .local_axes import reference_basis, rolled

    names = list(points)
    index = {name: i for i,name in enumerate(names)}
    coordinates = np.array(list(points.values()))
    fixed = np.array([supports.get(nid,[False]*6) for nid in names],dtype=bool)
    for nid in names:
        if nid not in frame_nodes:
            fixed[index[nid],3:] = True
    materials = {r["id"]:r for r in data["materials"]}
    sections = {r["id"]:r for r in data["sections"]}
    elements = []
    for member in data["members"]:
        i,j = [index[member[k]] for k in ("start","end")]
        axial = member["kind"] == "axial"
        dofs = np.array([6*n+k for n in (i,j) for k in range(3 if axial else 6)])
        x = coordinates[[i,j]]
        row = dict(kind=member["kind"],id=member["id"],dofs=dofs,coordinates=x)
        if axial:
            row["ea"] = member["e_pa"]*member["area_m2"]
        else:
            mat,sec = materials[member["material"]],sections[member["section"]]
            E = mat["e_pa"]
            row.update(ea=E*sec["area_m2"],eiy=E*sec["iy_m4"],eiz=E*sec["iz_m4"],
                       gj=mat["g_pa"]*sec["j_m4"],
                       releases=np.array(member["release_start"][3:]+member["release_end"][3:]),
                       basis=rolled(reference_basis(*x,member["id"]),member["rotation_deg"]))
        elements.append(row)
    return elements,coordinates,fixed.ravel(),index
