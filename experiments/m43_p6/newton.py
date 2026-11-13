"""Static experimental Newton; historical criteria unchanged."""
import math
import numpy as np
from scipy.linalg import cho_factor,cho_solve,eigh
from jpn_structural.frame3d_model import fail
from jpn_structural.corotational_planar import audit_tangent

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
            if relative <= 1e-8 and increment <= 1e-10 and change <= 1e-8:
                history.append(dict(step=step, iterations=iteration-1, newton_residual_evaluations=iteration,
                                    line_search_force_evaluations=searches, linear_system_solves=2*(iteration-1),
                                    algebraic_relative_residual=relative, scaled_displacement_increment=increment,
                                    scaled_internal_force_change=change, minimum_tangent_ratio=minimum,
                                    maximum_tangent_ratio=maximum, scaled_tangent_condition=condition))
                break
            scale = np.sqrt(np.diag(k)[free])
            scaled = k[np.ix_(free, free)]/scale[:, None]/scale[None, :]
            rhs = -residual[free]/scale
            # Same SPD equation and residual correction; factor once for the
            # two RHS. No tangent audit, iteration or acceptance gate skipped.
            factorization=cho_factor(scaled)
            delta = cho_solve(factorization, rhs)
            delta += cho_solve(factorization, rhs-scaled@delta)
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
