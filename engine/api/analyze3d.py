"""Vercel Python Function for the existing experimental 3D solver.

Create a separate Vercel project with Root Directory set to 'engine'.
Public route: /api/analyze3d. The shared JPN_ANALYSIS_TOKEN is mandatory.
"""
import os

from jpn_structural.service import Handler as _ServiceHandler


class handler(_ServiceHandler):
    """Reuse the audited PyNite worker and its input/output/CPU time limits."""

    def do_GET(self):
        configured = bool(os.environ.get("JPN_ANALYSIS_TOKEN"))
        return self.respond(200 if configured else 503, {
            "service": "jpn-experimental-analysis",
            "mode": "3d",
            "status": "ready" if configured else "configuration_required",
        })

    def do_POST(self):
        if not os.environ.get("JPN_ANALYSIS_TOKEN"):
            return self.respond(503, {
                "error": {"code": "CONFIGURATION", "message": "Server authentication is not configured."}
            })
        # The legacy worker accepts /analyze3d; Vercel exposes /api/analyze3d.
        self.path = "/analyze3d"
        return super().do_POST()
