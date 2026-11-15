"""P7 acceptance-condition benchmark: python vs compiled kernel, SPATIAL single meshes.

Same request, worker caps (768 MiB) and 20 s subprocess limit as the P6 directed study
(campaign.execute), no cProfile. The compiled kernel's native cache must exist before
timing (`python validation/m43-p7/benchmark.py --warm-cache-only` builds it); its load
time is still inside every measured process.
    python validation/m43-p7/benchmark.py [--meshes 2 3 4 6 8] [--repeat 1]
"""
import argparse, json, sys, platform, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'validation/m43-p6/reference_v2'))
from campaign import execute

WORKER = ROOT/'experiments/m43_p7/worker.py'


def requests():
    baseline = json.loads((ROOT/'validation/m43-p5/p4-baseline.json').read_text())
    old = json.loads((ROOT/'validation/m43-p5/evidence.json').read_text())
    return {r['case']: {**r['request'], 'numerics': o['requested_numerics']} for r, o in zip(baseline['cases'], old['cases'])}


def leaves(node, path=(), out=None):
    out = {} if out is None else out
    if isinstance(node, dict):
        for k, v in node.items(): leaves(v, path+(k,), out)
    elif isinstance(node, list) and node and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in node):
        out.setdefault(path, []).extend(float(v) for v in node)
    elif isinstance(node, list):
        for i, v in enumerate(node): leaves(v, path+(i,), out)
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        out.setdefault(path, []).append(float(node))
    else:
        out.setdefault(path, []).append(node)
    return out


def compare(a, b):
    """Max deviation per leaf name, scaled by the largest reference magnitude of that name."""
    la, lb = leaves(a), leaves(b)
    if la.keys() != lb.keys(): return dict(structure_equal=False)
    groups, discrete = {}, []
    for path in la:
        name = next((p for p in reversed(path) if isinstance(p, str)), 'root')
        for x, y in zip(la[path], lb[path]):
            if isinstance(x, float) and isinstance(y, float):
                g = groups.setdefault(name, [0., 0.]); g[0] = max(g[0], abs(x-y)); g[1] = max(g[1], abs(x))
            elif x != y:
                discrete.append(['/'.join(map(str, path)), x, y])
    integers = {n: v for n, v in groups.items()}
    return dict(structure_equal=True, discrete_differences=discrete[:20],
                scaled_deviation={n: (d/s if s else d) for n, (d, s) in integers.items()},
                absolute_deviation={n: d for n, (d, s) in integers.items()})


def main():
    p = argparse.ArgumentParser(); p.add_argument('--meshes', type=int, nargs='+', default=[2, 3, 4, 6, 8])
    p.add_argument('--repeat', type=int, default=1); p.add_argument('--kernels', nargs='+', default=['python', 'compiled'])
    p.add_argument('--warm-cache-only', action='store_true'); p.add_argument('--out', default=str(ROOT/'.tools/m43-p7/benchmark'))
    args = p.parse_args()
    if args.warm_cache_only:
        code = ("import sys;sys.path[:0]=[r'%s',r'%s'];import numpy as np;from experiments.m43_p7 import kernel;"
                "kernel.evaluate(np.array([1.,0,0]),1.,np.zeros(12),np.array([1.,0,0,0]),1.,1.,1.,1.,True,True,kernel.POINTS,kernel.WEIGHTS)") % (ROOT/'engine', ROOT)
        subprocess.run([sys.executable, '-c', code], check=True); return
    spatial = requests()['spatial']; out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    report = dict(platform=platform.platform(), python=sys.version.split()[0], runs=[], comparisons=[],
                  computed_structural_approval=False, fabrication_release=False, release_gate='NOT_READY_BLOCKED')
    for n in args.meshes:
        results = {}
        for kernel in args.kernels:
            for r in range(args.repeat):
                cmd = [sys.executable, '-I', str(WORKER), '--material-curvature', '--single-mesh', str(n), '--kernel', kernel]
                row = execute(cmd, spatial); ex = row['execution']
                (out/f'spatial-{n}-{kernel}-{r}.json').write_text(json.dumps(row, allow_nan=False))
                cand = ex.get('diagnostic', {}).get('candidate')
                record = dict(mesh=n, kernel=kernel, repeat=r, status=ex.get('status'), elapsed_seconds=row['elapsed_seconds'],
                              phases=ex.get('phases'), error=ex.get('error'),
                              memory=(ex.get('phases') or {}).get('memory'))
                report['runs'].append(record); print(json.dumps(record), flush=True)
                if ex.get('status') == 'diagnostic': results.setdefault(kernel, cand)
        if len(results) == 2:
            c = dict(mesh=n, **compare(results['python'], results['compiled']))
            report['comparisons'].append(c); print(json.dumps({k: c[k] for k in ('mesh', 'structure_equal')}), flush=True)
        (out/'summary.json').write_text(json.dumps(report, indent=1, allow_nan=False))
    (ROOT/f'validation/m43-p7/benchmark-{sys.platform}.json').write_text(json.dumps(report, indent=1, allow_nan=False))


if __name__ == '__main__':
    main()
