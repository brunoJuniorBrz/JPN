"""Mission 16: actual PyNite 3.2.1 bases and independent isotropic cantilever."""
import numpy as np
import pytest
from jpn_structural.frame3d import analyze_frame3d
from jpn_structural.model import AnalysisError
from .test_frame3d import beam


@pytest.mark.parametrize('axis,offset_axis', [(0, 'y_m'), (1, 'x_m')])
def test_invalid_native_frame_basis_rejected_before_solving(axis, offset_axis):
    p = beam(axis)
    p['nodes'][1][offset_axis] = 1e-8
    p['sections'][0].update(iy_m4=1e-5, iz_m4=1e-5, j_m4=2e-5)
    p['nodal_loads'][0].update(fx_n=100., fy_n=200., fz_n=-1000.)
    result = analyze_frame3d(p)['combinations']['TESTE-1']
    r = np.array([p['nodes'][1][k] for k in ('x_m', 'y_m', 'z_m')]); length = np.linalg.norm(r); d = r / length
    force = np.array([100., 200., -1000.]); parallel = (force @ d) * d
    expected_u = parallel * length / (200e9 * .01) + (force - parallel) * length**3 / (3 * 200e9 * 1e-5)
    expected_rotation = np.cross(d, force) * length**2 / (2 * 200e9 * 1e-5)
    np.testing.assert_allclose(result['nodes']['B']['translation_m'], expected_u, rtol=1e-8, atol=1e-13)
    np.testing.assert_allclose(result['nodes']['B']['rotation_rad'], expected_rotation, rtol=1e-8, atol=1e-13)
    np.testing.assert_allclose(result['nodes']['A']['force_n'], -force, rtol=1e-8, atol=1e-8)
    np.testing.assert_allclose(result['nodes']['A']['moment_nm'], -np.cross(r, force), rtol=1e-8, atol=1e-8)
    for n in p['nodes']: n[offset_axis] += 9000.
    with pytest.raises(AnalysisError) as exc: analyze_frame3d(p)
    assert exc.value.code == 'INVALID_GEOMETRY'
