"""Stable Rayleigh-Ritz evaluation with CUFSM-checked modal kinematics.

The pinned library supplies finite-strip matrices and topology constraints.
M32 corrects wall normals, corner constraints and global longitudinal modes;
the original MATLAB CUFSM supplies the independent comparison. SVD uses the
FULL modal span (no physical mode is discarded); scipy solves the symmetric
inverse problem Kg*q = mu*K*q, so singular/near-null Kg does not masquerade
as the positive-definite metric. Elastic diagonal equilibration is explicit.
"""
import math

import numpy as np
from scipy.linalg import eigh, svd

from .frame3d_model import fail
from .modal_kinematics import longitudinal_modes, local_modes, corner_constraints
from .finite_strip_matrices import FiniteStripMatrices


def constrained_eigenpair(elastic, geometric, basis, *, _factorization=None):
    """Return the lowest positive critical factor, full mode, and diagnostics."""
    if not all(np.isfinite(a).all() for a in (elastic, geometric, basis)):
        fail('NUMERICAL_FAILURE', 'Nonfinite finite-strip matrix or basis.')
    for matrix in (elastic, geometric):
        if np.linalg.norm(matrix-matrix.T) > 128*len(matrix)*np.finfo(float).eps*max(np.linalg.norm(matrix), 1e-300):
            fail('NUMERICAL_FAILURE', 'Non-symmetric finite-strip energy matrix.')
    if _factorization is None:
        q, singular, _ = svd(basis, full_matrices=False)
    else:
        q,singular = _factorization
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
    """Pinned double-precision matrices and corrected natural spaces, S-S, m=1."""
    def __init__(self, nodes, edges, props, section):
        from pycufsm.solve import cfsm
        from pycufsm.solve import analysis_p as analysis
        self.nodes, self.edges, self.props = nodes, edges, props
        self.cf, self.analysis = cfsm, analysis
        self.el = analysis.elem_prop(nodes=nodes, elements=edges)
        self.matrices = FiniteStripMatrices(nodes,edges,props,self.el)
        main, meta, self.node_props, self.nm, self.nc, self.ns, self.nd, self.nl, self.permutation = cfsm.base_properties(nodes=nodes, elements=edges)
        self.rys = cfsm.constr_ys_ym(nodes,main,meta,self.node_props)
        ryd = cfsm.constr_yd_yg(nodes,edges,self.node_props,self.rys,self.nm)
        rud = cfsm.constr_yu_yd(main,meta)
        self.rx,self.rz = corner_constraints(main,meta)
        self.dy = longitudinal_modes(nodes,edges,main,ryd,rud,self.nd)
        self.ng = 4
        self.local_basis = local_modes(nodes,edges,self.node_props,self.nl)
        self.local_basis /= np.linalg.norm(self.local_basis,axis=0)
        q,singular,_ = svd(self.local_basis,full_matrices=False)
        self.local_factorization = (q,singular)
        # For S-S, m=1, the retained transverse/cross-section-rotation block
        # of Kglobal_transv is exactly proportional to wavelength: I1=L/2
        # and I2..I5=0. Its longitudinal DOFs are outside this condensation.
        # Thus -Kpp^-1 Kpc is wavelength-INDEPENDENT. Compute it once for
        # this section, without reducing any wave, mode or physical matrix.
        reference_length = float(np.ptp(nodes[:,1:3],axis=0).max())
        _,_,transverse = self.matrices.assemble(reference_length)
        transverse = self.permutation.T@transverse@self.permutation
        begin,end = self.nm+2*self.nc,4*len(nodes)-self.ns
        self.rp = -np.linalg.solve(transverse[begin:end,begin:end],transverse[begin:end,self.nm:begin])
        self.maximum = {key: 0. for key in ('projected_relative_residual', 'energy_relative_residual',
            'energy_accumulation_bound', 'scaled_elastic_condition', 'basis_condition')}
        self.last = {}

    def spaces(self, length):
        """Native matrices and complete selected bases for independent audit."""
        elastic,geometric,_ = self.matrices.assemble(length,transverse_needed=False)
        begin,end = self.nm+2*self.nc,4*len(self.nodes)-self.ns
        # Assemble EVERY selected distortional column directly, as in CUFSM
        # base_vectors. Avoid constructing the unselected global/other spaces
        # and the erroneous local columns that were immediately overwritten.
        longitudinal = self.dy[:,self.ng:self.ng+self.nd]
        natural = np.zeros((4*len(self.nodes),self.nd))
        natural[:self.nm] = longitudinal
        natural[self.nm:self.nm+self.nc] = self.rx@longitudinal
        natural[self.nm+self.nc:begin] = self.rz@longitudinal
        natural[begin:end] = self.rp@natural[self.nm:begin]
        natural[end:] = self.rys@longitudinal
        natural[self.nm:end] /= np.pi/length
        dist = self.permutation@natural
        spaces = dict(local=self.local_basis,distortional=dist/np.linalg.norm(dist,axis=0))
        return elastic, geometric, spaces

    def evaluate(self, length, families=('local', 'distortional')):
        elastic, geometric, spaces = self.spaces(length)
        output = {}
        for family in families:
            if family not in spaces:
                fail('UNSUPPORTED_MODEL', 'Only separate local/distortional compression spaces.')
            critical, _, diagnostic = constrained_eigenpair(elastic, geometric, spaces[family],
                _factorization=self.local_factorization if family=='local' else None)
            self.last[family] = diagnostic
            for key in self.maximum:
                self.maximum[key] = max(self.maximum[key], diagnostic[key])
            output[family] = critical
        return output
