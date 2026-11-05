"""Offline cFSM wavelength diagnostic; NEVER a replacement for member MRD.

Run in requirements-sections-fsm.lock with the supplied explicit Ue request.
The parent invocation must cap wall time; no HTTP/API is added.
"""
import argparse
from importlib.metadata import version
import json
from pathlib import Path
import sys
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jpn_structural.frame3d_model import input_hash
from jpn_structural.member_buckling import midline_u


def audit(raw):
    if (version('pycufsm'), version('numpy'), version('scipy')) != ('0.2.0', '2.3.3', '1.15.3'):
        raise ValueError('Use requirements-sections-fsm.lock in its isolated environment.')
    import numpy as np
    from pycufsm.pre import cutwp
    from jpn_structural.buckling_search import refine_wavelength_valleys
    from jpn_structural.constrained_modes import ConstrainedModes
    geometry = raw['geometry_analysis']['geometry']
    E, nu = raw['design']['section']['e_pa']/1e6, raw['geometry_analysis']['poisson']
    length = raw['stability_model']['length_m']*1000
    if geometry['shape'] != 'u-stiffened':
        raise ValueError('Only the explicit Ue compression diagnostic is implemented.')
    # This is the same FINE modal section mesh used in the member audit.
    nodes, edges = midline_u(geometry, 8, 12)
    material = np.array([[0., E, E, nu, nu, E/(2*(1+nu))]])
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('default', DeprecationWarning)
        section = cutwp.prop2(nodes[:, 1:3], edges[:, 1:4])
        problem = ConstrainedModes(nodes, edges, material, section)
        results = {}
        for family in ('local', 'distortional'):
            def stress(wavelength):
                return problem.evaluate(wavelength, (family,))[family]
            # Audit the continuous interval COVERED by the existing L/m search.
            # The physical finite member only admits integer m; no claim that
            # this continuous lower value is an actual finite-member eigenmode.
            grid = np.geomspace(length/64, length, 25).tolist()
            results[family] = refine_wavelength_valleys(stress, grid)
        for warning in caught:
            if not issubclass(warning.category, DeprecationWarning) or 'Conversion of an array with ndim > 0 to a scalar' not in str(warning.message):
                raise ValueError('Unrecognized cFSM warning: '+str(warning.message))
    return dict(schema_version='jpn.member-mode-search-audit/1', input_sha256=input_hash(raw),
        units='mm-MPa', fine_mesh_nodes=len(nodes), families=results,
        modal_method='constrained-subspace-Rayleigh-Ritz',
        scope='continuous wavelength diagnostic on [L/64,L]; does not alter the discrete physical-member calculation',
        numerical_audit={key:float(value) for key,value in problem.maximum.items()},
        global_minimum_certified=False, approved_for_fabrication=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    from local_mixed_worker import memory_limit
    memory_limit()
    result = audit(json.loads(args.input.read_text(encoding='utf8')))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n', encoding='utf8')
    print(json.dumps({family: value['best'] for family, value in result['families'].items()}))
