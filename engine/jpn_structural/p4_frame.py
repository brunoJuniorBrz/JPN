"""Versioned P4 diagnostic: Hermite-arc XZ or coupled quaternion spatial beam.

P2/P3 functions/contracts and the installed numerical dependencies are not
modified. This module reuses the physical preparation, mesh/resource limits,
linear baseline and elastic/stability audits. All outputs stay blocked.
"""
from copy import deepcopy
import math
import numpy as np
from scipy.linalg import solve, eigh

from .frame3d_model import obj, input_hash, fail
from .second_order_frame import validate_request as validate_p2, refine_model, FORCE_KEYS
from .corotational_planar import validate_request as validate_p3, audit_tangent, equilibrium
from .mixed3d import build_mixed_model, audit_elastic_model, analyze_mixed3d
from .hermite_arc import element_response as planar_element
from .spatial_corotational import element_response as spatial_element, energy_state, exponential, value

SCHEMA = "jpn.second-order-frame/3"
RESULT_SCHEMA = "jpn.second-order-frame-diagnostic/3"
XZ, SPATIAL = "xz-hermite-arc/1", "spatial-quaternion-arc/1"


def validate_request(raw):
    obj(raw, "schema_version units analysis_type dimensionality formulation binding model numerics", "P4 request")
    if (raw["schema_version"], raw["units"], raw["analysis_type"]) != (
            SCHEMA, "SI", "experimental-p4-corotational-diagnostic"):
        fail("P4_CONTRACT", "Exigido contrato P4 experimental explícito em SI.")
    if (raw["dimensionality"], raw["formulation"]) not in ((2, XZ), (3, SPATIAL)) or type(raw["dimensionality"]) is not int:
        fail("P4_FORMULATION", "Dimensionalidade e formulação não correspondem.")
    n = raw["numerics"]
    obj(n, "coarse_subdivisions fine_subdivisions load_steps max_newton_iterations equilibrium_relative_tolerance refinement_relative_tolerance displacement_increment_tolerance force_change_tolerance", "numerics")
    legacy = dict(schema_version="jpn.second-order-frame/2", units="SI", analysis_type="experimental-corotational-xz-diagnostic",
                  binding=raw["binding"], model=raw["model"], numerics=n)
    if raw["dimensionality"] == 2:
        return validate_p3(legacy)
    fixed = dict(load_steps=10, max_newton_iterations=30, equilibrium_relative_tolerance=1e-8,
                 refinement_relative_tolerance=1e-4, displacement_increment_tolerance=1e-10, force_change_tolerance=1e-8)
    if any(type(n[k]) is not type(v) or n[k] != v for k, v in fixed.items()):
        fail("P4_NUMERICS", "Critérios fixos não podem ser relaxados pela entrada.")
    old_n = dict(coarse_subdivisions=n["coarse_subdivisions"], fine_subdivisions=n["fine_subdivisions"], max_tc_iterations=1,
                 equilibrium_relative_tolerance=1e-8, refinement_relative_tolerance=1e-4)
    data = validate_p2(dict(schema_version="jpn.second-order-frame/1", units="SI", analysis_type="experimental-pdelta-diagnostic",
                            binding=raw["binding"], model=raw["model"], numerics=old_n))
    if any(m["rotation_deg"] != 0 for m in data["members"]):
        fail("SPATIAL_SECTION_ROLL_PENDING", "Giro de seção exige campanha independente específica.")
    if any(l[k] != 0 for l in data["nodal_loads"] for k in ("mx_nm", "my_nm", "mz_nm")):
        fail("SPATIAL_APPLIED_MOMENT_PENDING", "Momentos mortos espaciais gerais não possuem potencial escalar em coordenadas de rotação; usar somente ações físicas já validadas.")
    if any(any(s["restrained"][3:]) and not all(s["restrained"][3:]) for s in data["supports"]):
        fail("SPATIAL_PARTIAL_ROTATION_SUPPORT_PENDING", "Vínculo rotacional parcial finito exige definição física própria; não inventar restrição.")
    return data


def element(row, local, dimension, *, derivatives=True):
    if dimension == 2:
        return planar_element(row["coordinates"][:, [0, 2]], local, row["ea"], row["eiy"])
    if not derivatives:
        return value(energy_state(row["coordinates"], list(local), row["ea"], row["eiy"], row["eiz"], row["gj"], row["basis"])[0])
    return spatial_element(row["coordinates"], local, row["ea"], row["eiy"], row["eiz"], row["gj"], row["basis"])


def assemble(elements, q, dimension):
    f, k, total, rows = np.zeros(len(q)), np.zeros((len(q), len(q))), 0., []
    for row in elements:
        dofs = row["dofs"]
        answer = element(row, q[dofs], dimension)
        f[dofs] += answer["force"]
        k[np.ix_(dofs, dofs)] += answer["tangent"]
        total += answer["energy"]
        rows.append(answer)
    return f, k, total, rows


def newton(elements, force, free, initial, span, dimension):
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
            delta = solve(scaled, rhs, assume_a="pos")
            delta += solve(scaled, rhs-scaled@delta, assume_a="pos")
            direction = np.zeros(len(q))
            direction[free] = delta/scale
            for backtrack in range(9):
                factor = 2.**-backtrack
                trial = q+factor*direction
                trial_internal, _, _, _ = assemble(elements, trial, dimension)
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


def run_mesh(data, subdivisions, dimension):
    refined, mapping = refine_model(data, subdivisions)
    _, _, frames, supports, model, _ = build_mixed_model(refined)
    _, condition = audit_elastic_model(model, refined, frames, supports)
    names = [n["id"] for n in refined["nodes"]]
    index = {name: i for i, name in enumerate(names)}
    coordinates = np.array([[n[k] for k in ("x_m", "y_m", "z_m")] for n in refined["nodes"]])
    dimension_dof = 3 if dimension == 2 else 6
    physical_dofs = (0, 2, 4) if dimension == 2 else tuple(range(6))
    mats, secs = [{r["id"]: r for r in refined[key]} for key in ("materials", "sections")]
    elements = []
    for m in refined["members"]:
        i, j = index[m["start"]], index[m["end"]]
        mat, sec = mats[m["material"]], secs[m["section"]]
        physical = next(iter(model.members[m["id"]].sub_members.values()))
        elements.append(dict(id=m["id"], dofs=np.array([dimension_dof*n+k for n in (i, j) for k in range(dimension_dof)]),
                             coordinates=coordinates[[i, j]], ea=mat["e_pa"]*sec["area_m2"],
                             eiy=mat["e_pa"]*sec["iy_m4"], eiz=mat["e_pa"]*sec["iz_m4"], gj=mat["g_pa"]*sec["j_m4"],
                             basis=np.asarray(physical.T()[:3, :3])))
    free = np.array([dimension_dof*i+j for i, nid in enumerate(names) for j, physical in enumerate(physical_dofs)
                     if not supports.get(nid, [False]*6)[physical]], dtype=int)
    initial = assemble(elements, np.zeros(dimension_dof*len(names)), dimension)[1]
    span = max(1e-5, float(np.ptp(coordinates, axis=0).max()))
    combinations = {}
    for combo in refined["combinations"]:
        loads = {name: np.zeros(6) for name in names}
        for load in refined["nodal_loads"]:
            loads[load["node"]] += combo["factors"].get(load["case"], 0)*np.array([load[k] for k in FORCE_KEYS])
        force = np.array([[loads[n][0], loads[n][2], -loads[n][4]] if dimension == 2 else loads[n] for n in names]).ravel()
        q, internal, rows, energy, history, stability = newton(elements, force, free, initial, span, dimension)
        nodes, members, assembled = {}, {}, {name: np.zeros(6) for name in names}
        for m, element_data, row in zip(refined["members"], elements, rows):
            if dimension == 2:
                f = row["force"]
                physical = np.array([f[0], 0., f[1], 0., -f[2], 0., f[3], 0., f[4], 0., -f[5], 0.])
                cx, cz = row["chord"]
                basis = np.array([[cx, 0., cz], [0., 1., 0.], [-cz, 0., cx]])
                local_state = dict(extension_m=float(row["basic_deformation"][0]), arc_extension_m=row["arc_extension_m"],
                                   axial_n=float(row["constitutive_force"][0]), torsion_nm=0.)
            else:
                physical, basis = row["physical_end_actions"], row["current_basis"]
                local_state = {k: row[k] for k in ("extension_m", "arc_extension_m", "axial_n", "torsion_nm", "local_rotation_i", "local_rotation_j", "torsion_rad")}
            local = np.array([basis@physical[i:i+3] for i in range(0, 12, 3)]).ravel()
            members[m["id"]] = dict(end_actions_global=physical.tolist(), end_actions_local=local.tolist(),
                                    current_basis=basis.tolist(), reference_basis=element_data["basis"].tolist(),
                                    strain_energy_j=row["energy"], local_state=local_state)
            assembled[m["start"]] += physical[:6]
            assembled[m["end"]] += physical[6:]
        for name, i in index.items():
            if dimension == 2:
                u, v, theta = q[3*i:3*i+3]
                motion = np.array([u, 0., v, 0., -theta, 0.])
            else:
                motion = q[6*i:6*i+6]
            fixed = supports.get(name, [False]*6)
            reaction = assembled[name]-loads[name]
            if any(abs(reaction[k]) > 1e-5+1e-8*max(1., abs(loads[name][k])) for k in range(6) if not fixed[k]):
                fail("P4_NODAL_EQUILIBRIUM", "Forças físicas montadas não satisfazem o equilíbrio nodal.")
            reaction = np.array([reaction[k] if fixed[k] else 0. for k in range(6)])
            if max(abs(motion[:3]))/span > .01 or np.linalg.norm(motion[3:]) > .05:
                fail("P4_MOVEMENT_LIMIT", "Movimentos fora do domínio experimental, sem extrapolação.")
            nodes[name] = dict(translation_m=motion[:3].tolist(), rotation_rad=motion[3:].tolist(),
                               orientation_quaternion=[value(v) for v in exponential(list(motion[3:]))],
                               reaction_force_n=reaction[:3].tolist(), reaction_moment_nm=reaction[3:].tolist())
        eq = equilibrium(refined, nodes, loads)
        if not eq["accepted"]:
            fail("P4_PHYSICAL_EQUILIBRIUM", "Equilíbrio deformado das seis resultantes não demonstrado.")
        combinations[combo["id"]] = dict(nodes=nodes, members=members, equilibrium=eq, newton_steps=history,
                                        strain_energy_j=energy, final_external_dead_load_potential_j=float(force@q),
                                        stability=stability, physical_equilibrium_verified=True)
    return dict(analysis_model=refined, subdivisions=subdivisions, node_count=len(names), member_count=len(elements),
                numerical_member_mapping=mapping, elastic_scaled_condition=condition, combinations=combinations)


def analyze_p4_frame(raw):
    data = validate_request(raw)
    n, dimension = raw["numerics"], raw["dimensionality"]
    coarse, fine = [run_mesh(data, n[key], dimension) for key in ("coarse_subdivisions", "fine_subdivisions")]
    blockers, comparison = ["P4_PRODUCTION_DOMAIN_NOT_VERIFIED", "P4_NORMATIVE_REVIEW_PENDING"], {}
    if dimension == 2: blockers.append("P4_OUT_OF_PLANE_STABILITY_PENDING")
    else: blockers.extend(["P4_SPATIAL_DOMAIN_NOT_VERIFIED", "P4_WARPING_WAGNER_STABILITY_PENDING"])
    for cid, answer in fine["combinations"].items():
        errors = {}
        for field in ("translation_m", "rotation_rad"):
            a = np.array([coarse["combinations"][cid]["nodes"][n["id"]][field] for n in data["nodes"]])
            b = np.array([answer["nodes"][n["id"]][field] for n in data["nodes"]])
            errors[field] = float(np.max(abs(a-b))/max(1e-12, float(np.max(abs(b)))))
        differences = []
        for parent in data["members"]:
            ends = []
            for mesh in (coarse, fine):
                children = [m for m in mesh["numerical_member_mapping"] if m["parent_member"] == parent["id"]]
                rows = mesh["combinations"][cid]["members"]
                ends.append(np.array(rows[children[0]["id"]]["end_actions_global"][:6]+rows[children[-1]["id"]]["end_actions_global"][6:]))
            differences.extend((abs(ends[1]-ends[0])/np.maximum(1., abs(ends[1]))).tolist())
        errors["member_end_actions"] = max(differences)
        if max(errors.values()) > 1e-4: blockers.append("P4_REFINEMENT_NOT_CONVERGED:"+cid)
        comparison[cid] = errors
    verified = not any(b.startswith("P4_REFINEMENT_NOT_CONVERGED:") for b in blockers)
    return dict(schema_version=RESULT_SCHEMA, status="diagnostic-only", units="SI", input_sha256=input_hash(raw),
                binding=deepcopy(raw["binding"]), project=deepcopy(data["project"]), dimensionality=dimension, formulation=raw["formulation"],
                solver=dict(name="JPN-P4", version="1.0", method="energy-consistent-Newton", rotation_measure="SO(3) exponential coordinates; scalar-first quaternions"),
                coarse=coarse, candidate=fine, linear_baseline=analyze_mixed3d(fine["analysis_model"]), comparison=comparison,
                blockers=blockers, physical_convergence_verified=verified, spatial_domain_verified=False, production_enabled=False,
                normative_stability_verified=False, computed_structural_approval=False, fabrication_release=False, release_gate="NOT_READY_BLOCKED")
