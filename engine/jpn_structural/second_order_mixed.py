"""Research mixed corotational assembly with M43 frames and true axial bars."""
import numpy as np

from .frame3d_model import fail
from .mixed_initial_stress import axial_geometric, stable_solve
from .model import AnalysisError
from .spatial_corotational import element_response

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


def assemble(elements, u, spring):
    force = spring@u if spring is not None else np.zeros(len(u))
    tangent = spring.copy() if spring is not None else np.zeros((len(u),len(u)))
    rows = []
    for row in elements:
        dofs = row["dofs"]
        x = row["coordinates"]
        if row["kind"] == "axial":
            answer = axial_response(x,u[dofs],row["ea"])
        else:
            answer = frame_response(row,u[dofs])
        force[dofs] += answer["force"]
        tangent[np.ix_(dofs,dofs)] += answer["tangent"]
        rows.append(answer)
    return force,tangent,rows


def _solve(matrix, force, free):
    try:
        return stable_solve(matrix,force,free)
    except AnalysisError as error:
        if error.code == "UNSTABLE":
            fail("SECOND_ORDER_BEYOND_CRITICAL", "The reduced tangent lost positive definiteness.")
        if error.code == "ILL_CONDITIONED":
            fail("SECOND_ORDER_NOT_CONVERGED", "The reduced tangent is ill-conditioned.")
        raise


def solve_combination(elements, coordinates, fixed, load, *, spring=None, initial=None):
    """Dead nodal forces. The optional elastic spring is for the research fixture."""
    span = max(1e-5,float(np.ptp(coordinates,axis=0).max()))
    if np.any(load.reshape(-1,6)[:,3:]):
        fail("SECOND_ORDER_UNSUPPORTED_LOAD", "General dead couples lack a scalar SO(3) potential.")
    free = np.flatnonzero(~fixed)
    units = np.tile([1.,1.,1.,span,span,span],len(coordinates))
    def norm(residual):
        return float(np.linalg.norm(residual[free]/units[free]))
    denominator = max(1.,norm(load))
    u = np.zeros(len(load))
    state = assemble(elements,u,spring) if initial is None else initial
    linear,_ = _solve(state[1],load,free)
    for iteration in range(MAX_ITERATIONS+1):
        internal,tangent,rows = state
        residual = internal-load
        delta,condition = _solve(tangent,-residual,free)
        relative_norm = norm(residual)
        if relative_norm <= NEWTON_RELATIVE*denominator:
            break
        if iteration == MAX_ITERATIONS:
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton iteration limit reached.")
        for exponent in range(9):
            trial = u+delta*(2.**-exponent)
            try:
                next_state = assemble(elements,trial,spring)
            except AnalysisError as error:
                if error.code.startswith("SPATIAL_") or error.code=="SECOND_ORDER_NOT_CONVERGED":
                    continue
                raise
            if norm(next_state[0]-load) < relative_norm:
                u,state = trial,next_state
                break
        else:
            fail("SECOND_ORDER_NOT_CONVERGED", "Newton search could not reduce the free residual.")

    spring_force = spring@u if spring is not None else np.zeros(len(u))
    physical = spring_force.copy()
    for element,row in zip(elements,rows):
        physical[element["dofs"]] += row["physical_end_actions"]
    support = np.where(fixed,physical-load,0.)
    wrenches = (load+support-spring_force).reshape(-1,6)
    locations = coordinates-coordinates[0]+u.reshape(-1,6)[:,:3]
    force = np.sum(wrenches[:,:3],axis=0)
    moment = np.sum(wrenches[:,3:]+np.cross(locations,wrenches[:,:3]),axis=0)
    scale = max(1.,float(np.sum(np.linalg.norm(wrenches[:,:3],axis=1)
                               +np.linalg.norm(wrenches[:,3:],axis=1)/span)))
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
            if any(member["release_start"]+member["release_end"]):
                fail("SECOND_ORDER_UNSUPPORTED_RELEASE", "Frame releases require validated nonlinear condensation.")
            mat,sec = materials[member["material"]],sections[member["section"]]
            E = mat["e_pa"]
            row.update(ea=E*sec["area_m2"],eiy=E*sec["iy_m4"],eiz=E*sec["iz_m4"],
                       gj=mat["g_pa"]*sec["j_m4"],
                       basis=rolled(reference_basis(*x,member["id"]),member["rotation_deg"]))
        elements.append(row)
    return elements,coordinates,fixed.ravel(),index
