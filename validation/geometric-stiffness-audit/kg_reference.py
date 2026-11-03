"""Reproducible reference checks of element geometric-stiffness formulas.

Pure Python standard library; no production solver imported or modified.
Mathematical equivalence, NOT execution of Stabileo/Frame3DD/PyNite kernels.
Units are consistent N,m,Pa in the synthetic exercises, except kN noted.
"""
from __future__ import annotations

from fractions import Fraction as Q
import json
import math
import sys
import unittest


def matmul(a, b):
    return [[sum(x*y for x, y in zip(row, col)) for col in zip(*b)] for row in a]


def transpose(a):
    return [list(c) for c in zip(*a)]


def mv(a, v):
    return [sum(x*y for x, y in zip(row, v)) for row in a]


def energy(a, v):
    return sum(x*y for x, y in zip(v, mv(a, v)))


def hermite_energy_matrix(p: Q, length: Q):
    """Independent exact integration: P int_0^L N'(x)^T N'(x) dx."""
    deriv = [[Q(0), -6/length, 6/length],
             [Q(1), Q(-4), Q(3)],
             [Q(0), 6/length, -6/length],
             [Q(0), Q(-2), Q(3)]]
    k = []
    for a in deriv:
        row = []
        for b in deriv:
            integral = sum(a[i]*b[j]/Q(i+j+1) for i in range(3) for j in range(3))
            row.append(p*length*integral)
        k.append(row)
    return k


def stabileo_bending_formula(p: Q, length: Q):
    l = length
    table = [[36, 3*l, -36, 3*l],
             [3*l, 4*l*l, -3*l, -l*l],
             [-36, -3*l, 36, -3*l],
             [3*l, -l*l, -3*l, 4*l*l]]
    return [[p*x/(30*l) for x in row] for row in table]


def frame3dd_shearless_bending_formula(p: Q, length: Q):
    """Independent transcription of geometric_K bending entries, shear=0."""
    a, b, c, d = 6*p/(5*length), p/10, 2*p*length/15, -p*length/30
    return [[a,b,-a,b], [b,c,-b,d], [-a,-b,a,-b], [b,d,-b,c]]


def truss_kg(p: Q, length: Q, e):
    """P/L times transverse projector in 3D, 6 translational DOFs."""
    g = [[Q(int(i==j))-e[i]*e[j] for j in range(3)] for i in range(3)]
    return [[(p/length) * g[i%3][j%3] * (1 if (i<3)==(j<3) else -1)
             for j in range(6)] for i in range(6)]


def condensed_double_release(k, length: Q):
    """Both hinges: rotations equal the straight chord slope."""
    transform = [[Q(1),Q(0)],[-1/length,1/length],
                 [Q(0),Q(1)],[-1/length,1/length]]
    return matmul(transpose(transform), matmul(k, transform))


def torsional_coefficient_comparison(p: float, length: float, area: float,
                                     iy: float, iz: float, j: float,
                                     y0: float, z0: float):
    r0_sq = (iy+iz)/area + y0*y0 + z0*z0
    frame3dd = p*j/(area*length)
    stabileo = p*r0_sq/length
    return dict(r0_squared_m2=r0_sq, j_over_a_m2=j/area,
                stabileo_wagner_coefficient=stabileo,
                frame3dd_torsion_coefficient=frame3dd,
                magnitude_ratio=abs(stabileo/frame3dd))


def mixed_one_dof(p_ratio: float):
    """ILLUSTRATION ONLY. 1 lateral spring + 1 compressive truss, not a roof."""
    e, i, l, f = 200e9, 8e-6, 4.0, 100.0
    k_elastic = 3*e*i/l**3
    pcr = k_elastic*l  # 3EI/L^2 for the selected 1-DOF surrogate
    p = p_ratio*pcr
    kgeometric = -p/l
    return dict(p_over_pcr=p_ratio, p_n=p,
                k_elastic_n_per_m=k_elastic,
                k_geometric_n_per_m=kgeometric,
                displacement_mm=1000*f/(k_elastic+kgeometric),
                first_order_mm=1000*f/k_elastic,
                amplification=1/(1-p_ratio))


class ReferenceChecks(unittest.TestCase):
    def test_bending_exact_integration_and_source_formula_agree(self):
        for p in (Q(-120000), Q(0), Q(12500)):
            for l in (Q(3,2), Q(5,4), Q(4)):
                integrated = hermite_energy_matrix(p, l)
                self.assertEqual(integrated, stabileo_bending_formula(p, l))
                self.assertEqual(integrated, frame3dd_shearless_bending_formula(p, l))
                self.assertEqual(integrated, transpose(integrated))
                self.assertEqual(mv(integrated, [1,0,1,0]), [0]*4)

    def test_energy_and_sign_of_bending_geometric_stiffness(self):
        l=Q(4)
        # Rigid rotation of a straight member: slope = angle throughout.
        q=[Q(0),Q(1,50),l/Q(50),Q(1,50)]
        for p in (Q(-40000),Q(40000)):
            self.assertEqual(energy(hermite_energy_matrix(p,l),q),p*l/Q(2500))

    def test_two_end_release_transverse_limit(self):
        p,l=Q(-30000),Q(4)
        got=condensed_double_release(stabileo_bending_formula(p,l),l)
        self.assertEqual(got,[[p/l,-p/l],[-p/l,p/l]])

    def test_truss_projector_rigid_motion_axial_motion_and_sign(self):
        e=[Q(1,3),Q(2,3),Q(2,3)]
        l=Q(5)
        for p in (Q(-20000),Q(20000)):
            k=truss_kg(p,l,e)
            self.assertEqual(k,transpose(k))
            self.assertEqual(mv(k,[1,2,3,1,2,3]),[0]*6)
            self.assertEqual(mv(k,[0,0,0,*e]),[0]*6)
            # A relative displacement normal to the bar stores P/L times its length squared.
            v=[Q(0)]*3+[Q(2),Q(-1),Q(0)]
            self.assertEqual(sum(e[i]*v[3+i] for i in range(3)),0)
            self.assertEqual(energy(k,v),p/l*5)

    def test_torsional_coefficients_differ_in_source_implementations(self):
        value=torsional_coefficient_comparison(-120000,4,.004,8e-6,2e-6,5e-8,.04,0)
        self.assertAlmostEqual(value['r0_squared_m2'], .0041)
        self.assertAlmostEqual(value['j_over_a_m2'], 1.25e-5)
        self.assertAlmostEqual(value['magnitude_ratio'],328)

    def test_mixed_one_dof_shows_omitted_geometric_stiffness_matters(self):
        for ratio in (0, .2,.5,.8,.95):
            case=mixed_one_dof(ratio)
            self.assertAlmostEqual(case['displacement_mm']/case['first_order_mm'],case['amplification'])
            self.assertGreater(case['k_elastic_n_per_m']+case['k_geometric_n_per_m'],0)
        self.assertEqual(mixed_one_dof(0)['amplification'],1)


def report():
    ratio=torsional_coefficient_comparison(-120000,4,.004,8e-6,2e-6,5e-8,.04,0)
    return {
        'study':'JPN theoretical geometric-stiffness crosscheck / independent formula transcription',
        'scope':'Source-based formulas, exact Hermite integration, 3D truss projector, synthetic 1-DOF. No upstream executable compared.',
        'bending_exact_agreement_cases':9,
        'synthetic_torsion':ratio,
        'mixed_one_dof':[mixed_one_dof(x) for x in (0,.2,.5,.8,.95)],
        'normative_approval':False,
        'full_3d_solver_validation':False,
    }


if __name__=='__main__':
    if '--json' in sys.argv:
        suite=unittest.defaultTestLoader.loadTestsFromTestCase(ReferenceChecks)
        result=unittest.TextTestRunner(stream=sys.stderr,verbosity=1).run(suite)
        if not result.wasSuccessful():sys.exit(1)
        print(json.dumps(report(),indent=2,ensure_ascii=False))
    else:
        unittest.main()
