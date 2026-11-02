"""Authenticated WSGI entrypoint. No numerical imports in the HTTP process.

The existing isolated worker owns parsing, mathematics and the OS memory cap.
There is no development loopback restriction here: every endpoint requires a
server-side bearer token, including health. No CORS or browser credentials.
"""
import hashlib
import hmac
import json
import logging
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

INPUT_BYTES = 500000
OUTPUT_BYTES = 2000000
STDERR_BYTES = 16000
TIMEOUT_SECONDS = 20
MEMORY_BYTES = 768 * 1024 * 1024
WORKER = Path(__file__).resolve().with_name('local_mixed_worker.py')
VERCEL_VENV = Path('/tmp/_vc_deps')
CONTRACTS = ('jpn.mixed3d/1', 'jpn.mixed3d/2')
_slot = threading.BoundedSemaphore(1)  # Per instance, not a distributed quota.
_disabled = False


class TransportError(Exception):
    def __init__(self, code, message, status=422):
        self.code, self.message, self.status = code, message, status


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate JSON key')
        value[key] = item
    return value


def _constant(_):
    raise ValueError('Nonfinite JSON constant')


def _decode(raw):
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique, parse_constant=_constant)
    # JSON numeric exponents can overflow even when no NaN token is present.
    def finite(item):
        if isinstance(item, float) and not math.isfinite(item):
            raise ValueError('Nonfinite number')
        if isinstance(item, dict):
            for v in item.values():
                finite(v)
        elif isinstance(item, list):
            for v in item:
                finite(v)
    finite(value)
    return value


def _stop(process):
    try:
        process.kill()
    except OSError:
        pass


def _worker_python():
    """Keep -I while using Vercel's runtime-installed PEP 405 environment."""
    if not (sys.platform.startswith('linux') and os.environ.get('VERCEL') == '1' and VERCEL_VENV.is_dir()):
        return sys.executable
    packages = VERCEL_VENV / 'lib' / f'python{sys.version_info.major}.{sys.version_info.minor}' / 'site-packages'
    if not (VERCEL_VENV / 'pyvenv.cfg').is_file() or not packages.is_dir():
        raise TransportError('UNAVAILABLE', 'Runtime Python environment is incomplete.', 503)
    python = VERCEL_VENV / 'bin' / 'python'
    # Vercel may create only pyvenv.cfg/site-packages for uv sync. Complete
    # that skeleton without installing/copying packages or trusting PYTHONPATH.
    if not os.path.lexists(python):
        python.parent.mkdir(exist_ok=True)
        python.symlink_to(sys.executable)
    if not python.is_file() or not os.access(python, os.X_OK):
        raise TransportError('UNAVAILABLE', 'Runtime Python interpreter is unavailable.', 503)
    # Do not resolve(): invoking the venv path makes Python discover pyvenv.cfg.
    # Imports and dependency versions are verified inside the memory-capped worker.
    return str(python)


def _worker(payload, health=False, joint_actions=False):
    """Bound both pipes while running; wait for exit before releasing capacity."""
    global _disabled
    if _disabled:
        raise TransportError('CLEANUP_FAILURE', 'Executor disabled after unconfirmed process cleanup.', 503)
    if not _slot.acquire(blocking=False):
        raise TransportError('BUSY', 'One analysis is already running in this instance.', 503)
    process = None
    readers = []
    writer = None
    started = time.monotonic()
    chunks = []
    failure = []
    lock = threading.Lock()
    try:
        if _disabled:
            raise TransportError('CLEANUP_FAILURE', 'Executor disabled after unconfirmed process cleanup.', 503)
        python = _worker_python()
        # This records only booleans, never search paths, credentials or model data.
        if health:
            import importlib.util
            logging.info('jpn_worker_visibility parent_packages=%s pythonpath_present=%s runtime_venv=%s',
                all(importlib.util.find_spec(name) is not None for name in ('Pynite', 'scipy', 'numpy')),
                bool(os.environ.get('PYTHONPATH')), python != sys.executable)
        process = subprocess.Popen([python, '-I', '-X', 'utf8', str(WORKER), *(['--health'] if health else []), *(['--joint-actions'] if joint_actions else [])],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=str(WORKER.parent), env={**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'})
        def abort(code):
            with lock:
                if not failure:
                    failure.append(code)
            _stop(process)
        def read(stream, limit, collect):
            size = 0
            try:
                while True:
                    chunk = stream.read1(65536)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        abort('OUTPUT_LIMIT')
                        break
                    if collect:
                        chunks.append(chunk)
            except OSError:
                abort('SERVICE_FAILURE')
            finally:
                stream.close()
        def write():
            try:
                process.stdin.write(payload)
                process.stdin.close()
            except (OSError, ValueError):
                # A worker rejecting a request may close stdin early. Its
                # structured error remains authoritative after confirmed exit.
                pass
        for stream, limit, collect in [(process.stdout, OUTPUT_BYTES, True), (process.stderr, STDERR_BYTES, False)]:
            thread = threading.Thread(target=read, args=(stream, limit, collect), daemon=True)
            thread.start()
            readers.append(thread)
        writer = threading.Thread(target=write, daemon=True)
        writer.start()
        try:
            process.wait(timeout=max(.001, TIMEOUT_SECONDS - (time.monotonic() - started)))
        except subprocess.TimeoutExpired:
            abort('TIMEOUT')
            try:
                process.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                _disabled = True
                raise TransportError('CLEANUP_FAILURE', 'Process did not confirm exit; executor disabled.', 503)
        for thread in readers + [writer]:
            thread.join(timeout=.5)
        if any(t.is_alive() for t in readers + [writer]):
            _disabled = True
            raise TransportError('CLEANUP_FAILURE', 'Worker pipes did not close; executor disabled.', 503)
        if failure:
            code = failure[0]
            raise TransportError(code, 'Worker stopped without publishing results.', 503 if code != 'OUTPUT_LIMIT' else 422)
        try:
            output = _decode(b''.join(chunks))
        except (ValueError, UnicodeError, RecursionError):
            raise TransportError('INVALID_RESPONSE', 'Worker did not return finite strict JSON.', 503)
        if not isinstance(output, dict):
            raise TransportError('INVALID_RESPONSE', 'Invalid worker envelope.', 503)
        if process.returncode != 0 or output.get('status') == 'error':
            error = output.get('error', {})
            if isinstance(error, dict):
                diagnostic = error.get('diagnostic') or {}
                if not isinstance(diagnostic, dict):
                    diagnostic = {}
                logging.warning('jpn_worker_refusal code=%s phase=%s kind=%s missing=%s returncode=%s',
                    str(error.get('code', 'UNKNOWN'))[:80],
                    str(diagnostic.get('phase', 'not-reported'))[:40],
                    str(diagnostic.get('exception', 'not-reported'))[:40],
                    str(diagnostic.get('missing_module', 'none'))[:40], process.returncode)
            code = error.get('code', 'SERVICE_FAILURE')
            if not isinstance(code, str) or not re.fullmatch(r'[A-Z_]{1,80}', code):
                code = 'SERVICE_FAILURE'
            status = 503 if code in ('MEMORY_LIMIT', 'MEMORY_LIMIT_UNAVAILABLE', 'DEPENDENCY_VERSION', 'UNAVAILABLE') else 422
            raise TransportError(code, 'Structural worker refused the request; no result published.', status)
        execution = output.get('execution', {})
        if output.get('schema_version') != 'jpn.local-mixed/1' or execution.get('memory_limit_bytes') != MEMORY_BYTES or execution.get('memory_kind') not in ('windows-job-process-commit', 'linux-address-space'):
            raise TransportError('INVALID_RESPONSE', 'Protected execution was not confirmed.', 503)
        return output
    except OSError:
        raise TransportError('UNAVAILABLE', 'Python worker could not be started.', 503)
    finally:
        if process is not None:
            if process.poll() is None:
                _stop(process)
                try:
                    process.wait(timeout=1.5)
                except subprocess.TimeoutExpired:
                    _disabled = True
            if process.stdin and (writer is None or not writer.is_alive()):
                try:
                    process.stdin.close()
                except (OSError, ValueError):
                    pass
        _slot.release()


def _execution(output):
    return dict(memory_limit_bytes=output['execution']['memory_limit_bytes'],
                memory_kind=output['execution']['memory_kind'], timeout_seconds=TIMEOUT_SECONDS,
                concurrency_per_instance=1, isolation='subprocess')


def _handle(environ):
    token = os.environ.get('JPN_ANALYSIS_TOKEN', '')
    if not token.strip():
        raise TransportError('CONFIGURATION', 'Server authentication is not configured.', 503)
    auth = environ.get('HTTP_AUTHORIZATION', '')
    if len(auth) > 4096 or not hmac.compare_digest(auth.encode('utf-8'), ('Bearer ' + token).encode('utf-8')):
        raise TransportError('UNAUTHORIZED', 'Bearer authentication required.', 401)
    path, method = environ.get('PATH_INFO', ''), environ.get('REQUEST_METHOD', '')
    if path == '/health' and method == 'GET':
        output = _worker(b'', health=True)
        if output.get('status') != 'ready' or output.get('dependencies', {}).get('python') != '3.12' or output['dependencies'].get('PyNiteFEA') != '3.2.1':
            raise TransportError('DEPENDENCY_VERSION', 'Required runtime was not confirmed.', 503)
        return dict(schema_version='jpn.http-mixed/1', status='ready', contracts=list(CONTRACTS),
                    dependencies=output['dependencies'], execution=_execution(output))
    if path not in ('/health', '/api/analyze-mixed'):
        raise TransportError('NOT_FOUND', 'Unknown endpoint.', 404)
    if path != '/api/analyze-mixed' or method != 'POST':
        raise TransportError('METHOD_NOT_ALLOWED', 'Method not supported.', 405)
    if environ.get('CONTENT_TYPE', '').split(';', 1)[0].strip().lower() != 'application/json':
        raise TransportError('CONTENT_TYPE', 'Send application/json.', 415)
    length = environ.get('CONTENT_LENGTH', '')
    if not length:
        raise TransportError('LENGTH_REQUIRED', 'Content-Length required.', 411)
    if not length.isascii() or not length.isdecimal():
        raise TransportError('INVALID_INPUT', 'Invalid Content-Length.', 400)
    if len(length) > 7 or not 0 < int(length) <= INPUT_BYTES:
        raise TransportError('INPUT_LIMIT', 'Request must be 1..500000 bytes.', 413)
    payload = environ['wsgi.input'].read(int(length))
    if len(payload) != int(length):
        raise TransportError('INVALID_INPUT', 'Incomplete request body.', 400)
    try:
        request = _decode(payload)
    except (ValueError, UnicodeError, RecursionError):
        raise TransportError('INVALID_INPUT', 'Send finite JSON without duplicate keys.')
    if not isinstance(request, dict) or request.get('schema_version') not in CONTRACTS:
        raise TransportError('UNSUPPORTED_MODEL', 'Only jpn.mixed3d/1 and jpn.mixed3d/2 are accepted.')
    trace_header = environ.get('HTTP_X_JPN_JOINT_ACTIONS', '')
    if trace_header not in ('', '1'):
        raise TransportError('INVALID_INPUT', 'Invalid joint-action option.')
    output = _worker(payload, joint_actions=True) if trace_header else _worker(payload)
    result = output.get('result', {})
    expected = request['schema_version'].replace('mixed3d/', 'mixed3d-result/')
    if output.get('status') != 'completed' or result.get('schema_version') != expected or result.get('status') != 'analysis_completed_experimental' or result.get('project') != request.get('project') or not re.fullmatch(r'[a-f0-9]{64}', result.get('input_sha256', '')):
        raise TransportError('INVALID_RESPONSE', 'Result does not match the request.', 503)
    if trace_header and output.get('joint_actions', {}).get('input_sha256') != result['input_sha256']:
        raise TransportError('INVALID_RESPONSE', 'Joint-action trace unavailable or stale.', 503)
    return dict(schema_version='jpn.http-mixed/1', request_sha256=hashlib.sha256(payload).hexdigest(),
                result=result, execution=_execution(output), **({'joint_actions': output['joint_actions']} if trace_header else {}))


def app(environ, start_response):
    """Standard two-argument WSGI callable, explicitly selected by Vercel."""
    try:
        body = _handle(environ)
        status = 200
    except TransportError as exc:
        # Only static error codes/statuses in logs; never tokens, URLs or payloads.
        if exc.status >= 500:
            logging.warning('jpn_mixed_backend_failure code=%s status=%d', exc.code, exc.status)
        status, body = exc.status, dict(error=dict(code=exc.code, message=exc.message))
    except Exception as exc:
        logging.error('jpn_mixed_backend_unexpected exception_type=%s', type(exc).__name__)
        status, body = 503, dict(error=dict(code='SERVICE_FAILURE', message='Request failed; no result published.'))
    try:
        encoded = json.dumps(body, allow_nan=False, ensure_ascii=False,
                             separators=(',', ':') if 'joint_actions' in body else None).encode('utf-8')
        if len(encoded) > OUTPUT_BYTES:
            status, encoded = 422, b'{"error":{"code":"OUTPUT_LIMIT","message":"Response exceeds 2 MB."}}'
    except (ValueError, MemoryError):
        status, encoded = 503, b'{"error":{"code":"INVALID_RESPONSE","message":"Result is not representable."}}'
    reasons = {200:'OK', 400:'Bad Request', 401:'Unauthorized', 404:'Not Found', 405:'Method Not Allowed', 411:'Length Required', 413:'Content Too Large', 415:'Unsupported Media Type', 422:'Unprocessable Content', 503:'Service Unavailable'}
    headers = [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(encoded))), ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')]
    if status == 401:
        headers.append(('WWW-Authenticate', 'Bearer'))
    start_response(f'{status} {reasons[status]}', headers)
    return [encoded]
