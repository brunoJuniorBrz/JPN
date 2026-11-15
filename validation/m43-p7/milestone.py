"""P7 first milestone: one element, compiled vs Python reference (no cProfile).

Reports first-import time, JIT/cache-load time, warm per-element time of both paths,
max scaled deviations of energy/gradient/Hessian, and peak memory of this process.
"""
import json, sys, time, platform
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'engine'), str(ROOT)]
import numpy as np

t0 = time.perf_counter()
from experiments.m43_p7 import compiled
import_seconds = time.perf_counter()-t0
from experiments.m43_p6 import element as reference


def peak_mib():
    try:
        import psutil
        info = psutil.Process().memory_info()
        return getattr(info, 'peak_wset', info.rss)/2**20
    except ImportError:
        return None


def states(rng, count):
    basis = np.linalg.qr(rng.normal(size=(3, 3)))[0]
    basis *= np.sign(np.linalg.det(basis))
    x = np.array([[0., 0., 0.], [0., 0., 0.]]); x[1] = basis[0]*2.5
    for _ in range(count):
        q = np.concatenate([rng.normal(scale=1e-3, size=3), rng.normal(scale=6e-3, size=3),
                            rng.normal(scale=1e-3, size=3), rng.normal(scale=6e-3, size=3)])
        yield x, q, basis


def compare(material):
    reference.MATERIAL_CURVATURE = material
    rng = np.random.default_rng(7); worst = dict(energy=0., gradient=0., hessian=0., symmetry=0.)
    args = (2.1e11*5e-3, 2.1e11*8e-5, 2.1e11*3e-5, 8.1e10*2e-6)
    for x, q, basis in states(rng, 40):
        a = reference.element_response(x, q, *args, basis); b = compiled.element_response(x, q, *args, basis)
        worst['energy'] = max(worst['energy'], abs(a['energy']-b['energy'])/abs(a['energy']))
        worst['gradient'] = max(worst['gradient'], np.max(abs(a['force']-b['force']))/np.max(abs(a['force'])))
        worst['hessian'] = max(worst['hessian'], np.max(abs(a['tangent']-b['tangent']))/np.max(abs(a['tangent'])))
        worst['symmetry'] = max(worst['symmetry'], np.max(abs(b['tangent']-b['tangent'].T))/np.max(abs(b['tangent'])))
    timing = {}
    x, q, basis = next(states(np.random.default_rng(1), 1))
    for name, fn in (('python', reference.element_response), ('compiled', compiled.element_response)):
        reps = 20 if name == 'python' else 2000
        samples = []
        for _ in range(5):
            t = time.perf_counter()
            for _ in range(reps): fn(x, q, *args, basis)
            samples.append((time.perf_counter()-t)/reps)
        timing[name] = float(np.median(samples))
    return worst, timing


t0 = time.perf_counter()
reference.MATERIAL_CURVATURE = True
x, q, basis = next(states(np.random.default_rng(3), 1))
compiled.element_response(x, q, 1e9, 1e7, 5e6, 1e6, basis)
first_call_seconds = time.perf_counter()-t0
report = dict(platform=platform.platform(), python=sys.version.split()[0], numpy=np.__version__,
              numba=__import__('numba').__version__, import_seconds=import_seconds, first_call_seconds=first_call_seconds)
for material in (True, False):
    worst, timing = compare(material)
    report['material_curvature' if material else 'historical_bending'] = dict(
        max_scaled_deviation=worst, seconds_per_element=timing, speedup=timing['python']/timing['compiled'])
report['peak_mib'] = peak_mib()
print(json.dumps(report, indent=1))
