"""Isolated local worker. Apply OS memory limits BEFORE importing the engine.

Never expose this script as an HTTP endpoint. The development launcher binds
loopback; the Node executor controls time, bytes, concurrency and cancellation.
"""
import json
from pathlib import Path
import sys

MEMORY_BYTES = 768 * 1024 * 1024
_job = None


def memory_limit():
    global _job
    if sys.platform == 'win32':
        import ctypes as c
        from ctypes import wintypes as w
        class Basic(c.Structure):
            _fields_ = [('PerProcessUserTimeLimit', c.c_int64), ('PerJobUserTimeLimit', c.c_int64), ('LimitFlags', w.DWORD),
                        ('MinimumWorkingSetSize', c.c_size_t), ('MaximumWorkingSetSize', c.c_size_t), ('ActiveProcessLimit', w.DWORD),
                        ('Affinity', c.c_size_t), ('PriorityClass', w.DWORD), ('SchedulingClass', w.DWORD)]
        class IO(c.Structure):
            _fields_ = [(name, c.c_uint64) for name in ('ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]
        class Extended(c.Structure):
            _fields_ = [('BasicLimitInformation', Basic), ('IoInfo', IO)] + [(name, c.c_size_t) for name in ('ProcessMemoryLimit', 'JobMemoryLimit', 'PeakProcessMemoryUsed', 'PeakJobMemoryUsed')]
        kernel = c.WinDLL('kernel32', use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]; kernel.CreateJobObjectW.restype = w.HANDLE
        kernel.GetCurrentProcess.restype = w.HANDLE
        kernel.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]; kernel.SetInformationJobObject.restype = w.BOOL
        kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]; kernel.AssignProcessToJobObject.restype = w.BOOL
        kernel.QueryInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.c_void_p]; kernel.QueryInformationJobObject.restype = w.BOOL
        _job = kernel.CreateJobObjectW(None, None)
        info = Extended(); info.BasicLimitInformation.LimitFlags = 0x100 | 0x2000  # process commit memory + kill on close
        info.ProcessMemoryLimit = MEMORY_BYTES
        if not _job or not kernel.SetInformationJobObject(_job, 9, c.byref(info), c.sizeof(info)) or not kernel.AssignProcessToJobObject(_job, kernel.GetCurrentProcess()):
            raise RuntimeError('MEMORY_LIMIT_UNAVAILABLE')
        verified = Extended()
        if not kernel.QueryInformationJobObject(_job, 9, c.byref(verified), c.sizeof(verified), None) or verified.ProcessMemoryLimit != MEMORY_BYTES or verified.BasicLimitInformation.LimitFlags & 0x2100 != 0x2100:
            raise RuntimeError('MEMORY_LIMIT_UNAVAILABLE')
        # Retain the handle for the whole process. Closing it while running would
        # terminate this worker. OS closes it on exit, also cleaning descendants.
        kind = 'windows-job-process-commit'
    elif sys.platform.startswith('linux'):
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
        if resource.getrlimit(resource.RLIMIT_AS) != (MEMORY_BYTES, MEMORY_BYTES):
            raise RuntimeError('MEMORY_LIMIT_UNAVAILABLE')
        kind = 'linux-address-space'
    else:
        raise RuntimeError('MEMORY_LIMIT_UNAVAILABLE')
    return dict(memory_limit_bytes=MEMORY_BYTES, memory_kind=kind, local_only=True)


def main():
    try:
        limits = memory_limit()
        if sys.version_info[:2] != (3, 12):
            raise RuntimeError('DEPENDENCY_VERSION')
        if '--memory-self-test' in sys.argv:
            try:
                bytearray(MEMORY_BYTES + 64 * 1024 * 1024)
            except MemoryError:
                return dict(schema_version='jpn.local-mixed/1', status='memory_limit_verified', execution=limits)
            raise RuntimeError('MEMORY_LIMIT_UNAVAILABLE')
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from importlib.metadata import version
        import Pynite  # real import under the memory cap, never a stub
        import scipy
        import numpy
        if version('PyNiteFEA') != '3.2.1':
            raise RuntimeError('DEPENDENCY_VERSION')
        if '--health' in sys.argv:
            return dict(schema_version='jpn.local-mixed/1', status='ready', execution=limits,
                        dependencies=dict(python='3.12', PyNiteFEA=version('PyNiteFEA'), numpy=numpy.__version__, scipy=scipy.__version__))
        from jpn_structural.__main__ import _unique_object
        from jpn_structural.mixed3d import analyze_mixed3d
        body = sys.stdin.buffer.read(500001)
        if len(body) > 500000:
            raise RuntimeError('INPUT_LIMIT')
        def nonfinite(_):
            raise ValueError('Nonfinite JSON constant')
        data = json.loads(body.decode('utf-8'), object_pairs_hook=_unique_object, parse_constant=nonfinite)
        if type(data) is dict and data.get('schema_version')=='jpn.mixed3d/2':
            from jpn_structural.mixed3d_loads import analyze_loaded_mixed3d
            result=analyze_loaded_mixed3d(data)
        else:
            result = analyze_mixed3d(data)
        return dict(schema_version='jpn.local-mixed/1', status='completed', execution=limits, result=result)
    except MemoryError:
        return dict(status='error', error=dict(code='MEMORY_LIMIT', message='Limite de memória do processo atingido; nenhum resultado publicado.'))
    except (ValueError, TypeError, RecursionError, OverflowError, UnicodeError) as exc:
        return dict(status='error', error=dict(code=getattr(exc, 'code', 'INVALID_INPUT'), message=str(exc)[:2000]))
    except (RuntimeError, ImportError, OSError) as exc:
        allowed = {'MEMORY_LIMIT_UNAVAILABLE', 'DEPENDENCY_VERSION', 'INPUT_LIMIT'}
        code = str(exc) if str(exc) in allowed else 'UNAVAILABLE'
        return dict(status='error', error=dict(code=code, message='Execução local protegida indisponível; verifique Python 3.12, dependências e limites do sistema.'))


if __name__ == '__main__':
    output = main()
    try:
        body = json.dumps(output, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(body) > 2000000:
            body = b'{"status":"error","error":{"code":"OUTPUT_LIMIT","message":"Resposta excede 2 MB."}}'
            output = {'status': 'error'}
    except (ValueError, MemoryError):
        body = b'{"status":"error","error":{"code":"NUMERICAL_FAILURE","message":"Saida nao representavel; sem resultado."}}'
        output = {'status': 'error'}
    sys.stdout.buffer.write(body + b'\n')
    sys.exit(2 if output.get('status') == 'error' else 0)
