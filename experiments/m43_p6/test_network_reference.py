"""Analytical controls for the additional reference, no candidate equations."""
import importlib.util
from pathlib import Path
import numpy as np
import pytest
from scipy.spatial.transform import Rotation

spec=importlib.util.spec_from_file_location('continuous_network',Path(__file__).resolve().parents[2]/'validation/m43-p6/reference_v2/network.py')
network=importlib.util.module_from_spec(spec);spec.loader.exec_module(network)

def bar(length,load):
    return dict(nodes=[dict(id='A',x_m=0.,y_m=0.,z_m=0.),dict(id='B',x_m=length,y_m=0.,z_m=0.)],
        members=[dict(id='AB',start='A',end='B',material='M',section='S',kind='frame',rotation_deg=0.,release_start=[False]*6,release_end=[False]*6)],
        materials=[dict(id='M',e_pa=2e11,g_pa=8e10)],sections=[dict(id='S',area_m2=.001,iy_m4=1e-7,iz_m4=2e-7,j_m4=1e-7)],
        supports=[dict(node='A',restrained=[True]*6)],combinations=[dict(id='C',factors={'L':1.})],
        nodal_loads=[dict(node='B',case='L',**dict(zip(['fx_n','fy_n','fz_n','mx_nm','my_nm','mz_nm'],load)))])

@pytest.mark.parametrize('length',[1.,2.,6.])
def test_continuous_extension_and_torsion(length):
    m=bar(length,[1000.,0,0,16.,0,0]);r=network.solve(m,network.benchmark_bases(m),1e-10)
    n=r['nodes']['B'];theta=16*length/8000
    np.testing.assert_allclose(n['translation_m'],[1000*length/2e8,0,0],rtol=0,atol=1e-12)
    np.testing.assert_allclose(n['orientation_matrix'],Rotation.from_rotvec([theta,0,0]).as_matrix(),rtol=0,atol=1e-12)
    assert abs(r['strain_energy_j']-(1000**2*length/(2*2e8)+16**2*length/(2*8000)))<1e-10
    assert r['physical_support_equilibrium']['accepted']

@pytest.mark.parametrize('length',[1.,2.,6.])
def test_continuous_circular_arc_under_pure_end_couple(length):
    m=bar(length,[0,0,0,0,20.,0]);r=network.solve(m,network.benchmark_bases(m),1e-10)
    k=20/2e4;theta=k*length
    expected=[np.sin(theta)/k-length,0,(np.cos(theta)-1)/k]
    np.testing.assert_allclose(r['nodes']['B']['translation_m'],expected,rtol=0,atol=1e-10)
    assert abs(r['strain_energy_j']-20**2*length/(2*2e4))<1e-10
    assert r['physical_support_equilibrium']['accepted']
