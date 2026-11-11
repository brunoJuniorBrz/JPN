"""Experimental XZ planar corotational Euler-Bernoulli frame, version 1.

Own energy derivation, not a port of OpenSees or a patch of installed PyNite.
U=1/2*b.T*C*b, b=[l-L, theta_i-alpha, theta_j-alpha]. f=dU/dq;
Kt=d2U/dq2. Axial/bending resultants in Kg and recovery are the SAME state.
Only the reflection-invariant XZ subspace is solved; this does not verify 3D
stability. Full physical input/supports are preserved and remain auditable.
"""
from copy import deepcopy
import math

import numpy as np
from scipy.linalg import eigvalsh, solve

from .frame3d_model import obj, input_hash, fail
from .mixed3d import build_mixed_model, audit_elastic_model, analyze_mixed3d
from .second_order_frame import validate_request as validate_p2, refine_model, FORCE_KEYS

SCHEMA = "jpn.second-order-frame/2"
RESULT_SCHEMA = "jpn.second-order-frame-diagnostic/2"
EQ_TOL, MESH_TOL, INC_TOL, FORCE_TOL = 1e-8, 1e-4, 1e-10, 1e-8
STEPS, MAX_ITER, MIN_RATIO = 10, 30, .6


def validate_request(raw):
    obj(raw, "schema_version units analysis_type binding model numerics", "corotational request")
    if (raw["schema_version"], raw["units"], raw["analysis_type"]) != (
            SCHEMA, "SI", "experimental-corotational-xz-diagnostic"):
        fail("COROTATIONAL_CONTRACT", "Exigido contrato corrotacional XZ explícito em SI.")
    obj(raw["numerics"], "coarse_subdivisions fine_subdivisions load_steps max_newton_iterations equilibrium_relative_tolerance refinement_relative_tolerance displacement_increment_tolerance force_change_tolerance", "numerics")
    n = raw["numerics"]
    fixed = dict(load_steps=STEPS, max_newton_iterations=MAX_ITER,
                 equilibrium_relative_tolerance=EQ_TOL, refinement_relative_tolerance=MESH_TOL,
                 displacement_increment_tolerance=INC_TOL, force_change_tolerance=FORCE_TOL)
    if any(type(n[k]) is not type(v) or n[k] != v for k, v in fixed.items()):
        fail("COROTATIONAL_NUMERICS", "Critérios fixados antes da correção; não relaxar via entrada.")
    # Reuse strict physical-domain checks without changing the P2 contract.
    legacy = dict(schema_version="jpn.second-order-frame/1", units="SI",
                  analysis_type="experimental-pdelta-diagnostic", binding=raw["binding"], model=raw["model"],
                  numerics=dict(coarse_subdivisions=n["coarse_subdivisions"], fine_subdivisions=n["fine_subdivisions"],
                                max_tc_iterations=1, equilibrium_relative_tolerance=EQ_TOL,
                                refinement_relative_tolerance=MESH_TOL))
    data = validate_p2(legacy)
    y = data["nodes"][0]["y_m"]
    if any(abs(node["y_m"]-y) > 1e-12 for node in data["nodes"]):
        fail("COROTATIONAL_SPATIAL_PENDING", "Formulação espacial não validada; não projetar o modelo no plano.")
    if any(l[k] != 0 for l in data["nodal_loads"] for k in ("fy_n", "mx_nm", "mz_nm")):
        fail("COROTATIONAL_SPATIAL_PENDING", "Ações fora do subespaço XZ não podem ser descartadas.")
    if any(m["rotation_deg"] != 0 for m in data["members"]):
        fail("COROTATIONAL_SECTION_ROLL_PENDING", "Giro da seção requer validação biaxial específica.")
    return data


def element_response(x, q, ea, ei):
    """6 DOFs [ux,uz,theta(-Y)] at each end. Analytic gradient and Hessian.

    No secant K*q recovery or a posteriori balancing of nodal forces. The
    length difference is evaluated without subtracting two close lengths.
    """
    r0 = x[1]-x[0]
    length0 = float(np.linalg.norm(r0))
    d = q[3:5]-q[:2]
    r = r0+d
    length = float(np.linalg.norm(r))
    if length <= 1e-5 or not np.isfinite(q).all():
        fail("COROTATIONAL_NONFINITE", "Comprimento/estado corrotacional inválido.")
    delta = float((2*np.dot(r0, d)+np.dot(d, d))/(length+length0))
    alpha = math.atan2(r0[0]*r[1]-r0[1]*r[0], float(np.dot(r0, r)))
    b = np.array([delta, q[2]-alpha, q[5]-alpha])
    if abs(delta)/length0 > .01 or max(abs(b[1:])) > .05:
        fail("COROTATIONAL_STRAIN_LIMIT", "Deformações básicas fora do domínio elástico pequeno do piloto.")
    c = np.array([[ea/length0, 0., 0.], [0., 4*ei/length0, 2*ei/length0],
                  [0., 2*ei/length0, 4*ei/length0]])
    stress = c@b
    normal = r/length
    # D maps endpoint translations to their relative vector.
    dmat = np.array([[-1., 0., 0., 1., 0., 0.], [0., -1., 0., 0., 1., 0.]])
    grad_alpha = np.array([-r[1], r[0]])/length**2
    jac = np.zeros((3, 6))
    jac[0] = normal@dmat
    jac[1] = jac[2] = -grad_alpha@dmat
    jac[1, 2] = jac[2, 5] = 1.
    h_length = (np.eye(2)-np.outer(normal, normal))/length
    xx, zz = r
    h_angle = np.array([[2*xx*zz, zz*zz-xx*xx],
                        [zz*zz-xx*xx, -2*xx*zz]])/length**4
    geometric = dmat.T@(stress[0]*h_length-(stress[1]+stress[2])*h_angle)@dmat
    material = jac.T@c@jac
    force = jac.T@stress
    tangent = material+geometric
    if not all(np.isfinite(a).all() for a in (force, tangent, stress)):
        fail("COROTATIONAL_NONFINITE", "Força/rigidez não finita; nenhum resultado.")
    return dict(force=force, tangent=tangent, material=material, geometric=geometric,
                basic_deformation=b, basic_force=stress, energy=float(.5*b@stress),
                chord=normal, current_length_m=length)


def assemble(x, elements, q):
    size = len(q)
    f, k, energy, rows = np.zeros(size), np.zeros((size, size)), 0., []
    for dofs, coords, ea, ei in elements:
        row = element_response(coords, q[dofs], ea, ei)
        f[dofs] += row["force"]
        k[np.ix_(dofs, dofs)] += row["tangent"]
        energy += row["energy"]
        rows.append(row)
    return f, k, energy, rows


def audit_tangent(k, free, initial, *, margin=True):
    a, b = k[np.ix_(free, free)], initial[np.ix_(free, free)]
    diag = np.diag(b)
    if len(free) == 0 or np.any(diag <= 0) or not np.isfinite(a).all():
        fail("COROTATIONAL_INSTABILITY", "Rigidez nula ou não finita.")
    scale = np.sqrt(diag)
    an, bn = a/scale[:, None]/scale[None, :], b/scale[:, None]/scale[None, :]
    ratios = eigvalsh(an, bn)
    allowance = 100*len(free)*np.finfo(float).eps*max(1., abs(ratios[-1]))
    if ratios[0] <= allowance:
        fail("COROTATIONAL_INSTABILITY", "Perda de positividade tangente.")
    if margin and ratios[0] < MIN_RATIO-allowance:
        fail("COROTATIONAL_DOMAIN_MARGIN", "Fora da margem restrita do piloto, sem inferir Pcr global.")
    if np.any(np.diag(a) <= 0):
        fail("COROTATIONAL_INSTABILITY", "Diagonal tangente não positiva.")
    ts = np.sqrt(np.diag(a))
    ev = eigvalsh(a/ts[:, None]/ts[None, :])
    condition = float(ev[-1]/ev[0])
    if condition > 1e10:
        fail("ILL_CONDITIONED", "Condicionamento tangente excede limite existente.")
    return float(ratios[0]), condition, float(ratios[-1])


def newton(x, elements, force, free, initial, span):
    q = np.zeros(len(force))
    scale_q = np.tile([span, span, 1.], len(x))
    load_scale = max(1., float(np.max(abs(force*scale_q)))/(span))
    scale_r = scale_q/(load_scale*span)
    history = []
    for step in range(1, STEPS+1):
        target = force*step/STEPS
        previous_force = None
        increment = math.inf
        line_search_evaluations = 0
        for iteration in range(1, MAX_ITER+1):
            f, k, energy, rows = assemble(x, elements, q)
            residual = f-target
            relative = float(np.max(abs(residual[free]*scale_r[free])))
            change = (float(np.max(abs((f-previous_force)*scale_r)))
                      if previous_force is not None else math.inf)
            ratio, condition, maximum_ratio = audit_tangent(k, free, initial)
            if relative <= EQ_TOL and increment <= INC_TOL and change <= FORCE_TOL:
                history.append(dict(step=step, iterations=iteration-1, newton_residual_evaluations=iteration,
                                    line_search_force_evaluations=line_search_evaluations,
                                    linear_system_solves=2*(iteration-1),
                                    algebraic_relative_residual=relative, scaled_displacement_increment=increment,
                                    scaled_internal_force_change=change, minimum_tangent_ratio=ratio,
                                    maximum_tangent_ratio=maximum_ratio,
                                    scaled_tangent_condition=condition))
                break
            # Symmetric diagonal scaling and iterative refinement, not rounding
            # results. Element end actions are still the energy gradient.
            diagonal = np.sqrt(np.diag(k)[free])
            scaled = k[np.ix_(free, free)]/diagonal[:, None]/diagonal[None, :]
            rhs = -residual[free]/diagonal
            correction = solve(scaled, rhs, assume_a="pos")
            correction += solve(scaled, rhs-scaled@correction, assume_a="pos")
            direction = np.zeros(len(q))
            direction[free] = correction/diagonal
            previous_force = f
            # Residual backtracking; the same conservative force is evaluated
            # at every trial, with no update to a different recovery state.
            for backtrack in range(9):
                factor = 2.**-backtrack
                trial = q+factor*direction
                tf, _, _, _ = assemble(x, elements, trial)
                line_search_evaluations += 1
                tr = float(np.max(abs((tf-target)[free]*scale_r[free])))
                if tr < relative or tr <= EQ_TOL:
                    break
            else:
                fail("COROTATIONAL_NONCONVERGENCE", "Newton sem redução do residual; nenhum resultado aceito.")
            increment = float(np.max(abs(factor*direction)/scale_q))
            q = trial
        else:
            fail("COROTATIONAL_NONCONVERGENCE", "Critérios de força, movimento e equilíbrio não atendidos.")
    return q, f, rows, energy, history


def equilibrium(data, nodes, loads):
    fsum, msum = np.zeros(3), np.zeros(3)
    fs, ms = np.ones(3), np.ones(3)
    origin = np.array([data["nodes"][0][k] for k in ("x_m", "y_m", "z_m")])
    for node in data["nodes"]:
        n = nodes[node["id"]]
        p = loads[node["id"]]
        r = np.array([node[k] for k in ("x_m", "y_m", "z_m")])-origin+n["translation_m"]
        force = p[:3]+n["reaction_force_n"]
        fsum += force
        msum += np.cross(r, force)+p[3:]+n["reaction_moment_nm"]
        fs += abs(p[:3])
        ms += abs(np.cross(r, p[:3]))+abs(p[3:])
    rf, rm = abs(fsum)/fs, abs(msum)/ms
    return dict(force_residual_n=fsum.tolist(), deformed_geometry_moment_residual_nm=msum.tolist(),
                force_relative_residual=rf.tolist(), moment_relative_residual=rm.tolist(),
                accepted=bool(max(rf.max(), rm.max()) <= EQ_TOL))


def run_mesh(data, subdivisions):
    refined, mapping = refine_model(data, subdivisions)
    _, _, frames, supports, model, _ = build_mixed_model(refined)
    _, elastic_condition = audit_elastic_model(model, refined, frames, supports)
    names = [n["id"] for n in refined["nodes"]]
    index = {name: i for i, name in enumerate(names)}
    x = np.array([[n["x_m"], n["z_m"]] for n in refined["nodes"]])
    mats = {m["id"]: m for m in refined["materials"]}
    secs = {s["id"]: s for s in refined["sections"]}
    elements = []
    for m in refined["members"]:
        i, j = index[m["start"]], index[m["end"]]
        e, sec = mats[m["material"]]["e_pa"], secs[m["section"]]
        elements.append((np.array([3*i, 3*i+1, 3*i+2, 3*j, 3*j+1, 3*j+2]), x[[i, j]],
                         e*sec["area_m2"], e*sec["iy_m4"]))
    free = np.array([3*i+j for i, nid in enumerate(names) for j, physical in enumerate((0, 2, 4))
                     if not supports.get(nid, [False]*6)[physical]], dtype=int)
    initial = assemble(x, elements, np.zeros(len(x)*3))[1]
    span = max(1e-5, float(np.ptp(x, axis=0).max()))
    combinations = {}
    for combo in refined["combinations"]:
        loads = {name: np.zeros(6) for name in names}
        for load in refined["nodal_loads"]:
            loads[load["node"]] += combo["factors"].get(load["case"], 0)*np.array([load[k] for k in FORCE_KEYS])
        force = np.array([[loads[n][0], loads[n][2], -loads[n][4]] for n in names]).ravel()
        q, internal, rows, energy, history = newton(x, elements, force, free, initial, span)
        reactions = internal-force
        nodes, members = {}, {}
        for name, i in index.items():
            u, v, theta = q[3*i:3*i+3]
            rx, rz, moment = reactions[3*i:3*i+3]
            # Free reactions are numerical residuals, not physical reactions.
            fixed = supports.get(name, [False]*6)
            nodes[name] = dict(translation_m=[float(u), 0., float(v)], rotation_rad=[0., float(-theta), 0.],
                               reaction_force_n=[float(rx) if fixed[0] else 0., 0., float(rz) if fixed[2] else 0.],
                               reaction_moment_nm=[0., float(-moment) if fixed[4] else 0., 0.])
        if any(max(map(abs, n["translation_m"]))/span > .01 or max(map(abs, n["rotation_rad"])) > .05 for n in nodes.values()):
            fail("COROTATIONAL_MOVEMENT_LIMIT", "Movimentos fora das guardas experimentais existentes.")
        for m, row in zip(refined["members"], rows):
            f = row["force"]
            global_f = np.array([f[0], 0., f[1], 0., -f[2], 0., f[3], 0., f[4], 0., -f[5], 0.])
            cx, cz = row["chord"]
            basis = np.array([[cx, 0., cz], [0., 1., 0.], [-cz, 0., cx]])
            local = np.array([basis@global_f[i:i+3] for i in range(0, 12, 3)]).ravel()
            members[m["id"]] = dict(end_actions_global=global_f.tolist(), end_actions_local=local.tolist(),
                                    current_basis=basis.tolist(), axial_n=float(row["basic_force"][0]),
                                    geometric_axial_n=float(row["basic_force"][0]),
                                    basic_deformation=row["basic_deformation"].tolist(),
                                    basic_force=row["basic_force"].tolist(), strain_energy_j=row["energy"])
        eq = equilibrium(refined, nodes, loads)
        if not eq["accepted"]:
            fail("COROTATIONAL_PHYSICAL_EQUILIBRIUM", "Equilíbrio deformado não demonstrado; nenhum ensaio convergido.")
        combinations[combo["id"]] = dict(nodes=nodes, members=members, equilibrium=eq,
                                        newton_steps=history, strain_energy_j=energy,
                                        final_external_dead_load_potential_j=float(force@q),
                                        physical_equilibrium_verified=True)
    return dict(analysis_model=refined, subdivisions=subdivisions, node_count=len(refined["nodes"]),
                member_count=len(refined["members"]), numerical_member_mapping=mapping,
                elastic_scaled_condition=elastic_condition, combinations=combinations)


def analyze_corotational_planar(raw):
    data = validate_request(raw)
    n = raw["numerics"]
    coarse, fine = [run_mesh(data, n[k]) for k in ("coarse_subdivisions", "fine_subdivisions")]
    comparison, blockers = {}, ["COROTATIONAL_PRODUCTION_DOMAIN_NOT_VERIFIED", "COROTATIONAL_3D_STABILITY_PENDING"]
    for cid, answer in fine["combinations"].items():
        errors = {}
        for field in ("translation_m", "rotation_rad"):
            a = np.array([coarse["combinations"][cid]["nodes"][n["id"]][field] for n in data["nodes"]])
            b = np.array([answer["nodes"][n["id"]][field] for n in data["nodes"]])
            errors[field] = float(np.max(abs(a-b))/max(1e-12, float(np.max(abs(b)))))
        end_errors = []
        for parent in data["members"]:
            ends = []
            for mesh in (coarse, fine):
                children = [m for m in mesh["numerical_member_mapping"] if m["parent_member"] == parent["id"]]
                rows = mesh["combinations"][cid]["members"]
                ends.append(np.array(rows[children[0]["id"]]["end_actions_global"][:6]+
                                     rows[children[-1]["id"]]["end_actions_global"][6:]))
            end_errors.extend((abs(ends[1]-ends[0])/np.maximum(1., abs(ends[1]))).tolist())
        errors["member_end_actions"] = max(end_errors)
        if max(errors.values()) > MESH_TOL:
            blockers.append("COROTATIONAL_REFINEMENT_NOT_CONVERGED:"+cid)
        comparison[cid] = errors
    verified = not any(b.startswith("COROTATIONAL_REFINEMENT_NOT_CONVERGED:") for b in blockers)
    return dict(schema_version=RESULT_SCHEMA, status="diagnostic-only", units="SI", input_sha256=input_hash(raw),
                binding=deepcopy(raw["binding"]), project=deepcopy(data["project"]),
                solver=dict(name="JPN-Corotational-XZ", version="1.0", method="energy-gradient-consistent-Newton",
                            adapter=SCHEMA, formulation="finite chord rotation; small elastic basic strains; no within-element P-small-delta"),
                coarse=coarse, candidate=fine, linear_baseline=analyze_mixed3d(fine["analysis_model"]),
                comparison=comparison, blockers=blockers, physical_convergence_verified=verified,
                production_enabled=False, normative_stability_verified=False, computed_structural_approval=False,
                fabrication_release=False, release_gate="NOT_READY_BLOCKED")
