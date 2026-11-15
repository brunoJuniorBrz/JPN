"""Opt-in cProfile observer. Same worker guards; snapshots survive TIMEOUT.

Profiled timings include observer overhead and are not acceptance timings.
Only .tools sidecars are written, without changing numerical functions.
"""
import cProfile,json,marshal,os,runpy,sys,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
target=Path(sys.argv.pop(1)).resolve()
if not target.is_relative_to((ROOT/'.tools').resolve()):raise ValueError('Profile output outside .tools')
target.parent.mkdir(parents=True,exist_ok=True)
profile=cProfile.Profile();stop=threading.Event();started=time.perf_counter()

def peak_memory():
    if sys.platform=='win32':
        import ctypes as c
        class Counters(c.Structure):
            _fields_=[('cb',c.c_ulong),('faults',c.c_ulong)]+[(k,c.c_size_t) for k in ('peak_working','working','peak_pool','pool','peak_nonpaged','nonpaged','pagefile','peak_pagefile')]
        p=Counters();p.cb=c.sizeof(p)
        kernel=c.WinDLL('kernel32');kernel.GetCurrentProcess.restype=c.c_void_p
        api=c.WinDLL('psapi');api.GetProcessMemoryInfo.argtypes=[c.c_void_p,c.c_void_p,c.c_ulong]
        if not api.GetProcessMemoryInfo(kernel.GetCurrentProcess(),c.byref(p),p.cb):raise OSError('Memory measurement unavailable')
        return dict(peak_working_set_bytes=p.peak_working,peak_commit_bytes=p.peak_pagefile)
    import resource
    return dict(peak_resident_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)

def snapshot():
    temporary=target.with_suffix('.tmp')
    # dump_stats calls create_stats/disable, which would stop the live profile.
    profile.snapshot_stats()
    with temporary.open('wb') as stream:marshal.dump(profile.stats,stream)
    os.replace(temporary,target)
    target.with_suffix('.memory.json').write_text(json.dumps(dict(elapsed=time.perf_counter()-started,**peak_memory())))

def observer():
    while not stop.wait(1.):snapshot()

thread=threading.Thread(target=observer,daemon=True)
profile.enable();thread.start()
try:runpy.run_path(str(ROOT/'experiments/m43_p6/worker.py'),run_name='__main__')
finally:
    profile.disable();stop.set();thread.join();snapshot()
