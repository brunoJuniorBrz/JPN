"""M43-P2 isolated, fail-closed PyNite P-Delta diagnostic.

Never changes analyze_mixed3d or produces its result contract. In particular,
two native stiffness solves are NOT reported as nonlinear physical convergence.
"""
from copy import deepcopy
import contextlib
import io
import math
import re
import warnings

import numpy as np
from scipy.linalg import eigvalsh
from Pynite import FEModel3D

from .frame3d_model import input_hash, obj, number, fail
from .model import AnalysisError
from .mixed3d import build_mixed_model, audit_elastic_model, analyze_mixed3d, validate_mixed3d

SCHEMA = "jpn.second-order-frame/1"
RESULT_SCHEMA = "jpn.second-order-frame-diagnostic/1"
EQUILIBRIUM_TOL = 1e-8
REFINEMENT_TOL = 1e-4
MIN_TANGENT_RATIO = .6  # Pilot restriction, NOT a normative stability coefficient.
FORCE_KEYS = ("fx_n", "fy_n", "fz_n", "mx_nm", "my_nm", "mz_nm")


def validate_request(raw):
    obj(raw, "schema_version units analysis_type binding model numerics", "second-order request")
    if (raw["schema_version"], raw["units"], raw["analysis_type"]) != (
            SCHEMA, "SI", "experimental-pdelta-diagnostic"):
        fail("PDELTA_CONTRACT", "Exigido contrato experimental explícito em SI.")
    obj(raw["binding"], "model_sha256 preparation_sha256 mapping_sha256", "binding")
    for value in raw["binding"].values():
        if type(value) is not str or re.fullmatch("[0-9a-f]{64}", value) is None:
            fail("PDELTA_BINDING", "Assinatura física ausente ou inválida.")
    if type(raw["model"]) is not dict:
        fail("INVALID_INPUT", "O modelo físico deve ser um objeto versionado.")
    if input_hash(raw["model"]) != raw["binding"]["model_sha256"]:
        fail("PDELTA_BINDING", "Modelo não corresponde ao hash físico.")
    data = deepcopy(raw["model"])
    if data.get("schema_version") == "jpn.mixed3d/2":
        obj(data, "schema_version units theory project nodes members materials sections supports cases nodal_loads combinations member_loads self_weight", "loaded model")
        if data.pop("member_loads") != [] or data.pop("self_weight") is not None:
            fail("PDELTA_DISTRIBUTED_LOAD_PENDING", "UDL e peso próprio exigem recuperação não linear própria; não converter em cargas fictícias.")
        data["schema_version"] = "jpn.mixed3d/1"
    validate_mixed3d(data)
    if any(m["kind"] != "frame" for m in data["members"]):
        fail("PDELTA_AXIAL_KG_UNSUPPORTED", "Spring3D EA/L não tem Kg axial validado; modelo recusado.")
    connected = {m[k] for m in data["members"] for k in ("start", "end")}
    if connected != {n["id"] for n in data["nodes"]}:
        fail("PDELTA_ORPHAN_NODE", "Todos os nós do piloto devem pertencer ao pórtico físico.")
    if any(any(m["release_start"]+m["release_end"]) for m in data["members"]):
        fail("PDELTA_RELEASE_PENDING", "Condensação de Ke/Kg com liberações ainda não validada neste piloto.")
    obj(raw["numerics"], "coarse_subdivisions fine_subdivisions max_tc_iterations equilibrium_relative_tolerance refinement_relative_tolerance", "numerics")
    n = raw["numerics"]
    for key, lo, hi in (("coarse_subdivisions", 1, 32), ("fine_subdivisions", 2, 64), ("max_tc_iterations", 1, 30)):
        number(n[key], lo, hi, key)
        if type(n[key]) is not int:
            fail("PDELTA_NUMERICS", "Contagem numérica deve ser inteira.")
    if (n["fine_subdivisions"] != 2*n["coarse_subdivisions"] or
            n["equilibrium_relative_tolerance"] != EQUILIBRIUM_TOL or
            n["refinement_relative_tolerance"] != REFINEMENT_TOL):
        fail("PDELTA_NUMERICS", "Refinamento 2:1 e tolerâncias fixadas pelo piloto são obrigatórios.")
    return data


def refine_model(data, subdivisions):
    """Explicit numerical mesh, traceable to input members; no new restraints."""
    if (len(data["nodes"])+len(data["members"])*(subdivisions-1) > 150 or
            len(data["members"])*subdivisions > 320):
        fail("INPUT_LIMIT", "Malha solicitada excede os limites físicos/numerais existentes.")
    out = deepcopy(data)
    out["members"] = []
    points = {n["id"]: np.array([n[k] for k in ("x_m", "y_m", "z_m")]) for n in data["nodes"]}
    names = set(points)
    trace = []
    serial = 0
    for member in data["members"]:
        chain = [member["start"]]
        for i in range(1, subdivisions):
            while f"P2N-{serial}" in names:
                serial += 1
            nid = f"P2N-{serial}"
            serial += 1
            names.add(nid)
            xyz = points[member["start"]] + (points[member["end"]]-points[member["start"]])*i/subdivisions
            out["nodes"].append(dict(id=nid, x_m=float(xyz[0]), y_m=float(xyz[1]), z_m=float(xyz[2])))
            chain.append(nid)
        chain.append(member["end"])
        for i in range(subdivisions):
            mid = f"P2M-{len(trace)}"
            item = deepcopy(member)
            item.update(id=mid, start=chain[i], end=chain[i+1])
            out["members"].append(item)
            trace.append(dict(id=mid, parent_member=member["id"], start_fraction=i/subdivisions,
                              end_fraction=(i+1)/subdivisions))
    # Reuse existing geometry/resource limits, including 150 nodes/900 DOFs.
    validate_mixed3d(out)
    return out, trace


class ObservedFrameModel(FEModel3D):
    def __init__(self):
        super().__init__()
        self.record = False
        self.trace = {}
        self.free_indices = np.array([], dtype=int)

    def Ke(self, combo_name="Combo 1", log=False, check_stability=True, sparse=True):
        value = super().Ke(combo_name, log, check_stability, sparse)
        if self.record:
            row = self.trace.setdefault(combo_name, {"elastic_assemblies": 0, "geometric_assemblies": 0})
            row["elastic_assemblies"] += 1
            row["ke"] = value.toarray() if sparse else value.copy()
        return value

    def Kg(self, combo_name="Combo 1", log=False, sparse=True, first_step=True):
        value = super().Kg(combo_name, log, sparse, first_step)
        if self.record:
            row = self.trace[combo_name]
            row["geometric_assemblies"] += 1
            row["assembly_axial_n"] = {}
            for physical in self.members.values():
                for member in physical.sub_members.values():
                    d = member.d(combo_name)
                    row["assembly_axial_n"][physical.name] = float(
                        member.material.E*member.section.A/member.L()*(d[6, 0]-d[0, 0]))
            row["kg"] = value.toarray() if sparse else value.copy()
            free = self.free_indices
            if not len(free):
                fail("PDELTA_NO_FREE_DOF", "Modelo sem graus livres não constitui o ensaio de segunda ordem.")
            ke = row["ke"][np.ix_(free, free)]
            kt = (row["ke"]+row["kg"])[np.ix_(free, free)]
            if not np.isfinite(kt).all():
                fail("PDELTA_NONFINITE", "Rigidez tangente não finita.")
            scale = np.sqrt(np.diag(ke))
            normalized_ke = ke/scale[:, None]/scale[None, :]
            normalized_kt = kt/scale[:, None]/scale[None, :]
            ratios = eigvalsh(normalized_kt, normalized_ke)
            margin = float(ratios[0])
            row["minimum_tangent_ratio"] = margin
            row["maximum_tangent_ratio"] = float(ratios[-1])
            allowance = 100*len(free)*np.finfo(float).eps*max(1., abs(float(ratios[-1])))
            if margin <= allowance:
                fail("PDELTA_INSTABILITY", "Rigidez tangente não positiva; sem resultado utilizável.")
            if margin < MIN_TANGENT_RATIO-allowance:
                fail("PDELTA_DOMAIN_MARGIN", "Margem elástica fora do domínio restrito do piloto; não extrapolar a guarda de Pcr.")
            diagonal = np.diag(kt)
            if np.any(diagonal <= 0):
                fail("PDELTA_INSTABILITY", "Rigidez tangente não positiva.")
            tangent_scale = np.sqrt(diagonal)
            spectrum = eigvalsh(kt/tangent_scale[:, None]/tangent_scale[None, :])
            if spectrum[0] <= 10*len(free)*np.finfo(float).eps*spectrum[-1]:
                fail("PDELTA_INSTABILITY", "Matriz tangente numericamente singular.")
            row["scaled_tangent_condition"] = float(spectrum[-1]/spectrum[0])
            if row["scaled_tangent_condition"] > 1e10:
                fail("ILL_CONDITIONED", "Condicionamento tangente excede a guarda existente.")
        return value


def recover(model, data, combo):
    nodes = {}
    for name, node in model.nodes.items():
        nodes[name] = dict(
            translation_m=[float(getattr(node, k)[combo]) for k in ("DX", "DY", "DZ")],
            rotation_rad=[float(getattr(node, k)[combo]) for k in ("RX", "RY", "RZ")],
            reaction_force_n=[float(getattr(node, k)[combo]) for k in ("RxnFX", "RxnFY", "RxnFZ")],
            reaction_moment_nm=[float(getattr(node, k)[combo]) for k in ("RxnMX", "RxnMY", "RxnMZ")])
    members = {}
    for name, physical in model.members.items():
        member = next(iter(physical.sub_members.values()))
        d = member.d(combo)
        members[name] = dict(end_actions_local=list(map(float, member.f(combo).ravel())),
                             end_actions_global=list(map(float, member.F(combo).ravel())),
                             recovered_axial_strain_force_n=float(
                                 member.material.E*member.section.A/member.L()*(d[6, 0]-d[0, 0])))
    values = [v for node in nodes.values() for vector in node.values() for v in vector]
    values += [v for member in members.values()
               for v in member["end_actions_local"]+member["end_actions_global"]]
    values += [member["recovered_axial_strain_force_n"] for member in members.values()]
    if not all(math.isfinite(x) for x in values):
        fail("PDELTA_NONFINITE", "Recuperação não finita; sem resultado.")
    restraints = {s["node"]: s["restrained"] for s in data["supports"]}
    for name, answer in nodes.items():
        fixed = restraints.get(name, [False]*6)
        motion = answer["translation_m"]+answer["rotation_rad"]
        reaction = answer["reaction_force_n"]+answer["reaction_moment_nm"]
        if any(abs(motion[i]) > 1e-12 for i in range(6) if fixed[i]):
            fail("PDELTA_BOUNDARY_MISMATCH", "Deslocamento em grau explicitamente restringido.")
        if any(abs(reaction[i]) > 1e-8 for i in range(6) if not fixed[i]):
            fail("PDELTA_BOUNDARY_MISMATCH", "Reação em grau sem apoio físico.")
    points = {n["id"]: np.array([n[k] for k in ("x_m", "y_m", "z_m")]) for n in data["nodes"]}
    span = max(1e-5, float(np.ptp(np.array(list(points.values())), axis=0).max()))
    if any(max(map(abs, n["translation_m"]))/span > .01 or
           max(map(abs, n["rotation_rad"])) > .05 for n in nodes.values()):
        fail("PDELTA_MOVEMENT_LIMIT", "Movimentos fora das guardas experimentais existentes.")
    factors = next(c["factors"] for c in data["combinations"] if c["id"] == combo)
    loads = {name: np.zeros(6) for name in nodes}
    for load in data["nodal_loads"]:
        loads[load["node"]] += factors.get(load["case"], 0)*np.array([load[k] for k in FORCE_KEYS])
    fsum, msum, initial_msum = np.zeros(3), np.zeros(3), np.zeros(3)
    fscale, mscale = np.ones(3), np.ones(3)
    origin = next(iter(points.values()))
    for name, answer in nodes.items():
        force = loads[name][:3]+np.array(answer["reaction_force_n"])
        couple = loads[name][3:]+np.array(answer["reaction_moment_nm"])
        r = points[name]-origin
        deformed = r+np.array(answer["translation_m"])
        fsum += force
        initial_msum += np.cross(r, force)+couple
        msum += np.cross(deformed, force)+couple
        fscale += abs(loads[name][:3])
        mscale += abs(np.cross(deformed, loads[name][:3]))+abs(loads[name][3:])
    relative_f = abs(fsum)/fscale
    relative_m = abs(msum)/mscale
    equilibrium = dict(force_residual_n=fsum.tolist(),
                       initial_geometry_moment_residual_nm=initial_msum.tolist(),
                       deformed_geometry_moment_residual_nm=msum.tolist(),
                       force_relative_residual=relative_f.tolist(),
                       moment_relative_residual=relative_m.tolist(),
                       reference="global dead loads at displaced nodes; no omitted H*uz term",
                       accepted=bool(max(relative_f.max(), relative_m.max()) <= EQUILIBRIUM_TOL))
    return dict(nodes=nodes, members=members, equilibrium=equilibrium)


def run_mesh(data, subdivisions, max_tc_iterations):
    refined, mapping = refine_model(data, subdivisions)
    data, _, frames, supports, model, _ = build_mixed_model(refined, _model_factory=ObservedFrameModel)
    try:
        with contextlib.redirect_stdout(io.StringIO()), warnings.catch_warnings():
            warnings.simplefilter("error")
            free, condition = audit_elastic_model(model, data, frames, supports)
            model.free_indices = free
            model.record = True
            model.analyze_PDelta(log=False, check_stability=True, max_iter=max_tc_iterations, sparse=True)
    except AnalysisError:
        raise
    except Exception as exc:
        raise AnalysisError("PDELTA_NATIVE_FAILURE", f"PyNite não completou o piloto: {type(exc).__name__}.") from exc
    combinations = {}
    for combo in data["combinations"]:
        cid = combo["id"]
        row = model.trace.get(cid)
        if (row is None or row["geometric_assemblies"] < 1 or
                row["elastic_assemblies"] != row["geometric_assemblies"] or "kg" not in row):
            fail("PDELTA_TRACE_INCOMPLETE", "Etapas P-Delta não foram observadas; não aceitar substituição por análise linear.")
        answer = recover(model, data, cid)
        displacement = np.array(model.D(cid)).reshape(-1)
        force = np.asarray(model.P(cid)).reshape(-1)
        residual = (row["ke"]+row["kg"])@displacement-force
        algebraic = float(np.max(abs(residual[free]))/max(1., float(np.max(abs(force)))))
        if not math.isfinite(algebraic) or algebraic > EQUILIBRIUM_TOL:
            fail("PDELTA_ALGEBRAIC_RESIDUAL", "Sistema resolvido não satisfaz o residual algébrico.")
        answer["native_trace"] = dict(
            elastic_assemblies=row["elastic_assemblies"], geometric_assemblies=row["geometric_assemblies"],
            tc_iterations=row["geometric_assemblies"], nonlinear_equilibrium_iterations=None,
            native_method="two stiffness solves per TC iteration; not a nonlinear equilibrium iteration",
            minimum_tangent_ratio=row["minimum_tangent_ratio"], algebraic_relative_residual=algebraic,
            maximum_tangent_ratio=row["maximum_tangent_ratio"],
            scaled_tangent_condition=row["scaled_tangent_condition"],
            assembly_axial_n=row["assembly_axial_n"])
        combinations[cid] = answer
    return dict(analysis_model=data, subdivisions=subdivisions, node_count=len(data["nodes"]),
                member_count=len(data["members"]), elastic_scaled_condition=condition,
                numerical_member_mapping=mapping, combinations=combinations), refined


def analyze_second_order_frame(raw):
    data = validate_request(raw)
    n = raw["numerics"]
    coarse, _ = run_mesh(data, n["coarse_subdivisions"], n["max_tc_iterations"])
    fine, refined = run_mesh(data, n["fine_subdivisions"], n["max_tc_iterations"])
    linear = analyze_mixed3d(refined)
    # Investigation found unresolved cross-formulation internal-force and
    # full dead-load equilibrium discrepancies. Even zero-load/balanced cases
    # cannot enable a productive second-order domain in this version.
    blockers = ["PDELTA_PRODUCTION_DOMAIN_NOT_VERIFIED"]
    comparison = {}
    physical_ids = [node["id"] for node in data["nodes"]]
    for cid, answer in fine["combinations"].items():
        second = np.array([answer["nodes"][nid]["translation_m"] for nid in physical_ids])
        first = np.array([linear["combinations"][cid]["nodes"][nid]["translation_m"] for nid in physical_ids])
        previous = np.array([coarse["combinations"][cid]["nodes"][nid]["translation_m"] for nid in physical_ids])
        refinement_error = float(np.max(abs(second-previous))/max(1e-12, float(np.max(abs(second)))))
        rotation = np.array([answer["nodes"][nid]["rotation_rad"] for nid in physical_ids])
        previous_rotation = np.array([coarse["combinations"][cid]["nodes"][nid]["rotation_rad"] for nid in physical_ids])
        rotation_error = float(np.max(abs(rotation-previous_rotation))/max(1e-12, float(np.max(abs(rotation)))))
        end_errors = []
        for parent in data["members"]:
            ends = []
            for mesh in (coarse, fine):
                children = [m for m in mesh["numerical_member_mapping"] if m["parent_member"] == parent["id"]]
                rows = mesh["combinations"][cid]["members"]
                ends.append(np.array(rows[children[0]["id"]]["end_actions_local"][:6] +
                                     rows[children[-1]["id"]]["end_actions_local"][6:]))
            end_errors.extend((abs(ends[1]-ends[0])/np.maximum(1., abs(ends[1]))).tolist())
        end_error = max(end_errors)
        if max(refinement_error, rotation_error, end_error) > REFINEMENT_TOL:
            blockers.append("PDELTA_REFINEMENT_NOT_CONVERGED:"+cid)
        if not answer["equilibrium"]["accepted"]:
            blockers.append("PDELTA_DEAD_LOAD_EQUILIBRIUM_NOT_VERIFIED:"+cid)
        comparison[cid] = dict(maximum_linear_translation_m=float(np.linalg.norm(first, axis=1).max()),
                               maximum_candidate_translation_m=float(np.linalg.norm(second, axis=1).max()),
                               maximum_translation_change_m=float(np.linalg.norm(second-first, axis=1).max()),
                               refinement_relative_displacement_error=refinement_error,
                               refinement_relative_rotation_error=rotation_error,
                               refinement_relative_member_end_action_error=end_error)
    return dict(
        schema_version=RESULT_SCHEMA, status="diagnostic-rejected",
        units="SI", input_sha256=input_hash(raw), binding=deepcopy(raw["binding"]), project=deepcopy(data["project"]),
        solver=dict(name="PyNiteFEA", version="3.2.1", method="analyze_PDelta", adapter="jpn.second-order-frame/1"),
        coarse=coarse, candidate=fine, linear_baseline=linear, comparison=comparison,
        blockers=blockers, physical_convergence_verified=False,
        production_enabled=False, normative_stability_verified=False,
        computed_structural_approval=False, fabrication_release=False, release_gate="NOT_READY_BLOCKED",
        limitations=["Diagnostic prototype, not a validated second-order design API.",
                     "Native two-step solution is not proof of nonlinear physical convergence.",
                     "All-frame, rigid-ended, nodal dead loads only; axial springs/releases/UDL blocked.",
                     "Full dead-load equilibrium is audited without dropping axial-shortening moments.",
                     "No imperfections, stiffness reductions, code checks, effective lengths or fabrication approval."])
