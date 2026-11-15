"""Evaluate the analytical frame candidate without selecting it in the worker."""
import json
import math
from pathlib import Path
import sys
from time import perf_counter
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"engine"))

from frame_candidate import frame_responses
from jpn_structural import second_order_mixed as core
from jpn_structural.mixed3d_v3 import analyze_mixed3d_v3
from jpn_structural.model import AnalysisError
from tests.test_mixed3d_second_order_int3d import released_request


def errors(new,old,path=""):
    if "elapsed_seconds" in path:
        return
    if isinstance(old,dict):
        for key in old:
            yield from errors(new[key],old[key],f"{path}/{key}")
    elif isinstance(old,list):
        for i,(a,b) in enumerate(zip(new,old,strict=True)):
            yield from errors(a,b,f"{path}/{i}")
    elif isinstance(old,float) and not math.isclose(new,old,rel_tol=1e-10,abs_tol=1e-10):
        yield {"path":path,"candidate":new,"reference":old,"absolute_error":abs(new-old)}
    elif not isinstance(old,float) and new!=old:
        yield {"path":path,"candidate":new,"reference":old}


def main():
    purlin,_,_ = released_request("purlin-portal")
    purlin["member_loads"] = [dict(id="q",member="P2",case="NL",coordinate_system="global",
                                  force_per_length_n_m=[.2,-.4,-1.],source="INT-3e",revision="1")]
    reference = analyze_mixed3d_v3(purlin)
    shed = json.loads((ROOT/"validation"/"int-3b"/"shed-int1c.json").read_text())
    shed.update(analysis_order="second-order",solution_mode="per-combination",combinations=shed["combinations"][:1])
    with patch.object(core,"frame_responses",frame_responses):
        result = analyze_mixed3d_v3(purlin)
        results = dict(purlin_mismatches=list(errors(result,reference)))
        fine,_,_ = released_request("purlin-portal")
        fine["mesh_initial_subdivisions"] = 4
        try:
            analyze_mixed3d_v3(fine)
            results["purlin_initial_4"] = "accepted"
        except AnalysisError as error:
            results["purlin_initial_4"] = dict(code=error.code,combination=error.combination_id)
        t = perf_counter()
        outcome = analyze_mixed3d_v3(shed)
        results["u_n01"] = dict(seconds=perf_counter()-t,mesh=outcome["mesh_subdivisions"],
                                  convergence=outcome["combinations"]["U-N01"]["equilibrium"])
    result_path = Path(__file__).parent/"frame-candidate.json"
    result_path.write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(results))


if __name__ == "__main__":
    main()
