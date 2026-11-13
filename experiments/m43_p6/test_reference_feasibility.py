import importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('p6_reference_feasibility',Path(__file__).resolve().parents[2]/'validation/m43-p6/reference_feasibility.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def test_impossible_uncertainty_cannot_be_hidden_by_candidate_scale():
    assert module.infeasible([1.],[.2],.01,.1)
    for candidate in np.r_[np.linspace(-10,10,1001),[-1e12,1e12]]:
        assert abs(candidate-1)+.2 > .01+.1*max(abs(candidate),1)
    assert not module.infeasible([1.],[.11],.01,.1)

def test_archived_spatial_reference_has_an_infeasible_translation():
    row=next(c for c in module.audit()['cases'] if c['case']=='spatial')
    assert not row['reference_feasible']
    x=next(c for c in row['infeasible_components']['translation_m'] if c['component']==[6,0])
    assert x['uncertainty_budget_ratio']>7
