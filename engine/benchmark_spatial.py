"""Measured fixtures, not an engineering capacity claim. Isolated by validate.py."""
import copy
import json
from pathlib import Path
import platform
import sys
import time
import tracemalloc
sys.path.insert(0, str(Path(__file__).resolve().parent))
from jpn_structural.frame3d import analyze_frame3d


def grid():
    p = json.loads((Path(__file__).parent / 'examples/spatial-portal.json').read_text(encoding='utf-8'))
    p['nodes'], p['members'], p['supports'], p['nodal_loads'] = [], [], [], []
    template = json.loads((Path(__file__).parent / 'examples/spatial-portal.json').read_text(encoding='utf-8'))['members'][0]
    def member(a, b):
        m = copy.deepcopy(template); m.update(id=f'M{len(p["members"])}', start=a, end=b); p['members'].append(m)
    for i in range(5):
        for j in range(6):
            base, top = f'N{i}-{j}B', f'N{i}-{j}T'
            for nid, z in [(base, 0), (top, 3)]:
                p['nodes'].append(dict(id=nid, x_m=i * 2.5, y_m=j * 4, z_m=z))
            member(base, top); p['supports'].append(dict(node=base, restrained=[True] * 6))
            p['nodal_loads'].append(dict(node=top, case='TESTE', fx_n=0, fy_n=0, fz_n=-500, mx_nm=0, my_nm=0, mz_nm=0))
            if i: member(f'N{i-1}-{j}T', top)
            if j: member(f'N{i}-{j-1}T', top)
    return p


def peak_rss():
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        ctypes.windll.kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        get_memory = ctypes.windll.psapi.GetProcessMemoryInfo
        get_memory.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        get_memory.restype = wintypes.BOOL
        ok = get_memory(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb)
        return counters.PeakWorkingSetSize if ok else None
    import resource
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024)


def benchmark():
    examples = [('portal-5-nodes', json.loads((Path(__file__).parent / 'examples/spatial-portal.json').read_text(encoding='utf-8'))), ('grid-10x20m', grid())]
    results = []
    independent = None
    for name, p in examples:
        tracemalloc.start(); started = time.perf_counter(); r = analyze_frame3d(p)
        elapsed = time.perf_counter() - started; _, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
        results.append(dict(name=name, nodes=len(p['nodes']), members=len(p['members']), elapsed_seconds=elapsed, peak_traced_bytes=peak, process_peak_rss_bytes=peak_rss(), scaled_condition=r['diagnostics']['scaled_condition'], input_sha256=r['input_sha256'], max_equilibrium_residual=max(c['equilibrium']['relative_residual'] for c in r['combinations'].values())))
        if name == 'portal-5-nodes':
            from tests.spatial_reference import force_method
            import numpy as np
            displacements, left, right = force_method(p, 'TESTE-1')
            actual = r['combinations']['TESTE-1']['nodes']
            translations = np.array([actual[n['id']]['translation_m'] for n in p['nodes']])
            rotations = np.array([actual[n['id']]['rotation_rad'] for n in p['nodes']])
            reactions = np.array([actual[nid]['force_n'] + actual[nid]['moment_nm'] for nid in ['A', 'E']])
            reference_reactions = np.array([left, right])
            errors = dict(translation_m=float(np.max(np.abs(translations - displacements[:, :3]))), rotation_rad=float(np.max(np.abs(rotations - displacements[:, 3:]))), reaction_n=float(np.max(np.abs(reactions[:, :3] - reference_reactions[:, :3]))), moment_nm=float(np.max(np.abs(reactions[:, 3:] - reference_reactions[:, 3:]))))
            assert errors['translation_m'] < 1e-10 and errors['rotation_rad'] < 1e-10 and errors['reaction_n'] < 1e-5 and errors['moment_nm'] < 1e-5
            independent = dict(method='Castigliano force method, six redundants, exact quadratic integration; no PyNite matrix or results in reference', reference='https://ocw.mit.edu/courses/2-080j-structural-mechanics-fall-2013/2d0cc95bd3556fdadc28226acabafa51_MIT2_080JF13_Lecture8.pdf', max_absolute_errors=errors, reference_displacements=displacements.tolist(), reference_reactions=reference_reactions.tolist(), input_sha256=r['input_sha256'])
    return dict(environment=dict(python=platform.python_version(), platform=platform.platform()), results=results, independent_reference=independent)


if __name__ == '__main__':
    print(json.dumps(benchmark(), allow_nan=False))
