"""Inspect the INT-3d rejections without changing the worker's acceptance gates."""
import argparse
import json
from pathlib import Path
import sys
from unittest.mock import patch

import numpy as np
from scipy.linalg import eigh

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"engine"))

from jpn_structural import mixed3d_second_order as mixed
from jpn_structural import second_order_mesh as mesh
from jpn_structural import second_order_mixed as core
from jpn_structural.model import AnalysisError
from jpn_structural.second_order_releases import prepare_releases
from jpn_structural.second_order_sections import STATION_KEYS, peak_efforts
from tests.test_mixed3d_second_order_int3d import released_request

CRITERIA = json.loads((Path(__file__).parent/"criteria.json").read_text())


class Captured(Exception):
    pass


def prepare(raw):
    model = None

    def capture(*args):
        nonlocal model
        model = args[:4]
        raise Captured

    with patch.object(mixed,"solve_mesh",capture):
        try:
            mixed.analyze_second_order_v3(raw,None)
        except Captured:
            pass
    return model


def case(model, name, n):
    elements,coordinates,fixed,loads = model
    nodal,uniform = loads[name]
    with patch.object(mesh,"MAX_MESH_NODES",1024):
        rows,x,fixed = mesh.refine(elements,coordinates,fixed,n)
    rows,fixed,Q = prepare_releases(rows,fixed)
    u0 = np.zeros(len(fixed))
    load = np.pad(nodal,(0,len(fixed)-len(nodal)))
    weights = {r["id"]:uniform[r["parent"]]/n for r in rows if r["parent"] in uniform}
    reference = core.assemble(rows,u0,None)
    state = core.solve_combination(rows,x,fixed,load,initial=reference,uniform=weights,projection=Q)
    return rows,x,fixed,Q,weights,reference,state


def critical(rows, fixed, Q, weights, reference, state):
    free = np.flatnonzero(~fixed)
    def project(matrix):
        return matrix[np.ix_(free,free)] if Q is None else Q.T@matrix@Q
    def tangent(u, multiplier):
        return project(core.assemble(rows,u,None,{m:multiplier*v for m,v in weights.items()})[1])
    k0 = project(reference[1])
    d = np.sqrt(np.diag(k0))
    scale = np.outer(d,d)
    k0 = k0/scale
    largest = len(k0)-1
    factors = []
    for step in CRITERIA["critical_derivative_load_steps"]:
        derivative = (tangent(step*state["linear"],step)-tangent(-step*state["linear"],-step))/(2*step)
        mu = eigh(-(derivative/scale),k0,eigvals_only=True,subset_by_index=(largest,largest))[0]
        factors.append(float(1/mu) if mu>0. else None)
    live = eigh(tangent(state["u"],1.)/scale,k0,eigvals_only=True,subset_by_index=(0,0))[0]
    return dict(linearized_critical_load_factors=factors,loaded_minimum_generalized_eigenvalue=float(live))


def shed():
    raw = json.loads((ROOT/"validation"/"int-3b"/"shed-int1c.json").read_text())
    raw.update(analysis_order="second-order",solution_mode="per-combination")
    raw["combinations"] = [c for c in raw["combinations"] if c["id"]=="U-N01"]
    model = prepare(raw)
    previous = None
    output = []
    for n in CRITERIA["diagnostic_shed_meshes"]:
        rows,x,fixed,Q,weights,ref,state = case(model,"U-N01",n)
        peaks = peak_efforts(rows,state["rows"],state["u"])
        record = dict(subdivisions=n,nodes=len(x),residual=state["relative_equilibrium"],
                      iterations=state["iterations"])
        if previous is not None:
            scores = {m:abs(v-previous[m])/(mesh.EFFORT_ATOL+mesh.EFFORT_RTOL*np.maximum(v,previous[m]))
                      for m,v in peaks.items()}
            name,i = max(((m,i) for m in scores for i in range(6)),key=lambda item:scores[item[0]][item[1]])
            record["controlling_change"] = dict(member=name,component=STATION_KEYS[i],before=float(previous[name][i]),
                                                 after=float(peaks[name][i]),bound_ratio=float(scores[name][i]))
        if n in (4,8,16):
            record.update(critical(rows,fixed,Q,weights,ref,state))
        output.append(record)
        previous = peaks
        print(json.dumps(record),flush=True)
    return output


def purlin():
    raw,_,_ = released_request("purlin-portal")
    model = prepare(raw)
    output = []
    for n in CRITERIA["diagnostic_purlin_meshes"]:
        info = dict(subdivisions=n)

        def capture(frame,event,arg):
            if event=="exception" and "Newton search" in str(arg[1]):
                variables = frame.f_locals
                info.update(relative_norm_n=variables["relative_norm"],
                            target_n=core.NEWTON_RELATIVE*variables["denominator"],
                            max_flex_correction=float(np.max(np.abs(variables["delta"]))),
                            condition=variables["condition"],
                            rounded_free_increments=int(np.count_nonzero(
                                (variables["delta"]!=0.)&(variables["u"]+variables["delta"]==variables["u"]))))
            return capture

        def trace(frame,event,arg):
            if event=="call" and frame.f_code is core.solve_combination.__code__:
                return capture
            return None

        try:
            sys.settrace(trace)
            *_,state = case(model,"LA",n)
            info.update(iterations=state["iterations"],residual=state["relative_equilibrium"])
        except AnalysisError as error:
            info["refusal"] = error.code
        finally:
            sys.settrace(None)
        output.append(info)
        print(json.dumps(info),flush=True)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("case",choices=("shed","purlin"))
    parser.add_argument("--output",type=Path,required=True)
    args = parser.parse_args()
    evidence = shed() if args.case=="shed" else purlin()
    args.output.write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
