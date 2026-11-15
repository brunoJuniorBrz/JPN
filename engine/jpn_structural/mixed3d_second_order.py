"""Explicit opt-in second-order /3 result, separate from all linear paths."""
import time

import numpy as np

from .frame3d_model import fail, input_hash, obj
from .local_axes import CONVENTION
from .mixed3d import validate_mixed3d
from .mixed3d_loads import compile_loaded_mixed3d
from .mixed3d_v3 import KEYS
from .model import AnalysisError
from .second_order_mixed import assemble, physical_model, solve_combination

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


def analyze_second_order_v3(raw,joint_actions):
    started = time.perf_counter()
    obj(raw,KEYS+" analysis_order solution_mode","second-order mixed model")
    if raw["schema_version"] != "jpn.mixed3d/3":
        fail("UNSUPPORTED_MODEL","Second order requires jpn.mixed3d/3.")
    if raw["local_axes"] != CONVENTION:
        fail("AXIS_CONVENTION_REQUIRED","Explicit jpn-z-up/1 reference required.")
    if joint_actions is not None:
        fail("SECOND_ORDER_UNSUPPORTED_TRACE","The linear joint-action contract is unavailable in second order.")
    linear_input = {k:v for k,v in raw.items() if k not in ("analysis_order","solution_mode","local_axes")}
    linear_input["schema_version"] = "jpn.mixed3d/2"
    data,loading = compile_loaded_mixed3d(linear_input)
    cases = {l["case"] for l in loading["frame_loads"]}
    _,points,frames,supports = validate_mixed3d(data,distributed_cases=cases)
    elements,x,fixed,index = physical_model(data,points,frames,supports)
    by_id = {r["id"]:r for r in elements}
    reference = assemble(elements,np.zeros(6*len(x)),None)
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

    results = {}
    # Build the entire response privately. A refusal names the combination and
    # propagates to the worker as a pure error envelope.
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
        try:
            state = solve_combination(elements,x,fixed,load.ravel(),initial=reference,
                                      uniform={mid:v for mid,v in uniform.items() if np.any(v)})
            u,support = (state[k].reshape(-1,6) for k in ("u","reactions"))
            amp,measure = amplification(u,state["linear"].reshape(-1,6))
        except AnalysisError as error:
            fail(error.code,f"{name}: {error}")
        results[name] = dict(
            status="converged", iterations=state["iterations"], amplification_factor=amp,
            amplification_measure=measure,
            equilibrium=dict(relative_residual=state["relative_equilibrium"],force_n=state["force"].tolist(),
                             moment_nm=state["moment"].tolist()),
            nodes={n:dict(translation_m=u[i,:3].tolist(),rotation_rad=u[i,3:].tolist(),active_rotations=n in frames,
                          reaction_force_n=support[i,:3].tolist(),reaction_moment_nm=support[i,3:].tolist())
                   for n,i in index.items()},
            members={element["id"]:dict(kind=element["kind"],axial_n=row["axial_n"],
                                       end_actions_global=row["net_end_actions"].tolist())
                     for element,row in zip(elements,state["rows"])},
        )
    return dict(schema_version="jpn.mixed3d-result/3",status="analysis_completed_experimental",units="SI",
                analysis_order="second-order",solution_mode="per-combination",local_axes=CONVENTION,
                project=raw["project"],input_sha256=input_hash(raw),combinations=results,
                solver=dict(name="JPN M43",adapter="jpn-mixed3d/3",method="corotational-newton"),
                diagnostics=dict(elapsed_seconds=time.perf_counter()-started),
                computedStructuralApproval=False,fabricationRelease=False,releaseGate="NOT_READY_BLOCKED")
