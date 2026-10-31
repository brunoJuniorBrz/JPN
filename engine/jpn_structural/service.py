"""Private HTTP adapter; put behind a TLS reverse proxy for remote deployment."""
import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
import sys
import threading

slots = threading.BoundedSemaphore(2)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Do not log project data, headers or credentials.

    def respond(self, status, body):
        encoded = json.dumps(body, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        self.respond(200 if self.path == "/health" else 404, {"service": "jpn-experimental-analysis"})

    def do_POST(self):
        self.connection.settimeout(25)
        token = os.environ.get("JPN_ANALYSIS_TOKEN")
        if token and not hmac.compare_digest(self.headers.get("Authorization", "").encode("utf-8"), f"Bearer {token}".encode("utf-8")):
            return self.respond(401, {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}})
        if self.path not in ("/analyze", "/analyze3d"):
            return self.respond(404, {"error": {"code": "NOT_FOUND", "message": "Unknown path"}})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 500000:
                return self.respond(413, {"error": {"code": "INPUT_LIMIT", "message": "Body must be 1..500000 bytes"}})
            if not slots.acquire(blocking=False):
                return self.respond(503, {"error": {"code": "BUSY", "message": "Analysis capacity reached"}})
            try:
                payload = self.rfile.read(length)
                if len(payload) != length:
                    raise ValueError("Incomplete request")
                # Separate worker enforces a hard timeout and releases numerical memory.
                module = "jpn_structural.frame3d" if self.path == "/analyze3d" else "jpn_structural"
                worker_env = {**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
                result = subprocess.run([sys.executable, "-m", module], input=payload, capture_output=True, timeout=20, env=worker_env)
                if len(result.stdout) > 2_000_000:
                    return self.respond(422, {"error": {"code": "OUTPUT_LIMIT", "message": "Resposta excede 2 MB"}})
                data = json.loads(result.stdout)
                if result.returncode:
                    return self.respond(422, data)
                self.respond(200, {"request_sha256": hashlib.sha256(payload).hexdigest(), "result": data})
            finally:
                slots.release()
        except subprocess.TimeoutExpired:
            self.respond(503, {"error": {"code": "TIMEOUT", "message": "Processo interrompido após 20 segundos"}})
        except (ValueError, OSError, subprocess.SubprocessError) as exc:
            self.respond(422, {"error": {"code": "SERVICE_FAILURE", "message": type(exc).__name__}})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    if args.host not in ("localhost", "127.0.0.1", "::1") and not os.environ.get("JPN_ANALYSIS_TOKEN"):
        parser.error("Non-loopback hosting requires JPN_ANALYSIS_TOKEN and a TLS reverse proxy")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
