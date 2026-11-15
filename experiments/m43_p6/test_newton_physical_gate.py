import numpy as np
from .newton import physical_equilibrium

def test_scaled_algebraic_residual_does_not_override_zero_load_physical_gate():
    force=1e5;q=np.zeros(12);target=np.zeros(12);target[7]=force
    element={'dofs':np.arange(12),'coordinates':np.array([[0.,0.,0.],[2.,0.,0.]])}
    for error,expected in [(4e-8,False),(1e-9,True)]:
        actions=np.array([-error,-force,0,0,0,-2*force,error,force,0,0,0,0])
        assert error/force<1e-8
        audit=physical_equilibrium([element],q,[{'physical_end_actions':actions}],target,np.arange(6,12))
        assert audit['accepted'] is expected
        assert abs(audit['force_residual_n'][0])==error
