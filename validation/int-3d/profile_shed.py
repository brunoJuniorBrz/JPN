"""Report wall and component times without exporting unconverged results."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"engine"))

from jpn_structural import mixed3d_second_order as mixed
from jpn_structural import second_order_mixed as core
from jpn_structural import second_order_mesh as mesh
from jpn_structural.model import AnalysisError


def profile(max_subdivisions, first_only):
    raw = json.loads((ROOT/"validation"/"int-3b"/"shed-int1c.json").read_text(encoding="utf-8"))
    raw.update(analysis_order="second-order",solution_mode="per-combination")
    if first_only:
        raw["combinations"] = raw["combinations"][:1]
    if max_subdivisions is not None:
        mesh.MAX_SUBDIVISIONS = max_subdivisions
    names = [combo["id"] for combo in raw["combinations"]]
    elapsed = defaultdict(float)
    samples = []

    def instrument(module, attr, label):
        original = getattr(module,attr)

        def measured(*args,**kwargs):
            t = perf_counter()
            try:
                return original(*args,**kwargs)
            finally:
                elapsed[label] += perf_counter()-t

        setattr(module,attr,measured)

    for attr,label in (("frame_response","frame_ad"),("dead_uniform_action","uniform_ad"),("_solve","linear_algebra")):
        instrument(core,attr,label)
    instrument(mixed,"peak_efforts","peak_efforts")
    original = mixed.solve_combination

    def measured(*args,**kwargs):
        previous = dict(elapsed)
        t = perf_counter()
        outcome = None
        try:
            outcome = original(*args,**kwargs)
            return outcome
        finally:
            index = len(samples)
            samples.append(dict(combination=names[index%len(names)],nodes=len(args[1]),
                                solve_s=perf_counter()-t,iterations=None if outcome is None else outcome["iterations"],
                                stages_s={k:v-previous.get(k,0.) for k,v in elapsed.items()}))

    mixed.solve_combination = measured
    started = perf_counter()
    try:
        result = mixed.analyze_second_order_v3(raw,None)
        refusal = None
    except AnalysisError as error:
        result = None
        refusal = dict(code=error.code,combination_id=error.combination_id,message=str(error))
    return dict(seconds=perf_counter()-started,combinations=len(names),accepted=result is not None,
                refusal=refusal,stages_s=dict(elapsed),samples=samples)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-subdivisions",type=int)
    parser.add_argument("--first-only",action="store_true")
    parser.add_argument("--output",type=Path,required=True)
    args = parser.parse_args()
    evidence = profile(args.max_subdivisions,args.first_only)
    args.output.write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for (k,v) in evidence.items() if k!="samples"}))
