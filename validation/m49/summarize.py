"""Compact real-worker evidence; reads the Vitest artifact, never fabricates it.

Usage: python validation/m49/summarize.py [artifact.json] [summary.json]
No NumPy/PyNite imports. Expected values are the independent closed forms
already exported by analytical-reference.ts; this file only extracts results.
"""
import json
from pathlib import Path
import sys


def summarize(path):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    request = raw["prepared"]["request"]
    result = raw["result"]
    assert result["input_sha256"] == raw["prepared"]["input_sha256"]
    manual = {r["pressureNPerM2"]: r for r in raw["manual"]}
    comparisons = []
    for combo in request["combinations"]:
        pressure = 600 * combo["factors"]["G"] - 900 * combo["factors"]["W"]
        expected = manual[pressure]
        actual = result["combinations"][combo["id"]]
        center = actual["members"]["PC"]["stations"][2]["translation_local_m"]
        axes = raw["trace"]["members"]["PC"]["global_to_local"]
        deflection = sum(axes[i][2] * center[i] for i in range(3))
        observed = dict(
            cornerReactionN=actual["nodes"]["A0"]["reaction_force_n"][2],
            beamMidspanM=actual["nodes"]["C0"]["translation_m"][2],
            purlinAbsoluteMidspanM=deflection,
        )
        errors = {k: abs(v - expected[k]) for k, v in observed.items()}
        assert errors["cornerReactionN"] < 1e-6
        assert max(errors["beamMidspanM"], errors["purlinAbsoluteMidspanM"]) < 1e-10
        comparisons.append(dict(combination=combo["id"], pressureNPerM2=pressure,
                                expected=expected, actual=observed, absoluteErrors=errors,
                                solverRelativeResidual=actual["equilibrium"]["relative_residual"]))
    report = raw["report"]
    assert report["releaseGate"]["status"] == "NOT_READY_BLOCKED"
    assert all(s["status"] == "capacity-pending" for s in report["supportAudits"])
    return dict(schema_version="jpn.m49-analytical-comparison/1", units="SI",
                basis="Synthetic declared 6 x 4 m garage; not site or normative approval",
                inputSha256=result["input_sha256"], solver=result["solver"],
                nodes=len(request["nodes"]), physicalMembers=5, solverSegments=len(request["members"]),
                supports=[s["node"] for s in request["supports"]],
                comparisons=comparisons, allSupportCapacities="pending",
                computedStructuralApproval=False, fabricationRelease=False,
                releaseGate="NOT_READY_BLOCKED")


if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else ".tools/m49-runtime/garage.json"
    target = Path(sys.argv[2] if len(sys.argv) > 2 else ".tools/m49-runtime/analytical-comparison.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(summarize(source), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("M49: six independent analytical comparisons passed; existing support capacities pending")
