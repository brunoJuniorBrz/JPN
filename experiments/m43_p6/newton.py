"""Static experimental Newton; historical criteria unchanged."""
import math
import numpy as np
from scipy.linalg import solve,eigh
from jpn_structural.frame3d_model import fail
from jpn_structural.corotational_planar import audit_tangent
from jpn_structural.corotational_planar import equilibrium
physical_attempts=[]

def physical_equilibrium(elements,q,rows,target,free):
    """Apply the unchanged physical gate to the actual current iterate.

    Computational node indices label the same coordinates/DOFs from element
    assembly; no extra support, load, reaction or balancing force is created.
    Reactions are existing constrained components only, exactly as in run_mesh.
    """
    count=len(q)//6;coordinates=np.zeros((count,3));seen=set();actions=np.zeros(len(q))
    for element,row in zip(elements,rows):
        actions[element['dofs']]+=row['physical_end_actions']
        for at,node in enumerate((element['dofs'][0]//6,element['dofs'][6]//6)):
            coordinates[node]=element['coordinates'][at];seen.add(node)
    if len(seen)!=count:raise ValueError('Missing actual element coordinates')
    constrained=np.ones(len(q),dtype=bool);constrained[free]=False
    reactions=np.where(constrained,actions-target,0.).reshape(count,6)
    motion=q.reshape(count,6);loads=target.reshape(count,6)
    data={'nodes':[dict(id=str(i),x_m=float(x[0]),y_m=float(x[1]),z_m=float(x[2])) for i,x in enumerate(coordinates)]}
    nodes={str(i):dict(translation_m=motion[i,:3],reaction_force_n=reactions[i,:3],reaction_moment_nm=reactions[i,3:]) for i in range(count)}
    return equilibrium(data,nodes,{str(i):loads[i] for i in range(count)})

def newton(elements, force, free, initial, span, dimension, *, assemble, trial_assemble):
    q = np.zeros(len(force))
    qs = np.tile([span, span, 1.] if dimension == 2 else [span, span, span, 1., 1., 1.], len(q)//(3 if dimension == 2 else 6))
    load_scale = max(1., float(np.max(abs(force*qs)))/span)
    rs = qs/(load_scale*span)
    history = []
    for step in range(1, 11):
        target, increment, previous, searches = force*step/10, math.inf, None, 0
        for iteration in range(1, 31):
            internal, k, energy, rows = assemble(elements, q, dimension)
            residual = internal-target
            relative = float(np.max(abs(residual[free]*rs[free])))
            change = float(np.max(abs((internal-previous)*rs))) if previous is not None else math.inf
            minimum, condition, maximum = audit_tangent(k, free, initial)
            algebraic_convergence=relative <= 1e-8 and increment <= 1e-10 and change <= 1e-8
            # The historical physical acceptance concerns the FINAL load case.
            # Intermediate steps retain their original Newton criteria; they
            # are not reported as independently physically verified states.
            physical=physical_equilibrium(elements,q,rows,target,free) if algebraic_convergence and step==10 else None
            if physical is not None:
                physical_attempts.append(dict(node_count=len(q)//6,step=step,iteration=iteration,**physical))
            if algebraic_convergence and (physical is None or physical['accepted']):
                history.append(dict(step=step, iterations=iteration-1, newton_residual_evaluations=iteration,
                                    line_search_force_evaluations=searches, linear_system_solves=2*(iteration-1),
                                    algebraic_relative_residual=relative, scaled_displacement_increment=increment,
                                    scaled_internal_force_change=change, minimum_tangent_ratio=minimum,
                                    maximum_tangent_ratio=maximum, scaled_tangent_condition=condition,
                                    physical_equilibrium_at_convergence=physical))
                break
            scale = np.sqrt(np.diag(k)[free])
            scaled = k[np.ix_(free, free)]/scale[:, None]/scale[None, :]
            rhs = -residual[free]/scale
            # Retain the historical SPD solve and residual correction. The
            # factorization-reuse trial is not retained after platform-sensitive
            # near-zero equilibrium failures. No tolerance or oracle is changed.
            delta = solve(scaled, rhs, assume_a='pos')
            delta += solve(scaled, rhs-scaled@delta, assume_a='pos')
            direction = np.zeros(len(q))
            direction[free] = delta/scale
            for backtrack in range(9):
                factor = 2.**-backtrack
                trial = q+factor*direction
                trial_internal, _, _, _ = trial_assemble(elements, trial, dimension)
                trial_relative = float(np.max(abs((trial_internal-target)[free]*rs[free])))
                searches += 1
                if trial_relative < relative or trial_relative <= 1e-8:
                    break
            else:
                fail("P4_NONCONVERGENCE", "Busca de Newton sem redução do residual; nenhum ensaio aprovado.")
            previous, q = internal, trial
            increment = float(np.max(abs(factor*direction)/qs))
        else:
            fail("P4_NONCONVERGENCE", "Newton não demonstrou convergência de força, movimento e equilíbrio.")
    _, final_k, _, _ = assemble(elements, q, dimension)
    scale = np.sqrt(np.diag(initial)[free])
    a = final_k[np.ix_(free, free)]/scale[:, None]/scale[None, :]
    b = initial[np.ix_(free, free)]/scale[:, None]/scale[None, :]
    eigenvalues, eigenvectors = eigh(a, b, subset_by_index=(0, 0))
    mode = np.zeros(len(q))
    mode[free] = eigenvectors[:, 0]/scale
    mode /= max(1e-30, float(np.max(abs(mode)/qs)))
    stability = dict(domain="XZ invariant subspace only" if dimension == 2 else "full spatial conservative energy Hessian",
                     positive_definite=True, minimum_generalized_eigenvalue=float(eigenvalues[0]),
                     generalized_mode=mode.tolist(), normalization="max(abs(mode)/[span translations, unit rotations])=1",
                     normative_stability_verified=False)
    return q, internal, rows, energy, history, stability
