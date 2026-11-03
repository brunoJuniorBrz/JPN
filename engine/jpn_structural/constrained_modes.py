"""Stable Rayleigh-Ritz evaluation of pyCUFSM's OWN constrained mode spaces.

No finite-strip stiffness or modal kinematics are reimplemented. The pinned
library supplies both matrices and bases. SVD changes coordinates of the
FULL modal span (no physical mode is discarded); scipy solves the symmetric
inverse problem Kg*q = mu*K*q, so singular/near-null Kg does not masquerade
as the positive-definite metric. Elastic diagonal equilibration is explicit.
"""
import math

import numpy as np
from scipy.linalg import eigh, svd

from .frame3d_model import fail


def constrained_eigenpair(elastic, geometric, basis):
    """Return the lowest positive critical factor, full mode, and diagnostics."""
    if not all(np.isfinite(a).all() for a in (elastic, geometric, basis)):
        fail('NUMERICAL_FAILURE', 'Nonfinite finite-strip matrix or basis.')
    for matrix in (elastic, geometric):
        if np.linalg.norm(matrix-matrix.T) > 128*len(matrix)*np.finfo(float).eps*max(np.linalg.norm(matrix), 1e-300):
            fail('NUMERICAL_FAILURE', 'Non-symmetric finite-strip energy matrix.')
    q, singular, _ = svd(basis, full_matrices=False)
    if not len(singular) or singular[-1] <= max(basis.shape)*np.finfo(float).eps*singular[0]:
        fail('MODAL_BASIS_RANK_DEFICIENT', 'The complete declared modal space cannot be resolved; no physical modes removed.')
    k = q.T @ elastic @ q
    g = q.T @ geometric @ q
    k, g = (k+k.T)/2, (g+g.T)/2
    diagonal = np.diag(k)
    if np.any(diagonal <= 0):
        fail('UNSTABLE', 'Modal elastic energy is nonpositive.')
    scale = np.sqrt(diagonal)
    ks, gs = k/scale[:, None]/scale[None, :], g/scale[:, None]/scale[None, :]
    spectrum = eigh(ks, eigvals_only=True)
    if spectrum[0] <= 10*len(spectrum)*np.finfo(float).eps*spectrum[-1]:
        fail('ILL_CONDITIONED', 'Modal elastic metric is singular or unresolved.')
    condition = float(spectrum[-1]/spectrum[0])
    if condition > 1e10:
        fail('ILL_CONDITIONED', 'Modal elastic conditioning exceeds the existing numerical domain.')
    inverse, vectors = eigh(gs, ks, subset_by_index=[len(k)-1, len(k)-1])
    if not math.isfinite(float(inverse[0])) or inverse[0] <= 0:
        fail('NUMERICAL_FAILURE', 'No positive compressive geometric-energy eigenvalue.')
    critical = 1/float(inverse[0])
    projected = vectors[:, 0]/scale
    mode = q @ projected
    ku, gu = k @ projected, g @ projected
    residual = float(np.linalg.norm(ku-critical*gu)/max(np.linalg.norm(ku)+critical*np.linalg.norm(gu), 1e-300))
    if residual > 1e-8:
        fail('NUMERICAL_FAILURE', 'Projected eigenpair residual exceeds 1e-8.')
    energy_k, energy_g = float(mode @ elastic @ mode), float(mode @ geometric @ mode)
    if min(energy_k, energy_g) <= 0:
        fail('NUMERICAL_FAILURE', 'Reconstructed physical mode has nonpositive energy.')
    energy_residual = abs(energy_k-critical*energy_g)/(abs(energy_k)+critical*abs(energy_g))
    # Dot-product accumulation bound, derived from matrix dimension and machine
    # epsilon, not an adjustable engineering percentage. Report it separately
    # from the projected backward residual and from mesh convergence.
    operations = 8*len(mode)
    gamma = operations*np.finfo(float).eps/(1-operations*np.finfo(float).eps)
    absolute_mode = np.abs(mode)
    roundoff = gamma*float(absolute_mode @ np.abs(elastic) @ absolute_mode
                          + critical*(absolute_mode @ np.abs(geometric) @ absolute_mode))
    energy_bound = roundoff/(abs(energy_k)+critical*abs(energy_g))
    if energy_residual > max(128*np.finfo(float).eps, energy_bound):
        fail('NUMERICAL_FAILURE', 'Eigenvalue contradicts reconstructed modal energy beyond its floating-point accumulation bound.')
    return critical, mode, dict(projected_relative_residual=residual,
        energy_relative_residual=energy_residual, energy_accumulation_bound=energy_bound,
        scaled_elastic_condition=condition, basis_condition=float(singular[0]/singular[-1]),
        modal_rank=len(singular))


class ConstrainedModes:
    """Version-pinned native matrices and natural cFSM spaces, S-S, m=1."""
    def __init__(self, nodes, edges, props, section):
        from pycufsm.solve import cfsm
        from pycufsm.solve.analysis import analysis
        self.nodes, self.edges, self.props = nodes, edges, props
        self.cf, self.analysis = cfsm, analysis
        self.el = analysis.elem_prop(nodes=nodes, elements=edges)
        main, meta, self.node_props, self.nm, self.nc, self.ns, self.nd, self.nl, self.permutation = cfsm.base_properties(nodes=nodes, elements=edges)
        self.rx, self.rz, ryd, self.rys, rud = cfsm.mode_constr(nodes=nodes, elements=edges,
            node_props=self.node_props, main_nodes=main, meta_elements=meta)
        self.dy, self.ng = cfsm.y_dofs(nodes=nodes, elements=edges, main_nodes=main,
            n_main_nodes=self.nm, n_dist_modes=self.nd, r_yd=ryd, r_ud=rud,
            sect_props=section, el_props=self.el)
        self.maximum = {key: 0. for key in ('projected_relative_residual', 'energy_relative_residual',
            'energy_accumulation_bound', 'scaled_elastic_condition', 'basis_condition')}
        self.last = {}

    def evaluate(self, length, families=('local', 'distortional')):
        cf, analysis = self.cf, self.analysis
        waves = np.ones(1)
        natural = cf.base_column(nodes_base=self.nodes, elements=self.edges, props=self.props,
            length=length, B_C='S-S', m_a=waves, el_props=self.el, node_props=self.node_props,
            n_main_nodes=self.nm, n_corner_nodes=self.nc, n_sub_nodes=self.ns,
            n_global_modes=self.ng, n_dist_modes=self.nd, n_local_modes=self.nl,
            dof_perm=self.permutation, r_x=self.rx, r_z=self.rz, r_ys=self.rys, d_y=self.dy)
        elastic, geometric = analysis.k_kg_global(nodes=self.nodes, elements=self.edges,
            el_props=self.el, props=self.props, length=length, B_C='S-S', m_a=waves)
        # In pinned pyCUFSM 0.2.0 base_update uses only these four numerical
        # settings; modal selection is a separate operation. Normalize the
        # common complete basis once per wavelength, preserving both spaces.
        common = dict(glob=[0]*4, dist=[1]*int(self.nd), local=[1]*int(self.nl),
            other=[0]*(2*(len(self.nodes)-1)), o_space=1, couple=1, orth=1, norm=1)
        basis = cf.base_update(GBT_con=common, b_v_l=natural, length=length,
            m_a=waves, nodes=self.nodes, elements=self.edges, props=self.props,
            n_global_modes=self.ng, n_dist_modes=self.nd, n_local_modes=self.nl,
            B_C='S-S', el_props=self.el)
        output = {}
        for family in families:
            if family not in ('local', 'distortional'):
                fail('UNSUPPORTED_MODEL', 'Only separate local/distortional compression spaces.')
            config = dict(glob=[0]*4, dist=[int(family=='distortional')]*int(self.nd),
                local=[int(family=='local')]*int(self.nl), other=[0]*(2*(len(self.nodes)-1)),
                o_space=1, couple=1, orth=1, norm=1)
            selected = cf.mode_select(b_v=basis, n_global_modes=self.ng, n_dist_modes=self.nd,
                n_local_modes=self.nl, GBT_con=config, n_dof_m=4*len(self.nodes), m_a=waves)
            critical, _, diagnostic = constrained_eigenpair(elastic, geometric, selected)
            self.last[family] = diagnostic
            for key in self.maximum:
                self.maximum[key] = max(self.maximum[key], diagnostic[key])
            output[family] = critical
        return output
