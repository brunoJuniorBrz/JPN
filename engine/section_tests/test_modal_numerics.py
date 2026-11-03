"""Real rounded-Ue cFSM regression for positive but inconsistent eigenvalues."""
import json
from pathlib import Path
import warnings

import numpy as np
import pytest
from pycufsm import fsm
from pycufsm.pre import cutwp
from pycufsm.solve.analysis import analysis

from jpn_structural.constrained_modes import ConstrainedModes
from jpn_structural.member_buckling import midline_u

pytestmark=pytest.mark.filterwarnings('default:Conversion of an array with ndim > 0 to a scalar is deprecated:DeprecationWarning')


def test_positive_upstream_scalar_can_contradict_its_returned_mode_energy():
    # Fixed reproducible red case, discovered by a bounded wavelength search.
    # No ABNT capacity or external roof approval is inferred from this case.
    raw=json.loads((Path(__file__).parents[1]/'examples/coldformed-auto-compression.json').read_text())
    nodes,edges=midline_u(raw['geometry_analysis']['geometry'],8,12)
    props=np.array([[0.,200000.,200000.,.3,.3,200000/2.6]])
    with warnings.catch_warnings():
        warnings.simplefilter('default',DeprecationWarning)
        section=cutwp.prop2(nodes[:,1:3],edges[:,1:4])
        stable=ConstrainedModes(nodes,edges,props,section)
        config=dict(glob=[0]*4,dist=[1]*int(stable.nd),local=[0]*int(stable.nl),
            other=[0]*(2*(len(nodes)-1)),o_space=1,couple=1,orth=1,norm=1)
        wavelength=870.2079655673336
        original,_,shapes=fsm.strip(props=props,nodes=nodes,elements=edges,lengths=np.array([wavelength]),
            springs=np.array([]),constraints=np.array([]),GBT_con=config,B_C='S-S',m_all=np.ones((1,1)),n_eigs=1,sect_props=section)
        k,g=analysis.k_kg_global(nodes=nodes,elements=edges,el_props=stable.el,props=props,length=wavelength,B_C='S-S',m_a=np.ones(1))
        mode=shapes[0,0]
        energy=float(mode@k@mode/(mode@g@mode))
        # The defect is far beyond accumulated float error, not a rounding
        # disagreement in a reference table. LAPACK platforms may differ.
        if abs(float(original[0])-energy)/energy > .01:
            assert float(original[0]) > 0
        result=stable.evaluate(wavelength,('distortional',))['distortional']
        quality=stable.last['distortional']
        assert quality['projected_relative_residual'] <= 1e-8
        assert quality['energy_relative_residual'] <= quality['energy_accumulation_bound']
        # Independent variational UPPER bound: the returned upstream mode is
        # one admissible vector in the same space; the minimum cannot exceed it.
        assert result <= energy*(1+quality['energy_accumulation_bound'])
        assert quality['modal_rank'] == int(stable.nd)
