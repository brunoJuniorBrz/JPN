"""Summarize existing P5 evidence without rerunning or altering its references.

The CI invokes this after its mandatory, unchanged P5 independent campaign.
Source changes, criterion changes and false releases are rejected explicitly.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECISIONS = {
    'sway': 'Physical end actions and refinement fail; a consistent spatial kinematic/force-recovery diagnosis is required before changing the formulation.',
    'spatial': 'The finer worker attempt reaches the unchanged 20 s guard; its coarse fallback is not a verified fine solution. Address bounded assembly cost and physical convergence separately.',
    'torsion': 'Both native and continuous Kirchhoff comparisons retain a physical discrepancy; native fine-mesh equilibrium also fails. Neither larger tolerances nor reference replacement establishes a correction.',
}


def audit(evidence):
    historical = json.loads((ROOT/'validation/m43-p5/evidence.json').read_text(encoding='utf-8'))
    criteria = evidence['criteria']
    assert criteria['reference_relative'] == 1e-7
    assert criteria['equilibrium_relative'] == 1e-8
    assert criteria['refinement_relative'] == 1e-4
    assert criteria['absolute'] == historical['criteria']['absolute']
    for path, expected in historical['preserved_p4_sources'].items():
        current = hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
        assert current == expected, 'P4 core changed: '+path
    assert not evidence['computed_structural_approval'] and not evidence['fabrication_release']
    assert evidence['release_gate'] == 'NOT_READY_BLOCKED'
    cases = []
    for case in evidence['cases']:
        checks = case['after']['checks']
        worst = max(checks.items(), key=lambda entry:entry[1]['maximum_bound_utilization'])
        cases.append(dict(case=case['case'], accepted=case['physical_comparison_verified'],
                          execution=case['execution']['status'], nativeEquilibrium=case['native_equilibrium_verified'],
                          refinementVerified=case['refinement_verified'], worstComponent=worst[0],
                          worstBoundUtilization=worst[1]['maximum_bound_utilization'],
                          maximumPhysicalEndActionError=checks['physical_end_actions']['maximum_absolute_error'],
                          continuousComparisonPassed=(case['continuous_after'] or {}).get('all_bounds_met'),
                          decision='Retain the verified benchmark' if case['case']=='cantilever' else DECISIONS[case['case']]))
    return dict(schema_version='jpn.m50-p5-audit/1', sourceInput='existing P5 campaign; unchanged references and tolerances',
                cases=cases, acceptedCases=evidence['accepted_cases'], pendingCases=evidence['pending_cases'],
                noSmallValidatedCorrectionIdentified=True, newSpatialApproval=False,
                computedStructuralApproval=False, fabricationRelease=False, releaseGate='NOT_READY_BLOCKED')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='validation/m43-p5/evidence.json')
    parser.add_argument('--output', default='.tools/m50-runtime/p5-audit.json')
    args = parser.parse_args()
    result = audit(json.loads(Path(args.input).read_text(encoding='utf-8')))
    target = Path(args.output); target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print('M50 P5 audit:', result['acceptedCases'], 'verified;', result['pendingCases'], 'pending; criteria/core preserved')
