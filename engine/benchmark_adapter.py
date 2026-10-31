"""Reproducible measurement of the actual JPN-generated, explicitly declared roof.

Run with OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1.
An operating envelope is not a guarantee for every model within the size limits.
"""
import json
from pathlib import Path
import platform
import sys
import time
import tracemalloc
sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_spatial import peak_rss
from jpn_structural.frame3d import analyze_frame3d


def benchmark():
    p = json.loads((Path(__file__).parent / 'examples/spatial-adapted-roof.json').read_text(encoding='utf-8'))
    tracemalloc.start(); started = time.perf_counter(); result = analyze_frame3d(p)
    elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
    combo = result['combinations']['TESTE-1']
    output = dict(environment=dict(python=platform.python_version(), platform=platform.platform()),
                  nodes=len(p['nodes']), original_members=207, physical_segments=len(p['members']),
                  elapsed_seconds=elapsed, peak_traced_bytes=peak, process_peak_rss_bytes=peak_rss(),
                  input_bytes=len(json.dumps(p).encode()), output_bytes=len(json.dumps(result).encode()),
                  input_sha256=result['input_sha256'], diagnostics=result['diagnostics'],
                  max_translation_m=max(sum(v*v for v in n['translation_m'])**.5 for n in combo['nodes'].values()),
                  equilibrium=combo['equilibrium'])
    assert elapsed < 20 and output['input_bytes'] < 500000 and output['output_bytes'] < 2000000
    return output


if __name__ == '__main__':
    print(json.dumps(benchmark(), allow_nan=False))
