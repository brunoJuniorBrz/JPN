"""Reproduce the M43 review's diagnostic data; no production solver changes."""
from datetime import datetime, timezone
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.metadata
import importlib.util
import json
import io
from pathlib import Path
import platform
import sys
import pytest
from Pynite import FEModel3D

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
SOURCE = ROOT / "engine/tests/test_m43_pdelta_reference.py"
spec = importlib.util.spec_from_file_location("m43_reference", SOURCE)
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)


def observe(ratio, segments):
    P = ratio * reference.P_EULER
    result = reference._pynite_column(P, segments=segments, nonlinear=True)
    exact = reference.exact_cantilever_tip_displacement(P)
    fx_error = abs(float(result["horizontal_reaction_n"]) + reference.HORIZONTAL)
    return {
        "compressionRatio": ratio, "segments": segments, "compressionN": P,
        "tipXM": float(result["tip_x_m"]), "analyticalTipXM": exact,
        "displacementRelativeError": abs(float(result["tip_x_m"]) / exact - 1),
        "reactionForceN": [float(x) for x in result["reaction_force_n"]],
        "reactionMomentNm": [float(x) for x in result["reaction_moment_nm"]],
        "horizontalReactionAbsoluteErrorN": fx_error,
        "originalHorizontalReactionGatePassed": fx_error <= 1e-6 * reference.HORIZONTAL,
        "tipToLengthRatio": abs(float(result["tip_x_m"])) / reference.LENGTH,
    }


def sensitivity_control():
    """A deliberately LINEAR substitute must fail all three nonlinear cases.

    Patch only this short-lived diagnostic process, restore unconditionally,
    and never mark failing production tests as expected/skip/xfail.
    """
    failures = []

    class Counter:
        def pytest_runtest_logreport(self, report):
            if report.when == "call" and report.failed:
                failures.append(report.nodeid)

    original = FEModel3D.analyze_PDelta

    def linear_substitute(self, **kwargs):
        kwargs.pop("max_iter", None)  # Not a parameter of analyze_linear.
        return self.analyze_linear(**kwargs)

    try:
        FEModel3D.analyze_PDelta = linear_substitute
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            status = pytest.main([str(SOURCE), "-q", "-k",
                                  "matches_independent_exact_cantilever"], plugins=[Counter()])
    finally:
        FEModel3D.analyze_PDelta = original
    if int(status) != 1 or len(failures) != 3:
        raise RuntimeError("Negative control did not reject the three linear substitutes")
    return {"substitution": "analyze_PDelta replaced by analyze_linear in isolated process only",
            "expectedRejectedCases": 3, "observedRejectedCases": len(failures),
            "pytestExitCode": int(status), "controlPassed": True}


if __name__ == "__main__":
    data = {
        "schemaVersion": "jpn.m43-p1-review-evidence/1",
        "reviewedCommit": "c1d8622aed312f0c7500ef7bccb355d0570742c4",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "scope": "Synthetic small-strain frame-only dead-load cantilever; no normative approval",
        "environment": {
            "python": platform.python_version(), "platform": platform.platform(),
            **{name: importlib.metadata.version(name)
               for name in ("PyNiteFEA", "numpy", "scipy", "pytest")},
        },
        "source": {"path": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
                   "lineEndingNormalization": "LF",
                   "sha256": hashlib.sha256(SOURCE.read_bytes().replace(b"\r\n", b"\n")).hexdigest()},
        "originalFourElementMesh": [observe(r, 4) for r in (0, .05, .2, .4)],
        "refinedReferenceMesh": [observe(r, reference.REFERENCE_SEGMENTS)
                                 for r in (0, .05, .2, .4)],
        "meshSensitivityAtFortyPercent": [observe(.4, n) for n in (1, 2, 4, 8, 16, 32, 64)],
        "positiveNearZeroCompression": [
            {"ratio": r, "tipXM": reference.exact_cantilever_tip_displacement(r * reference.P_EULER)}
            for r in (1e-20, 1e-16, 1e-12)
        ],
        "sensitivityControl": sensitivity_control(),
        "productionPDeltaEnabled": False,
        "normativeStabilityVerified": False,
        "computedStructuralApproval": False,
        "fabricationRelease": False,
        "releaseGate": "NOT_READY_BLOCKED",
    }
    output = Path(__file__).with_name("numerical-evidence.json")
    output.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(output.relative_to(ROOT))
