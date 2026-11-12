"""P2 diagnostic drift guard; never a physical acceptance criterion.

Frozen BEFORE implementing the P3 algorithm. Limits preserve 98% of the
recorded quality, with unit-specific numerical floors for cancellation around
zero. Independent physical comparison limits remain separately unchanged.
"""
import json
from pathlib import Path

BASELINE = Path(__file__).with_name("p2-baseline.json")


def metrics(evidence):
    rows = {}
    for case in evidence["cases"]:
        key = f"{case['geometry']}:{case['compression_per_column_n']:.9g}:{case['lateral_x_n']:g}"
        if not case["independent_comparison_executed"]:
            rows[key] = {"rejection": case["native_rejection"]}
            continue
        row = {}
        for phase, checks in case["checks"].items():
            for component, check in checks.items():
                row[phase+":"+component] = check["maximum_absolute_error"]
        row["member_end_actions"] = case["member_end_comparison"]["maximum_absolute_difference"]
        row["axial_assembly_recovery"] = case["maximum_assembly_recovery_axial_difference_n"]
        eq = case["full_dead_load_equilibrium"]
        row["force_relative_residual"] = max(eq["force_relative_residual"])
        row["moment_relative_residual"] = max(eq["moment_relative_residual"])
        for k, v in case["refinement"].items():
            if k.startswith("refinement_relative_"):
                row[k] = v
        rows[key] = row
    return rows


def floor(key):
    if "translation_m" in key or "rotation_rad" in key:
        return 1e-10
    if "relative" in key:
        return 1e-8
    return 1e-5  # N / N.m; same near-zero floor as independent P2 checks.


def check_regression(evidence, baseline=None):
    baseline = baseline or json.loads(BASELINE.read_text(encoding="utf-8"))
    current = metrics(evidence)
    if set(current) != set(baseline["metrics"]):
        raise AssertionError("P2 diagnostic cases changed; do not silently remove a regression")
    failures = []
    for case, expected in baseline["metrics"].items():
        actual = current[case]
        if set(actual) != set(expected):
            raise AssertionError("P2 diagnostic categories/rejection changed: "+case)
        for key, reference in expected.items():
            if key == "rejection":
                if actual[key] != reference:
                    failures.append((case, key, actual[key], reference))
            else:
                # 2% diagnostic drift budget, NOT a relaxation of acceptance.
                limit = max(1.02*reference, floor(key))
                if not 0 <= actual[key] <= limit:
                    failures.append((case, key, actual[key], limit))
    if failures:
        raise AssertionError("P2 diagnostic quality regressed: "+repr(failures))
    return current


if __name__ == "__main__":
    import sys
    evidence = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    check_regression(evidence)
    print("P2 numerical baseline: all recorded categories within frozen drift bounds")
