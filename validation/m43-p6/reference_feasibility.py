"""Certificate that a fixed uncertain reference can admit ANY candidate.

If d=|c-r| and t<1, triangle inequality implies
(1-t)d + u <= a + t|r| as a NECESSARY acceptance condition.
Thus u>a+t|r| makes acceptance impossible, independently of the solver.
No reference, uncertainty, coefficient, expected value or hash is modified.
"""
import hashlib,json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]

def infeasible(reference,uncertainty,absolute,relative):
    r,u=np.broadcast_arrays(np.asarray(reference,dtype=float),np.asarray(uncertainty,dtype=float))
    if not 0<=relative<1 or absolute<0 or np.any(u<0): raise ValueError('Invalid fixed acceptance data')
    budget=absolute+relative*np.abs(r)
    return [dict(component=list(index),reference=float(r[index]),uncertainty=float(u[index]),ideal_candidate_budget=float(budget[index]),
                 uncertainty_budget_ratio=float(u[index]/budget[index]),any_candidate_can_pass=False)
            for index in np.ndindex(r.shape) if u[index]>budget[index]]

def audit():
    ep=ROOT/'validation/m43-p5/evidence.json';cp=ROOT/'validation/m43-p5/criteria.json'
    evidence=json.loads(ep.read_text());criteria=json.loads(cp.read_text());cases=[]
    for c in evidence['cases']:
        ref=c['after'];fields={}
        for field,r in ref['reference'].items():
            failed=infeasible(r,ref['uncertainty'][field],criteria['absolute'][field],criteria['reference_relative'])
            if failed:fields[field]=failed
        cases.append(dict(case=c['case'],infeasible_components=fields,reference_feasible=not bool(fields)))
    sha=lambda p:hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
    return dict(schema_version='jpn.m43-p6-reference-feasibility/1',criterion='abs(c-r)+u <= a+t max(abs(c),abs(r))',
                certificate='u > a+t abs(r) implies no candidate can pass, since (1-t)abs(c-r)+u <= a+t abs(r) is necessary',
                reference_sha256_lf=sha(ep),criteria_sha256_lf=sha(cp),cases=cases,
                computed_structural_approval=False,fabrication_release=False,release_gate='NOT_READY_BLOCKED')

if __name__=='__main__':
    result=audit();out=ROOT/'.tools/m43-p6/reference-feasibility.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({c['case']:c['reference_feasible'] for c in result['cases']}))
