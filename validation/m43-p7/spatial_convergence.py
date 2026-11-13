"""SPATIAL refinement with the compiled kernel against the QUALIFIED P6 reference.

Reference: the committed qualification in validation/m43-p6/reference-v2-evidence.json
(Kirchhoff continuum BVP + OpenSees cross-check, values/uncertainties/orientations),
used read-only. Comparison: the unchanged P6 campaign.evaluate (P5 compare/CRITERIA).
Research levels may exceed 20 s: they run with an explicit, recorded RESEARCH timeout;
the 768 MiB cap is the worker's own. Acceptance criteria are not modified.
Observed orders are reported ONLY where the candidate error exceeds 10x the
reference uncertainty of that field (otherwise the reference error dominates).
    python validation/m43-p7/spatial_convergence.py [--meshes 2 3 4 6 8 16] [--python-reference 6 8]
"""
import argparse, json, sys, platform, subprocess, time, hashlib
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'validation/m43-p6/reference_v2'))
sys.path.insert(0, str(ROOT/'validation/m43-p7'))
import campaign
from benchmark import requests, compare as compare_candidates

WORKER = ROOT/'experiments/m43_p7/worker.py'
RESEARCH_TIMEOUT = 900


def run(n, kernel, timeout):
    raw = json.dumps(requests()['spatial'], sort_keys=True, allow_nan=False).encode()
    cmd = [sys.executable, '-I', str(WORKER), '--material-curvature', '--single-mesh', str(n), '--kernel', kernel]
    started = time.perf_counter()
    try:
        p = subprocess.run(cmd, input=raw, capture_output=True, timeout=timeout, cwd=ROOT, env=campaign.ENV)
        answer = json.loads(p.stdout)
    except subprocess.TimeoutExpired:
        answer = dict(status='TIMEOUT', limit_seconds=timeout)
    return dict(subdivisions=n, kernel=kernel, elapsed_seconds=time.perf_counter()-started, research_timeout_seconds=timeout,
                within_operational_20s=time.perf_counter()-started <= 20, execution=answer)


def main():
    p = argparse.ArgumentParser(); p.add_argument('--meshes', type=int, nargs='+', default=[2, 3, 4, 6, 8, 16])
    p.add_argument('--python-reference', type=int, nargs='*', default=[])
    p.add_argument('--from-raw', action='store_true', help='re-evaluate saved raw worker outputs; no new runs')
    args = p.parse_args()
    evidence = json.loads((ROOT/'validation/m43-p6/reference-v2-evidence.json').read_text(encoding='utf-8'))
    spatial = next(r for r in evidence['results'] if r['case'] == 'spatial')
    qualification, model = spatial['reference_qualification'], spatial['physical_model']
    assert qualification['qualified'] and model == requests()['spatial']['model']
    out = ROOT/'.tools/m43-p7/spatial'; out.mkdir(parents=True, exist_ok=True)
    rows = []
    for n in args.meshes:
        cached = out/f'compiled-{n}.json'
        if args.from_raw:
            row = json.loads(cached.read_text()); rows.append(row); continue
        row = run(n, 'compiled', RESEARCH_TIMEOUT); rows.append(row)
        cached.write_text(json.dumps(row, allow_nan=False))
        print(json.dumps(dict(mesh=n, status=row['execution']['status'], seconds=round(row['elapsed_seconds'], 2),
                              phases=row['execution'].get('phases'))), flush=True)
    equivalence = []
    for n in args.python_reference:
        if args.from_raw:
            ref = json.loads((out/f'python-{n}.json').read_text())
        else:
            ref = run(n, 'python', RESEARCH_TIMEOUT); (out/f'python-{n}.json').write_text(json.dumps(ref, allow_nan=False))
        mine = next(r for r in rows if r['subdivisions'] == n)
        record = dict(mesh=n, python_status=ref['execution']['status'], python_seconds=ref['elapsed_seconds'])
        if ref['execution']['status'] == mine['execution']['status'] == 'diagnostic':
            c = compare_candidates(ref['execution']['diagnostic']['candidate'], mine['execution']['diagnostic']['candidate'])
            record.update(structure_equal=c['structure_equal'], discrete_differences=c.get('discrete_differences'),
                          physical_scaled_deviation={k: v for k, v in c.get('scaled_deviation', {}).items() if k in (
                              'translation_m', 'rotation_rad', 'reaction_force_n', 'reaction_moment_nm', 'end_actions_global',
                              'strain_energy_j', 'orientation_quaternion')})
        equivalence.append(record); print(json.dumps(record), flush=True)
    evaluation = campaign.evaluate(rows, qualification, model)
    u = {k: float(np.max(v)) for k, v in qualification['uncertainty'].items()}
    table = []
    for m in evaluation['meshes']:
        if m['status'] != 'diagnostic':
            table.append(dict(subdivisions=m['subdivisions'], status=m['status'])); continue
        table.append(dict(subdivisions=m['subdivisions'], all_bounds_met=m['all_bounds_met'],
                          physical_equilibrium_verified=m['physical_equilibrium_verified'],
                          max_absolute_error={k: v['maximum_absolute_error'] for k, v in m['checks'].items()},
                          max_utilization={k: v['maximum_bound_utilization'] for k, v in m['checks'].items()},
                          orientation_max_utilization=max(v['bound_utilization'] for v in m['orientation_checks'].values()),
                          seconds=m['elapsed_seconds']))
    resolved = {}
    for k, conv in evaluation['convergence'].items():
        e, n = conv['maximum_absolute_errors'], conv['subdivisions']
        resolved[k] = [dict(pair=[n[i], n[i+1]], order=float(np.log(e[i]/e[i+1])/np.log(n[i+1]/n[i])))
                       for i in range(len(e)-1) if e[i+1] > 10*u[k]]
    report = dict(platform=platform.platform(), python=sys.version.split()[0], research_timeout_seconds=RESEARCH_TIMEOUT,
                  reference='validation/m43-p6/reference-v2-evidence.json (spatial, qualified=True), read-only',
                  reference_max_uncertainty=u, meshes=table, convergence=evaluation['convergence'],
                  orders_where_error_exceeds_10x_reference_uncertainty=resolved, python_kernel_equivalence=equivalence,
                  raw_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.json'))},
                  computed_structural_approval=False, fabrication_release=False, release_gate='NOT_READY_BLOCKED')
    (ROOT/f'validation/m43-p7/spatial-convergence-{sys.platform}.json').write_text(json.dumps(report, indent=1, allow_nan=False))
    for row in table: print(json.dumps(row))
    print(json.dumps(resolved))


if __name__ == '__main__':
    main()
