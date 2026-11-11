"""Direct full-3D Hessian study of a physically compressed, straight column.

Not an accepted solution beyond the pilot margin. Euler reference is for
this declared fixed-free uniform synthetic column only; not an inferred K.
"""
import numpy as np
from scipy.linalg import eigh
from jpn_structural.spatial_corotational import element_response


def study():
    e, area, iy, iz, gj, length = 200e9, .02, 6e-5, 2e-5, 200e9/2.6*2e-5, 4.
    pcr = np.pi**2*e*iz/(4*length**2)
    basis = np.array([[0., 0., 1.], [0., 1., 0.], [-1., 0., 0.]])
    cases = []
    for count in (4, 8, 16):
        size = 6*(count+1)
        free = np.arange(6, size)
        def matrix(compression):
            q = np.zeros(size)
            q[2::6] = -compression*np.linspace(0., length, count+1)/(e*area)
            k, forces = np.zeros((size, size)), np.zeros(size)
            for i in range(count):
                indices = np.arange(6*i, 6*i+12)
                x = np.array([[0., 0., length*i/count], [0., 0., length*(i+1)/count]])
                row = element_response(x, q[indices], e*area, e*iy, e*iz, gj, basis)
                k[np.ix_(indices, indices)] += row["tangent"]
                forces[indices] += row["force"]
            load = np.zeros(size)
            load[-4] = -compression
            residual = max(abs((forces-load)[free]))/max(1., compression)
            return k[np.ix_(free, free)], residual
        initial, _ = matrix(0.)
        for ratio in (.5, .95, 1.01):
            tangent, residual = matrix(ratio*pcr)
            diagonal = np.sqrt(np.diag(initial))
            a = tangent/diagonal[:, None]/diagonal[None, :]
            b = initial/diagonal[:, None]/diagonal[None, :]
            ev, vectors = eigh(a, b, subset_by_index=(0, 0))
            mode = np.zeros(size)
            mode[free] = vectors[:, 0]/diagonal
            mode /= max(abs(mode))
            m = mode.reshape(-1, 6)
            eig_res = np.linalg.norm(a@vectors[:, 0]-ev[0]*b@vectors[:, 0])/max(1., np.linalg.norm(a)*np.linalg.norm(vectors[:, 0]))
            cases.append(dict(subdivisions=count, compression_ratio_of_declared_weak_axis_euler=float(ratio),
                              euler_weak_axis_pcr_n=float(pcr), minimum_generalized_eigenvalue=float(ev[0]),
                              positive_definite=bool(ev[0] > 0), force_equilibrium_relative_residual=float(residual),
                              eigenpair_relative_residual=float(eig_res),
                              maximum_mode_translation_xyz=np.max(abs(m[:, :3]), axis=0).tolist(),
                              maximum_mode_rotation_xyz=np.max(abs(m[:, 3:]), axis=0).tolist(),
                              mode=mode.tolist(), outside_pilot_domain=True, production_enabled=False,
                              torsional_warping_stability_verified=False))
    return cases
