"""Explicit opt-in second-order /3 result, separate from all linear paths."""
import time

import numpy as np

from .frame3d_model import fail, input_hash, obj
from .local_axes import CONVENTION
from .mixed3d import validate_mixed3d
from .mixed3d_loads import compile_loaded_mixed3d
from .mixed3d_v3 import KEYS
from .model import AnalysisError
from . import second_order_mesh as mesh
from .second_order_mixed import assemble, physical_model, solve_combination
from .second_order_sections import peak_efforts, recover_members
from .second_order_releases import prepare_releases

KEY_LOADS = ("fx_n","fy_n","fz_n","mx_nm","my_nm","mz_nm")


def peak(values):
    return float(np.max(np.linalg.norm(values,axis=1)))


def amplification(second,first):
    for field,sl in (("translation",slice(0,3)),("rotation",slice(3,6))):
        denominator = peak(first[:,sl])
        if denominator > 0.:
            return peak(second[:,sl])/denominator,field
    if peak(second) == 0.:
        return 1.,"zero-response"
    fail("SECOND_ORDER_NOT_CONVERGED","Cannot normalize amplification for a zero first-order response.")


def solve_mesh(elements, coordinates, fixed, loads, initial_subdivisions):
    """Resolve all combinations at each level before accepting a common mesh."""
    counts = mesh.frame_counts(elements,initial_subdivisions)
    old = {}
    levels = []
    physical_dofs = 6*len(coordinates)
    controlling = next(iter(loads))
    while True:
        try:
            segments,x,restraints = mesh.refine(elements,coordinates,fixed,counts)
        except AnalysisError as error:
            raise AnalysisError(error.code,str(error),combination_id=controlling) from error
        level = max(counts.values(),default=initial_subdivisions)
        if not levels or levels[-1]!=level:
            levels.append(level)
        segments,restraints,projection = prepare_releases(segments,restraints)
        reference = assemble(segments,np.zeros(len(restraints)),None)
        reference_cache = {}
        states,metrics = {},{}
        for name,(nodal,uniform) in loads.items():
            weights = {e["id"]:uniform[e["parent"]]/counts[e["parent"]] for e in segments
                       if e["parent"] in uniform}
            try:
                state = solve_combination(segments,x,restraints,np.pad(nodal,(0,len(restraints)-physical_dofs)),
                                          initial=reference,uniform=weights,projection=projection,
                                          reference_cache=reference_cache)
                amp,measure = amplification(state["u"][:physical_dofs].reshape(-1,6),
                                            state["linear"][:physical_dofs].reshape(-1,6))
                metrics[name] = amp,peak_efforts(segments,state["rows"],state["u"])
            except AnalysisError as error:
                raise AnalysisError(error.code,f"{name}: {error}",combination_id=name) from error
            states[name] = state,amp,measure
        if not counts:
            break
        unresolved = set(counts)
        if level >= initial_subdivisions*2**mesh.MIN_REFINEMENTS:
            unresolved = set()
            for name,metric in metrics.items():
                bars = mesh.unconverged_members(old[name],metric,counts)
                if bars and not unresolved:
                    controlling = name
                unresolved.update(bars)
            if not unresolved:
                break
        uniform_counts = {mid:2*n for mid,n in counts.items()}
        if (max(uniform_counts.values())<=mesh.MAX_SUBDIVISIONS
                and mesh.node_count(coordinates,uniform_counts)<=mesh.MAX_MESH_NODES):
            counts = uniform_counts
        else:
            counts = {mid:2*n if mid in unresolved else n for mid,n in counts.items()}
        old = metrics
    final = {e["id"]:counts.get(e["id"],1) for e in elements}
    return segments,states,final,levels


def analyze_second_order_v3(raw,joint_actions):
    started = time.perf_counter()
    if "nodal_springs" in raw or "springs" in raw:
        fail("SECOND_ORDER_UNSUPPORTED_SPRING","Nodal springs are outside the second-order /3 contract.")
    optional = " mesh_initial_subdivisions" if "mesh_initial_subdivisions" in raw else ""
    obj(raw,KEYS+" analysis_order solution_mode"+optional,"second-order mixed model")
    subdivisions = raw.get("mesh_initial_subdivisions",mesh.INITIAL_SUBDIVISIONS)
    if type(subdivisions) is not int or subdivisions not in (1,2,4):
        fail("INVALID_INPUT","mesh_initial_subdivisions must be 1, 2 or 4.")
    if raw["schema_version"] != "jpn.mixed3d/3":
        fail("UNSUPPORTED_MODEL","Second order requires jpn.mixed3d/3.")
    if raw["local_axes"] != CONVENTION:
        fail("AXIS_CONVENTION_REQUIRED","Explicit jpn-z-up/1 reference required.")
    if joint_actions is not None:
        fail("SECOND_ORDER_UNSUPPORTED_TRACE","The linear joint-action contract is unavailable in second order.")
    linear_input = {k:v for k,v in raw.items()
                    if k not in ("analysis_order","solution_mode","local_axes","mesh_initial_subdivisions")}
    linear_input["schema_version"] = "jpn.mixed3d/2"
    try:
        data,loading = compile_loaded_mixed3d(linear_input)
    except AnalysisError as error:
        if error.code == "UNSUPPORTED_RELEASE":
            fail("SECOND_ORDER_UNSUPPORTED_RELEASE",str(error))
        raise
    cases = {l["case"] for l in loading["frame_loads"]}
    _,points,frames,supports = validate_mixed3d(data,distributed_cases=cases)
    elements,x,fixed,index = physical_model(data,points,frames,supports)
    by_id = {r["id"]:r for r in elements}
    nodal = {c["id"]:np.zeros((len(x),6)) for c in data["cases"]}
    for row in data["nodal_loads"]:
        nodal[row["case"]][index[row["node"]]] += np.array([row[k] for k in KEY_LOADS])
    distributed = {c["id"]:{} for c in data["cases"]}
    for row in loading["frame_loads"]:
        member = by_id[row["member"]]
        w = np.array(row["force_per_length_n_m"])
        if row["coordinate_system"] == "local":
            w = member["basis"].T@w
        a,b = member["coordinates"]
        weights = distributed[row["case"]]
        weights[member["id"]] = weights.get(member["id"],np.zeros(3))+w*np.linalg.norm(b-a)

    loads = {}
    for combo in data["combinations"]:
        name = combo["id"]
        load = np.zeros((len(x),6))
        uniform = {}
        for cid,factor in combo["factors"].items():
            if not factor:
                continue
            load += factor*nodal[cid]
            for mid,value in distributed[cid].items():
                uniform[mid] = uniform.get(mid,np.zeros(3))+factor*value
        loads[name] = load.ravel(),{mid:v for mid,v in uniform.items() if np.any(v)}
    segments,states,final_mesh,levels = solve_mesh(elements,x,fixed,loads,subdivisions)
    results = {}
    for name,(state,amp,measure) in states.items():
        u,support = (state[k][:6*len(x)].reshape(-1,6) for k in ("u","reactions"))
        try:
            members = recover_members(segments,state["rows"],state["u"],final_mesh)
        except AnalysisError as error:
            raise AnalysisError(error.code,f"{name}: {error}",combination_id=name) from error
        results[name] = dict(
            status="converged", iterations=state["iterations"], amplification_factor=amp,
            amplification_measure=measure,
            equilibrium=dict(relative_residual=state["relative_equilibrium"],force_n=state["force"].tolist(),
                             moment_nm=state["moment"].tolist()),
            nodes={n:dict(translation_m=u[i,:3].tolist(),rotation_rad=u[i,3:].tolist(),active_rotations=n in frames,
                          reaction_force_n=support[i,:3].tolist(),reaction_moment_nm=support[i,3:].tolist())
                   for n,i in index.items()},
            members=members,
        )
    return dict(schema_version="jpn.mixed3d-result/3",status="analysis_completed_experimental",units="SI",
                analysis_order="second-order",solution_mode="per-combination",local_axes=CONVENTION,
                project=raw["project"],input_sha256=input_hash(raw),combinations=results,
                mesh_subdivisions=final_mesh,loading=loading["trace"],
                solver=dict(name="JPN M43",adapter="jpn-mixed3d/3",method="corotational-newton"),
                diagnostics=dict(elapsed_seconds=time.perf_counter()-started,mesh_levels=levels),
                computedStructuralApproval=False,fabricationRelease=False,releaseGate="NOT_READY_BLOCKED")
