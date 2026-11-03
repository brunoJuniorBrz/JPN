"""Independent beam-column reference; NOT a mixed-JPN P-Delta approval.

Exact continuum: EI*y''''+P*y''=0, fixed root, tip transverse H and axial P.
The native cubic geometric element must converge under mesh refinement.
"""
import math
from importlib.metadata import version

import numpy as np
import pytest
from Pynite import FEModel3D
from Pynite.Spring3D import Spring3D


def cantilever(count, ratio):
    E, I, L, H = 200e9, 1e-5, 4., 100.
    P = ratio * math.pi**2 * E * I / (4*L*L)
    m = FEModel3D()
    m.add_material('M', E, E/2.6, .3, 0)
    m.add_section('S', .01, I, I, 1e-5)
    for i in range(count+1):
        m.add_node(str(i), 0, L*i/count, 0)
    for i in range(count):
        m.add_member('B'+str(i), str(i), str(i+1), 'M', 'S')
    m.def_support('0', True, True, True, True, True, True)
    m.add_node_load(str(count), 'FX', H, 'Q')
    m.add_node_load(str(count), 'FY', -P, 'Q')
    m.add_load_combo('S', {'Q': 1.})
    m.analyze_PDelta(log=False, max_iter=30, sparse=True)
    k = math.sqrt(P/(E*I))
    displacement = H/P*(math.tan(k*L)/k-L)
    rotation = -H/P*(1/math.cos(k*L)-1)
    return m, displacement, rotation, P, H, L


@pytest.mark.parametrize('ratio', [.2, .6, .85])
def test_native_frame_pdelta_mesh_converges_to_independent_continuum(ratio):
    assert version('PyNiteFEA') == '3.2.1'
    errors=[];moment_residuals=[]
    for count in (8,16,32):
        m, expected, rotation, P, H, L = cantilever(count,ratio)
        actual=m.nodes[str(count)].DX['S']
        errors.append(abs(actual-expected))
        # Dimensional discretization bound, tightened by refinement, NOT a code
        # resistance/SLS acceptance percentage or a reference chosen by software.
        assert abs(actual-expected) < abs(expected)*(ratio/count)**2
        assert abs(m.nodes[str(count)].RZ['S']-rotation) < abs(rotation)*(ratio/count)**2
        moment_residuals.append(abs(m.nodes['0'].RxnMZ['S']-H*L-P*actual))
    assert errors[2] < errors[1] < errors[0]
    assert moment_residuals[2] < moment_residuals[1] < moment_residuals[0]
    if ratio >= .6:
        # Initial audit showed that a coarse cubic mesh fails the existing
        # 1e-5 N.m balance floor. Record the failure; do not loosen this gate.
        assert moment_residuals[0] > 1e-5


def test_native_spring_has_no_geometric_stiffness_for_loaded_axial_bars():
    m=FEModel3D();m.add_node('A',0,0,0);m.add_node('B',0,4,0)
    m.add_spring('AX','A','B',200e9*.01/4)
    assert not hasattr(Spring3D,'Kg')
    assert not hasattr(Spring3D,'kg')
    # Kg loops frame members only. Missing geometric terms must not be
    # advertised as the geometric stiffness of an initial-stress truss.
    assert np.count_nonzero(m.Kg(sparse=False,first_step=False)) == 0


def test_native_pdelta_nonconvergence_is_not_a_completed_result():
    m, *_ = cantilever(8,.6)
    # Deliberately no iterations; native failure must propagate, never zeros.
    with pytest.raises(Exception):
        m.analyze_PDelta(log=False,max_iter=0,sparse=True)
