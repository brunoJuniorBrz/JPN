"""M43-P8 comparison with frozen P5 criteria and independent P6 references."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/"validation/m43-p7"))
from benchmark import WORKER, requests
from campaign import FIELDS, FLAGS, candidate_values, evaluate, execute, observables
from network import benchmark_bases
from physical_comparison import compare


LEVELS = {"cantilever": (8,), "sway": (4, 8), "spatial": (4, 8, 16), "torsion": (8, 16, 32)}
NATIVE_LEVELS = {"sway": (16,), "spatial": (16,), "torsion": (16, 64)}


def compare_fields(actual, reference):
    return {key: compare(actual[key], reference[key], key) for key in FIELDS}


def mesh_change(coarse, fine):
    # Same paired physical fields/scales as P4; the requested levels are a
    # research refinement study, independent of external-reference acceptance.
    return max(
        *(float(np.max(abs(coarse[k]-fine[k]))/max(1e-12, np.max(abs(fine[k]))))
          for k in ("translation_m", "rotation_rad")),
        float(np.max(abs(coarse["physical_end_actions"]-fine["physical_end_actions"])
                     /np.maximum(1., abs(fine["physical_end_actions"])))),
    )


def compact(evaluation):
    return {
        "all_bounds_met": evaluation["all_bounds_met"],
        "max_utilization": max(
            *(c["maximum_bound_utilization"] for c in evaluation["checks"].values()),
            *(c["bound_utilization"] for c in evaluation["orientation_checks"].values()),
        ),
        "max_translation_error_m": evaluation["checks"]["translation_m"]["maximum_absolute_error"],
        "max_energy_error_j": evaluation["checks"]["strain_energy_j"]["maximum_absolute_error"],
        "max_end_wrench_error": evaluation["checks"]["physical_end_actions"]["maximum_absolute_error"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensees-python", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT/".tools/m43-p8/campaign")
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    frozen = ROOT/"validation/m43-p6/reference-v2-evidence.json"
    evidence = {r["case"]: r for r in json.loads(frozen.read_text(encoding="utf-8"))["results"]}
    results = {}
    for case, meshes in LEVELS.items():
        request = requests()[case]
        model = request["model"]
        reference = evidence[case]
        if reference["physical_model"] != model:
            raise ValueError(f"Reference geometry/load mismatch: {case}")
        rows, values, native = [], [], []
        for n in meshes:
            row = execute([sys.executable, "-I", str(WORKER), "--material-curvature",
                           "--single-mesh", str(n), "--kernel", "compiled"], request)
            row["subdivisions"] = n
            (out/f"{case}-candidate-{n}.json").write_text(json.dumps(row, allow_nan=False), encoding="utf-8")
            ex = row["execution"]
            if ex["status"] != "diagnostic":
                rows.append(dict(subdivisions=n, status=ex["status"], error=ex.get("error")))
                continue
            candidate = ex["diagnostic"]
            combo = candidate["candidate"]["combinations"]["C"]
            values.append((n, candidate_values(candidate, model)))
            assert all(candidate[k] == v for k,v in FLAGS.items())
            equilibrium = combo["equilibrium"]
            newton = combo["newton_steps"]
            rows.append(dict(
                subdivisions=n, status=ex["status"], seconds=round(row["elapsed_seconds"], 3),
                equilibrium=equilibrium, newton_iterations=[s["iterations"] for s in newton],
                maximum_tangent_condition=max(s["scaled_tangent_condition"] for s in newton),
            ))
            if reference["reference_qualification"]["qualified"]:
                rows[-1]["qualified_comparison"] = compact(evaluate([row], reference["reference_qualification"], model)["meshes"][0])

        for n in NATIVE_LEVELS.get(case, ()):
            worker = ROOT/"validation/m43-p6/reference_v2/worker.py"
            row = execute([str(args.opensees_python.resolve()), "-I", str(worker)],
                          dict(method="native", model=model, bases=benchmark_bases(model),
                               subdivisions=n, test_tolerance=1e-14))
            (out/f"{case}-opensees-{n}.json").write_text(json.dumps(row, allow_nan=False), encoding="utf-8")
            ex = row["execution"]
            item = dict(subdivisions=n, status=ex["status"])
            if ex["status"] == "diagnostic":
                r = ex["result"]
                item.update(version=r["version"], equilibrium=r["physical_support_equilibrium"])
                if values:
                    item["raw_comparison"] = compare_fields(values[-1][1], observables(r))
            else:
                item["error"] = ex.get("error")
            native.append(item)

        result = dict(qualified_reference=reference["reference_qualification"]["qualified"],
                      candidates=rows, native_reference=native)
        if len(values) >= 2:
            result["last_pair"] = [n for n,_ in values[-2:]]
            result["last_pair_relative_change"] = mesh_change(values[-2][1], values[-1][1])
        if case == "torsion" and values:
            # Report the independent continuum separately. The native fine
            # mesh historically fails its equilibrium gate, so this comparison
            # does not promote the combined reference or this benchmark.
            worker = ROOT/"validation/m43-p6/reference_v2/worker.py"
            row = execute([sys.executable, "-I", str(worker)],
                          dict(method="network", model=model, bases=benchmark_bases(model),
                               tolerance=1e-11, initial_nodes=9))
            (out/f"{case}-continuum.json").write_text(json.dumps(row, allow_nan=False), encoding="utf-8")
            ex = row["execution"]
            if ex["status"] == "diagnostic" and ex["result"]["physical_support_equilibrium"]["accepted"]:
                result["continuum_only"] = compare_fields(values[-1][1], observables(ex["result"]))
            else:
                result["continuum_status"] = ex["status"]
                result["continuum_error"] = ex.get("error", ex.get("result", {}).get("physical_support_equilibrium"))
        results[case] = result
        print(case, [(r["subdivisions"],r["status"],r.get("qualified_comparison",{}).get("all_bounds_met")) for r in rows],
              [(r["subdivisions"],r["status"],r.get("equilibrium",{}).get("accepted")) for r in native], flush=True)

    summary = dict(reference_sha256=sha256(frozen.read_bytes().replace(b"\r\n", b"\n")).hexdigest(), results=results, **FLAGS)
    (out/"summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    for case in ("cantilever", "sway", "spatial"):
        fine = results[case]["candidates"][-1]
        assert fine["equilibrium"]["accepted"] and fine["qualified_comparison"]["all_bounds_met"], case
    assert all(r["equilibrium"]["accepted"] for r in results["torsion"]["candidates"] if r["status"] == "diagnostic")
    assert results["torsion"]["candidates"][-1]["status"] == "diagnostic"


if __name__ == "__main__":
    main()
