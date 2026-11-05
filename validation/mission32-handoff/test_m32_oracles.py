"""M32 independent analytical oracles; no solver, NumPy or PyNite dependency.

WARNING: formula-level references, NOT a comparison of executable engines or
normative verification of real-world roof structures.

Run: python -m unittest -v test_m32_oracles.py
     python test_m32_oracles.py --json
"""
from __future__ import annotations

import json
import math
import sys
import unittest
from fractions import Fraction as F


def identity(n: int):
    return [[F(i == j) for j in range(n)] for i in range(n)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def matvec(a, x):
    return [dot(row, x) for row in a]


def energy(a, x):
    return dot(x, matvec(a, x))


def axial_element_global(elastic_axial: F, axial_force: F, length: F, direction):
    """3D truss K_e + K_g in global translational DOFs [u_i(3), u_j(3)].

    elastic_axial is EA/L, axial_force signed: tension > 0, compression < 0.
    The reference is the Hessian of axial and pre-stress strain energies.
    """
    if len(direction) != 3 or dot(direction, direction) != 1 or length <= 0:
        raise ValueError("unit member direction and positive length required")
    a = [[elastic_axial * direction[i] * direction[j] for j in range(3)] for i in range(3)]
    g = [[(axial_force / length) * (F(i == j) - direction[i] * direction[j])
          for j in range(3)] for i in range(3)]
    return [[(a[i % 3][j % 3] + g[i % 3][j % 3]) *
             (1 if (i < 3) == (j < 3) else -1) for j in range(6)] for i in range(6)]


def geometric_only(force: F, length: F, direction):
    return axial_element_global(F(0), force, length, direction)


def old_full_dof_residual_ratio(tangent_times_u, applied, residual, free):
    """Replicates the denominator issue in PR #41, for illustration only.

    WARNING: this function does NOT invoke frame_pdelta.py.
    """
    numerator = math.sqrt(sum(float(residual[i])**2 for i in free))
    denominator = max(math.sqrt(sum(float(v)**2 for v in tangent_times_u)),
                      math.sqrt(sum(float(v)**2 for v in applied)), 1e-30)
    return numerator / denominator


def reduced_dof_residual_ratio(tangent_times_u, applied, residual, free):
    """Reference ratio: numerator and denominator on identical free DOFs.

    Full production implementation must also scale force vs moment DOFs,
    handle floating-point accumulation and check nodal/global equilibrium.
    """
    numerator = math.sqrt(sum(float(residual[i])**2 for i in free))
    denominator = max(math.sqrt(sum(float(tangent_times_u[i])**2 for i in free)),
                      math.sqrt(sum(float(applied[i])**2 for i in free)), 1e-30)
    return numerator / denominator


def tip_displacement_surrogate(compression_fraction: F):
    """One-lateral-DOF model, NOT a beam-column or a commercial roof.

    K_e = 3EI/L^3; Kg = -P/L.  E=200 GPa, I=8e-6m4, L=4m, F=100N.
    """
    E = F(200_000_000_000)
    I = F(8, 1_000_000)
    L = F(4)
    force = F(100)
    k_frame = 3 * E * I / (L**3)
    p_critical = k_frame * L
    p = compression_fraction * p_critical
    tangent = k_frame - p/L
    if tangent <= 0:
        raise ValueError("nonpositive tangent, outside stable surrogate")
    return {"compression_fraction":float(compression_fraction),
            "axial_load_n":float(p),"k_frame_n_per_m":float(k_frame),
            "kg_n_per_m":float(-p/L),"deflection_m":float(force/tangent),
            "amplification":float(k_frame/tangent)}


class MixedStabilityReferenceTests(unittest.TestCase):
    def test_full_truss_symmetric_and_global_end_force_balance(self):
        d = [F(3, 5), F(4, 5), F(0)]
        k = axial_element_global(F(23), F(-17), F(7, 2), d)
        self.assertEqual(k, [list(row) for row in zip(*k)])
        f = matvec(k, [F(1), F(2), F(3), F(-4), F(5), F(6)])
        self.assertEqual(f[:3], [-v for v in f[3:]])

    def test_geometric_energy_and_sign_of_axial_truss(self):
        d = [F(3, 5), F(4, 5), F(0)]
        x = [F(0), F(0), F(0), F(4), F(-3), F(0)]
        self.assertEqual(dot(x[3:], d), 0)
        for p in (F(-30_000), F(0), F(12_000)):
            kg = geometric_only(p, F(5), d)
            self.assertEqual(energy(kg, x), p/F(5) * F(25))

    def test_rigid_translation_and_axial_extension_do_not_change_geometric_energy(self):
        d = [F(0), F(0), F(1)]
        kg = geometric_only(F(-500), F(4), d)
        self.assertEqual(matvec(kg, [F(2),F(-3),F(7)]*2), [F(0)]*6)
        self.assertEqual(matvec(kg, [F(0),F(0),F(0),*d]), [F(0)]*6)

    def test_reversing_member_order_keeps_physical_energy(self):
        d = [F(3,5), F(4,5), F(0)]
        p, l = F(-80), F(3)
        ki = geometric_only(p, l, d)
        kj = geometric_only(p, l, [-v for v in d])
        ui, uj = [F(5),F(-2),F(3)], [F(0),F(8),F(-1)]
        self.assertEqual(energy(ki, ui+uj), energy(kj, uj+ui))

    def test_90deg_rotation_preserves_geometric_energy(self):
        p,l = F(-15_000), F(3)
        d = [F(3,5), F(4,5), F(0)]
        rotated_d = [-d[1], d[0], d[2]]
        a, b = [F(1),F(2),F(3)], [F(-7),F(0),F(9)]
        rotate = lambda v:[-v[1],v[0],v[2]]
        self.assertEqual(energy(geometric_only(p,l,d), a+b),
                         energy(geometric_only(p,l,rotated_d), rotate(a)+rotate(b)))

    def test_compression_tangent_limit_in_one_dof_surrogate(self):
        for ratio in (F(0), F(1,5), F(1,2), F(4,5), F(19,20)):
            out=tip_displacement_surrogate(ratio)
            self.assertAlmostEqual(out["amplification"], float(1/(1-ratio)))
        with self.assertRaisesRegex(ValueError, "nonpositive tangent"):
            tip_displacement_surrogate(F(1))

    def test_pr41_free_dof_residual_can_be_masked_by_supported_load(self):
        # DOF 0 is supported (displacement=0), external supported load is huge.
        # DOF 1 is free and deliberately UNSATISFIED by 1N.
        # K=I, u=(0,1), P=(1e12,0) -> residual=(-1e12,1).
        ku, loads, residual, free = [0,1], [10**12,0], [-10**12,1], [1]
        old=old_full_dof_residual_ratio(ku, loads, residual, free)
        corrected=reduced_dof_residual_ratio(ku, loads, residual, free)
        self.assertLess(old, 1e-8)  # FALSE PASS by old normalizer.
        self.assertEqual(corrected, 1.)  # Corrected ratio REJECTS.
        self.assertGreater(corrected, 1e-8)

    def test_free_residual_scaling_when_only_free_load_exists(self):
        ku, loads, residual, free=[0.,100.0000001], [0.,100.], [0.,1e-7], [1]
        old=old_full_dof_residual_ratio(ku,loads,residual,free)
        new=reduced_dof_residual_ratio(ku,loads,residual,free)
        self.assertAlmostEqual(old,new,places=15)
        self.assertLess(new,1e-8)


def summary():
    return {"schema":"jpn.m32-handoff-oracles/1",
            "scope":"Pure analytic/synthetic controls, no PyNite, Frame3DD or Stabileo execution",
            "cases":"8 unittest methods including a masked free-DOF residual counterexample",
            "pdelta_residual_mask_example":{
                "supported_dof_applied_load_n":1_000_000_000_000,
                "free_dof_unbalanced_n":1,
                "old_full_system_denominator_ratio":1e-12,
                "reduced_free_dof_denominator_ratio":1},
            "surrogate":[tip_displacement_surrogate(F(0)),tip_displacement_surrogate(F(1,2)),
                         tip_displacement_surrogate(F(4,5)),tip_displacement_surrogate(F(19,20))],
            "normative_approval":False,"integrated_solver_validation":False}


if __name__ == '__main__':
    if '--json' in sys.argv:
        result=unittest.TextTestRunner(stream=sys.stderr,verbosity=1).run(
            unittest.defaultTestLoader.loadTestsFromTestCase(MixedStabilityReferenceTests))
        if not result.wasSuccessful():
            sys.exit(1)
        print(json.dumps(summary(),indent=2,ensure_ascii=False))
    else:
        unittest.main()
