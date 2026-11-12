"""Independent validation reference, never imported by the application/solver.

Central differences of the coupled lateral/twist energy with fork/free-warping
boundaries. Eliminating lateral displacement gives M² = EIweak lambda_min(Kt),
Kt = GJ(-D2) + EIw D2.T D2. No production LTB function is imported.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from scipy.linalg import eigh


def reference(p):
    l, e, g, iz, j, iw = (p[k] for k in ('lengthM', 'ePa', 'gPa', 'iWeakM4', 'jM4', 'iwM6'))
    assert all(math.isfinite(v) and v > 0 for v in (l, e, g, iz, j, iw))
    # Independently expanded classical determinant, not a port of TS expression.
    exact = math.sqrt(math.pi**2 * e*iz*g*j/l**2 + math.pi**4 * e**2*iz*iw/l**4)
    rows = []
    for n in (16, 32, 64):
        h = l/(n+1)
        d2 = (np.diag(np.full(n, -2.)) + np.diag(np.ones(n-1), 1) + np.diag(np.ones(n-1), -1))/h**2
        kt = g*j*(-d2) + e*iw*(d2.T @ d2)
        values, vectors = eigh(kt, subset_by_index=[0, 0], driver='evr')
        eigenvalue, mode = float(values[0]), vectors[:, 0]
        residual = float(np.linalg.norm(kt @ mode - eigenvalue*mode))
        # Fixed discretization bound derived BEFORE observing results:
        # r=sin(x)/x, x=pi/[2(n+1)], Mfd/Mexact >= r² >= 1-x²/3.
        truncation_bound = math.pi**2/(12*(n+1)**2)
        # Explicit eigensolver backward-error allowance, not a physics tolerance.
        roundoff = 512*np.finfo(float).eps*float(np.linalg.norm(kt, np.inf))/eigenvalue
        mfd = math.sqrt(e*iz*eigenvalue)
        error = 1 - mfd/exact
        assert -roundoff <= error <= truncation_bound + roundoff, (n, error, truncation_bound, roundoff)
        assert residual <= 512*np.finfo(float).eps*float(np.linalg.norm(kt, 2)), residual
        if rows:
            assert mfd > rows[-1]['criticalMomentNm'], 'Expected mesh convergence from below'
        rows.append(dict(interiorNodes=n, criticalMomentNm=mfd, relativeError=error,
                         discretizationBound=truncation_bound, roundoffBound=roundoff, residual=residual))
    return dict(inputsSI=p, classicalNm=exact, grids=rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--output', type=Path, default=Path('.tools/m51-runtime/independent-reference.json'))
    args = parser.parse_args()
    cases = []
    for length in (3., 6., 12.):
        for iw in (1e-10, 1e-8):
            cases.append(reference(dict(lengthM=length, ePa=200e9, gPa=200e9/2.6,
                                        iWeakM4=1.67e-6, jM4=8e-8, iwM6=iw)))
    integrated = []
    if args.evidence:
        raw = json.loads(args.evidence.read_text(encoding='utf-8'))
        result = raw['result']
        assert result['computedStructuralApproval'] is False and result['fabricationRelease'] is False
        assert result['releaseGate'] == 'NOT_READY_BLOCKED'
        states = []
        for attempt in result['lateralTorsional']:
            if attempt['status'] == 'BLOCKED':
                continue
            r = attempt['result']
            independent = reference(r['inputsSI'])
            assert abs(independent['classicalNm']/r['criticalMomentNm']-1) <= 128*np.finfo(float).eps
            assert r['binding']['analysisInputSha256'] == result['analysisInputSha256']
            assert r['binding']['analysisResultSha256'] == result['analysisResultSha256']
            assert r['designResistance'] is None and not r['normativeResistanceVerified']
            assert not r['computedStructuralApproval'] and not r['fabricationRelease']
            states.append(r['status'])
            integrated.append(dict(combinationId=r['study']['combinationId'], status=r['status'], reference=independent))
        assert states == ['BELOW_ELASTIC_CRITICAL_CONDITIONAL', 'ELASTIC_INSTABILITY_INDICATED', 'BELOW_ELASTIC_CRITICAL_CONDITIONAL']
    body = dict(schema_version='jpn.m51-independent-energy-reference/1',
                reference='JRC Simões 2014, PDF p22, uniform moment fork/fork free warping',
                scriptSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                evidenceSha256=hashlib.sha256(args.evidence.read_bytes()).hexdigest() if args.evidence else None,
                scope='Elastic mathematical reference only; not nonlinear analysis, ABNT resistance or fabricated-member approval',
                cases=cases, integrated=integrated, computedStructuralApproval=False, fabricationRelease=False,
                releaseGate='NOT_READY_BLOCKED')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(body, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    print(json.dumps(dict(cases=len(cases), grids=3*len(cases), integrated=len(integrated), output=str(args.output))))


if __name__ == '__main__':
    main()
