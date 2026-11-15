"""Research mixed corotational assembly with M43 frames and true axial bars."""
import numpy as np

from .frame3d_model import fail
from .mixed_initial_stress import axial_geometric, stable_solve
from .model import AnalysisError
from .spatial_corotational import dot, element_response, exponential, left_jacobian, rotate
from .second_jet import variables
from .second_order_releases import pullback, section_coordinates
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


def uniform_centroid(row, q):
    """Dead UDL per initial length, integrated over the cubic centerline.

    Its centroid is the midpoint plus L/12 times the difference of end
    slopes. Differentiating the load potential yields consistent nodal
    actions and an external tangent; no dead nodal couple is substituted.
    """
    a,b = row["coordinates"]
    v = variables(q)
    chord = [float(b[i]-a[i])+v[6+i]-v[i] for i in range(3)]
    length = dot(chord,chord)**.5
    axis = [c/length for c in chord]
    di,dj = [rotate(exponential(v[k:k+3]),[float(c) for c in row["basis"][0]]) for k in (3,9)]
    ni,nj = dot(di,axis),dot(dj,axis)
    if min(ni.v,nj.v) <= 0.:
        fail("SECOND_ORDER_NOT_CONVERGED", "Distributed load reached a singular centerline slope.")
    # Relative to start reference position, to avoid a large constant energy.
    center = [(float(b[i]-a[i])+v[i]+v[6+i])/2+length*(di[i]/ni-dj[i]/nj)/12 for i in range(3)]
    return center


def dead_uniform_action(row, q, force, *, centroid=None):
    center = uniform_centroid(row,q) if centroid is None else centroid
    work = dot(center,[float(f) for f in force])
    physical = work.g.copy()
    for k in (3,9):
        physical[k:k+3] = np.linalg.solve(left_jacobian(q[k:k+3]).T,physical[k:k+3])
    return dict(generalized=work.g,tangent=work.h,physical=physical,
                force=force,center=row["coordinates"][0]+np.array([c.v for c in center]))


def assemble(elements, u, spring, uniform=None):
    force = spring@u if spring is not None else np.zeros(len(u))
    tangent = spring.copy() if spring is not None else np.zeros((len(u),len(u)))
    rows = []
    for row in elements:
        dofs = row.get("assembly_dofs",row["dofs"])
        x = row["coordinates"]
        if row["kind"] == "axial":
            answer = axial_response(x,u[dofs],row["ea"])
        elif row.get("hinges"):
            section,jacobian,curvature = section_coordinates(row,u[dofs])
            answer = frame_response(row,section)
            answer["force"],answer["tangent"] = pullback(jacobian,curvature,answer["force"],answer["tangent"])
            answer.update(section_q=section,release_derivatives=(jacobian,curvature))
        else:
            answer = frame_response(row,u[dofs])
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
        section = answer["section_q"] if row.get("hinges") else u[dofs]
        if centroids is None:
            action = dead_uniform_action(row,section,value)
        else:
            if i not in centroids:
                centroids[i] = uniform_centroid(row,section)
            action = dead_uniform_action(row,section,value,centroid=centroids[i])
        if row.get("hinges"):
            action["generalized"],action["tangent"] = pullback(
                *answer["release_derivatives"],action["generalized"],action["tangent"])
        rows[i] = {**rows[i],"uniform_action":action}
        force[dofs] -= action["generalized"]
        tangent[np.ix_(dofs,dofs)] -= action["tangent"]
    return force,tangent,rows


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
    for iteration in range(MAX_ITERATIONS+1):
        internal,tangent,rows = state
        residual = internal-load
        delta,condition = solve(tangent,-residual)
        relative_norm = norm(residual)
        if relative_norm <= NEWTON_RELATIVE*denominator:
            break
        if iteration == MAX_ITERATIONS:
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton iteration limit reached.")
        for exponent in range(9):
            trial = u+delta*(2.**-exponent)
            try:
                next_state = assemble(elements,trial,spring,uniform)
            except AnalysisError as error:
                if error.code.startswith("SPATIAL_") or error.code=="SECOND_ORDER_NOT_CONVERGED":
                    continue
                raise
            if norm(next_state[0]-load) < relative_norm:
                u,state = trial,next_state
                break
        else:
            # At a stalled iterate, test the residual against the force error
            # induced by rounding each stored free coordinate to nearest.
            # The engineering equilibrium audit below still applies in full.
            quantum = np.abs(np.spacing(u[free]))/2
            if projection is None:
                roundoff = abs(tangent[np.ix_(free,free)])@quantum
                unbalanced = abs(residual[free])
            else:
                roundoff = abs(projection.T@tangent[:,free])@quantum
                unbalanced = abs(projection.T@residual)
            if np.any((delta[free]!=0.)&(u[free]+delta[free]==u[free])) and np.all(unbalanced<=roundoff):
                break
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton search could not reduce the free residual.")

    motion = u[:physical_size].reshape(-1,6)
    if np.max(np.linalg.norm(motion[:,:3],axis=1))/span > .01 or np.max(np.linalg.norm(motion[:,3:],axis=1)) > .05:
        fail("SECOND_ORDER_NOT_CONVERGED", "Motion exceeds the corotational research domain.")
    spring_force = spring@u if spring is not None else np.zeros(len(u))
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
