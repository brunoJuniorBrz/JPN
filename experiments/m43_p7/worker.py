"""Standalone P7 worker: same capped environment as the P6 worker, plus --kernel.

Usage: python -I experiments/m43_p7/worker.py --material-curvature --single-mesh N --kernel compiled|python
Reports per-phase wall times (import, kernel load/JIT, solve) measured in-process.
"""
import time
_started = time.perf_counter()
from pathlib import Path
import sys, json
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'engine'))
from local_mixed_worker import memory_limit
limits = memory_limit()
sys.path.insert(0, str(ROOT))
phases = {}
try:
    kernel_name = sys.argv[sys.argv.index('--kernel')+1] if '--kernel' in sys.argv else 'python'
    from experiments.m43_p7 import pilot
    if '--material-curvature' in sys.argv:
        from experiments.m43_p6 import element
        element.MATERIAL_CURVATURE = True
    phases['import_seconds'] = time.perf_counter()-_started
    if kernel_name == 'compiled':
        t = time.perf_counter()
        from experiments.m43_p7 import kernel
        import numpy as np
        kernel.evaluate(np.array([1., 0., 0.]), 1., np.zeros(12), np.array([1., 0., 0., 0.]), 1., 1., 1., 1., True, True,
                        kernel.POINTS, kernel.WEIGHTS)          # loads (or JIT-compiles) the native code
        phases['kernel_load_seconds'] = time.perf_counter()-t
    pilot.use_kernel(kernel_name)
    raw = sys.stdin.buffer.read(500001)
    if len(raw) > 500000: raise ValueError('INPUT_LIMIT')
    request = json.loads(raw)
    t = time.perf_counter()
    result = pilot.single_mesh_study(request, int(sys.argv[sys.argv.index('--single-mesh')+1]))
    phases['solve_seconds'] = time.perf_counter()-t
    out = dict(status='diagnostic', execution=limits, diagnostic=result)
except Exception as e:
    out = dict(status='refused', error=dict(code=getattr(e, 'code', type(e).__name__), message=str(e)))
phases['process_seconds'] = time.perf_counter()-_started


def _peak_bytes():
    if sys.platform == 'win32':
        import ctypes as c
        from ctypes import wintypes as w
        class Counters(c.Structure):
            _fields_ = [('cb', w.DWORD), ('PageFaultCount', w.DWORD)] + [(n, c.c_size_t) for n in (
                'PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage',
                'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
        k = Counters(); k.cb = c.sizeof(k)
        kernel32 = c.WinDLL('kernel32')
        kernel32.GetCurrentProcess.restype = w.HANDLE
        kernel32.K32GetProcessMemoryInfo.argtypes = [w.HANDLE, c.c_void_p, w.DWORD]
        kernel32.K32GetProcessMemoryInfo.restype = w.BOOL
        if not kernel32.K32GetProcessMemoryInfo(kernel32.GetCurrentProcess(), c.byref(k), k.cb):
            return dict(error='GetProcessMemoryInfo failed')
        return dict(peak_commit_bytes=k.PeakPagefileUsage, peak_working_set_bytes=k.PeakWorkingSetSize)
    import resource
    return dict(peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)


phases['memory'] = _peak_bytes()
out['phases'] = phases
body = json.dumps(out, allow_nan=False).encode()
if len(body) > 2000000: raise ValueError('OUTPUT_LIMIT')
sys.stdout.buffer.write(body)
sys.exit(0 if out['status'] == 'diagnostic' else 2)
