import numpy as np
import pytest
from scipy.spatial.transform import Rotation
from .pilot import energy,solver,trial_assemble
from .dual import variables
from jpn_structural.spatial_corotational import element_response,left_jacobian

X=np.array([[0.,0.,0.],[2.,0.,0.]])
PARAM=(2e8,2e4,1e4,8e3,np.eye(3))

@pytest.mark.parametrize('seed',range(8))
def test_gradient_tangent_and_physical_balance(seed):
    q=np.random.default_rng(seed).normal(size=12)*.0001
    e,_=energy.energy_state(X,variables(q),*PARAM)
    r=element_response(X,q,*PARAM)
    np.testing.assert_allclose(e.g,r['force'],rtol=1e-12,atol=1e-8)
    assert abs(e.v-r['energy'])<1e-12
    direction=np.random.default_rng(seed+100).normal(size=12);direction/=np.linalg.norm(direction)
    h=1e-6
    plus=energy.energy_state(X,variables(q+h*direction),*PARAM)[0]
    minus=energy.energy_state(X,variables(q-h*direction),*PARAM)[0]
    np.testing.assert_allclose((plus.g-minus.g)/(2*h),r['tangent']@direction,rtol=1e-6,atol=1e-4)
    assert abs((plus.v-minus.v)/(2*h)-e.g@direction)<1e-4
    f=r['physical_end_actions'];y=X+q.reshape(2,6)[:,:3]
    np.testing.assert_allclose(f[:3]+f[6:9],0,atol=1e-7)
    np.testing.assert_allclose(f[3:6]+f[9:12]+np.cross(y[0],f[:3])+np.cross(y[1],f[6:9]),0,atol=1e-7)
    for start in (0,6):
        np.testing.assert_allclose(left_jacobian(q[start+3:start+6]).T@f[start+3:start+6],e.g[start+3:start+6],atol=1e-8)

def test_finite_rigid_motion_objectivity():
    r=np.array([.2,-.1,.15]);R=Rotation.from_rotvec(r).as_matrix();q=np.zeros((2,6))
    q[:,:3]=X@R.T-X+np.array([1.,2.,3.]);q[:,3:]=r
    e,_=energy.energy_state(X,variables(q.ravel()),*PARAM)
    assert abs(e.v)<1e-18
    assert np.max(abs(e.g))<1e-7

def test_analytical_extension_and_torsion():
    q=np.zeros(12);q[6]=.001;q[9]=.01
    e,_=energy.energy_state(X,variables(q),*PARAM)
    assert abs(e.v-(.5*PARAM[0]/2*.001**2+.5*PARAM[3]/2*.01**2))<1e-9
    assert abs(e.g[9]-PARAM[3]/2*.01)<1e-9

def test_tangent_detects_loss_of_stability_without_relaxing_gate():
    # Same geometric energy, fixed first node; compression makes bending
    # eigenvalues negative. A converged residual cannot certify stability.
    values=[]
    for compression in (0.,.001):
        q=np.zeros(12);q[6]=-compression
        k=element_response(X,q,*PARAM)['tangent'][6:,6:]
        values.append(float(np.linalg.eigvalsh(k)[0]))
    assert values[0]>0 and values[1]<0
