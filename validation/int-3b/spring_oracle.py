"""Qualify the truss oracle against the laterally restrained straight bar."""
import argparse
import json
from pathlib import Path

import openseespy.opensees as ops

L, EA, SPRING, H = 4., 2e9, 100_000., 1.
RATIOS = (.40, .75)
CRITERIA = {"relative_displacement": .01, "relative_amplification": .01,
            "relative_geometric_tangent": .01, "relative_axial_force": 1e-8}


def solve(compression, side_force):
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 2)
    ops.node(1, 0., 0.)
    ops.node(2, 0., L)
    ops.node(3, 0., L)
    ops.fix(1, 1, 1)
    ops.fix(3, 1, 1)
    ops.uniaxialMaterial("Elastic", 1, EA)
    ops.uniaxialMaterial("Elastic", 2, SPRING)
    ops.element("corotTruss", 1, 1, 2, 1., 1)
    ops.element("zeroLength", 2, 3, 2, "-mat", 2, "-dir", 1)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    ops.load(2, side_force, -compression)
    ops.constraints("Plain")
    ops.numberer("Plain")
    ops.system("FullGeneral")
    ops.test("NormDispIncr", 1e-12, 30)
    ops.algorithm("Newton")
    ops.integrator("LoadControl", .1)
    ops.analysis("Static")
    if ops.analyze(10):
        raise RuntimeError("OpenSees failed the spring + truss model")
    return {"translation_m": ops.nodeDisp(2, 1), "axial_motion_m": ops.nodeDisp(2, 2),
            "axial_force_n": ops.eleResponse(1, "axialForce")[0]}


def qualify():
    unloaded = solve(0., H)["translation_m"]
    cases = []
    for ratio in RATIOS:
        P = ratio * SPRING * L
        state = solve(P, H)
        straight = solve(P, 0.)
        # At the straight state axial and lateral tangents are uncoupled.
        # Centered load perturbations recover the lateral tangent directly.
        forward = solve(P, H/2)["translation_m"]
        backward = solve(P, -H/2)["translation_m"]
        tangent = H/(forward-backward)
        targets = {"translation_m": H/(SPRING-P/L), "amplification": 1/(1-ratio),
                   "geometric_tangent_n_m": -P/L, "axial_force_n": -P}
        actual = {"translation_m": state["translation_m"], "amplification": state["translation_m"]/unloaded,
                  "geometric_tangent_n_m": tangent-SPRING, "axial_force_n": straight["axial_force_n"]}
        errors = {name: abs(actual[name]/expected-1) for name, expected in targets.items()}
        passed = all(error <= tolerance for error, tolerance in zip(errors.values(), CRITERIA.values()))
        cases.append(dict(critical_ratio=ratio, compression_n=P, analytical=targets, opensees=actual,
                          relative_errors=errors, passed=passed))
    return dict(geometry=dict(length_m=L, ea_n=EA, spring_n_m=SPRING, transverse_n=H),
                critical_load_n=SPRING*L, criteria=CRITERIA, cases=cases,
                passed=all(c["passed"] for c in cases))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("oracle.json"))
    args = parser.parse_args()
    if ops.version() != "3.8.0":
        raise RuntimeError("Use the pinned diagnostic OpenSees")
    original = json.loads(Path(__file__).with_name("oracle.json").read_text(encoding="utf-8"))
    history = original.get("euler_history", {"classification": "fora do domínio de treliça", "gate": False,
                                              "original_result": original})
    spring = qualify()
    result = dict(schema_version="jpn.int-3b-oracle/2", opensees=ops.version(), euler_history=history,
                  spring_truss=spring, passed=spring["passed"], computedStructuralApproval=False,
                  fabricationRelease=False, releaseGate="NOT_READY_BLOCKED")
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print("spring + truss:", [(c["critical_ratio"], c["opensees"]["amplification"], c["passed"]) for c in spring["cases"]])


if __name__ == "__main__":
    main()
