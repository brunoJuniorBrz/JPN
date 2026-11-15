import numpy as np
import pytest
from . import element
from .pilot import solver,trial_assemble
from .newton import newton
from .test_pilot import X,PARAM

@pytest.mark.parametrize('material',[False,True])
def test_cached_newton_is_bitwise_equivalent_to_uncached_solution(monkeypatch,material):
    monkeypatch.setattr(element,'MATERIAL_CURVATURE',material)
    row=dict(coordinates=X,ea=PARAM[0],eiy=PARAM[1],eiz=PARAM[2],gj=PARAM[3],basis=PARAM[4],dofs=np.arange(12))
    initial=solver.assemble([row],np.zeros(12),3)[1]
    force=np.zeros(12);force[6]=1000.
    args=([row],force,np.arange(6,12),initial,2.,3)
    plain=newton(*args,assemble=solver.assemble,trial_assemble=trial_assemble,use_cache=False)
    cached=newton(*args,assemble=solver.assemble,trial_assemble=trial_assemble,use_cache=True)
    np.testing.assert_array_equal(cached[0],plain[0])
    np.testing.assert_array_equal(cached[1],plain[1])
    assert cached[0].tobytes()==plain[0].tobytes()
    assert cached[1].tobytes()==plain[1].tobytes()
    assert cached[3]==plain[3]
    assert [r['iterations'] for r in cached[4]]==[r['iterations'] for r in plain[4]]
    assert cached[5]['exact_state_reuses']>=9
    assert cached[5]['full_assembly_evaluations']<plain[5]['full_assembly_evaluations']
    assert cached[4][-1]['physical_equilibrium_at_convergence']['accepted']
