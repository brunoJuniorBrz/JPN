"""Run the full Python suite and write auditable reference comparison evidence.

Run from any directory after installing engine[validation]. Any missing oracle,
failed test or comparison makes status=failed and the process exit nonzero.
"""

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

# The embedded Windows Python omits the script directory from sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from jpn_structural import analyze
from tests.cases import seeded_case, triangle
from tests.checks import assert_physics, compare
from tests.oracle import pynite_result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "validation-results")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    junit = out / "pytest.xml"
    started = time.perf_counter()
    command = [sys.executable, "-m", "pytest", "-c", str(root / "pyproject.toml"), str(root / "tests"), "-q", f"--junitxml={junit}"]
    suite = subprocess.run(command, cwd=root)
    counts = {k: 0 for k in ("tests", "failures", "errors", "skipped")}
    if junit.exists():
        for node in ET.parse(junit).getroot().iter("testsuite"):
            for key in counts:
                counts[key] += int(node.attrib.get(key, 0))
    maxima = {key: {"absolute": 0.0, "seed": None} for key in ("displacement_m", "reaction_n", "axial_n")}
    comparisons, failures = 0, []
    for seed in range(1000):
        try:
            data = seeded_case(seed)
            result = analyze(data)
            deviation = compare(result, pynite_result(data))
            assert_physics(data, result)
            for key, value in deviation.items():
                if value > maxima[key]["absolute"]:
                    maxima[key] = {"absolute": float(value), "seed": seed}
            comparisons += 1
        except Exception as exc:
            failures.append({"seed": seed, "error": f"{type(exc).__name__}: {exc}"})
        if (seed+1) % 250 == 0:
            print(f"Reference comparisons: {seed+1}/1000", flush=True)
    source_hashes = {str(path.relative_to(root)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in sorted(root.rglob("*.py")) if "build" not in path.relative_to(root).parts}
    healthy = suite.returncode == 0 and counts["tests"] > 0 and not counts["skipped"] and not failures and comparisons == 1000
    report = {
        "status": "passed" if healthy else "failed",
        "scope": "Experimental first-order 2D axial trusses only; not professional validation or code design",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": time.perf_counter()-started,
        "environment": {"python": platform.python_version(), "platform": platform.platform(),
                        **{name: version(name) for name in ("numpy", "scipy", "PyNiteFEA", "pytest")}},
        "pytest": {**counts, "exit_code": suite.returncode},
        "random_campaign": {"generator": "random.Random(seed)", "seeds_inclusive": [0, 999], "passed": comparisons,
            "failures": failures, "max_absolute_deviation": maxima,
            "comparison_tolerances": {"relative": 1e-7, "displacement_absolute_m": 1e-11, "force_absolute_n": 1e-5}},
        "analytical_triangle": analyze(triangle()),
        "source_sha256": source_hashes,
    }
    (out / "validation.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "pytest": report["pytest"], "max_absolute_deviation": maxima}, indent=2))
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main())
