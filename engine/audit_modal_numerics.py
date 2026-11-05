"""Reproduce upstream scalar/mode-energy inconsistency and guarded evaluation.

Requires the isolated sections-fsm profile. Numerical values depend on LAPACK;
an external independent roof or normative classification is not claimed.
"""
import argparse
from importlib.metadata import version
import json
from pathlib import Path
import sys
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parent))


def run(raw):
    import numpy as np
    from pycufsm import fsm
    from pycufsm.pre import cutwp
    from pycufsm.solve.analysis import analysis
    from jpn_structural.constrained_modes import ConstrainedModes
    from jpn_structural.frame3d_model import input_hash
    from jpn_structural.member_buckling import midline_u
    nodes, edges = midline_u(raw['geometry_analysis']['geometry'], 8, 12)
    E, nu = raw['design']['section']['e_pa']/1e6, raw['geometry_analysis']['poisson']
    props = np.array([[0., E, E, nu, nu, E/(2*(1+nu))]])
    rows = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('default', DeprecationWarning)
        section = cutwp.prop2(nodes[:, 1:3], edges[:, 1:4])
        guarded = ConstrainedModes(nodes, edges, props, section)
        config = dict(glob=[0]*4, dist=[1]*int(guarded.nd), local=[0]*int(guarded.nl),
            other=[0]*(2*(len(nodes)-1)), o_space=1, couple=1, orth=1, norm=1)
        for length in (125., 870.2079655673336, 870.208, 1000.):
            signature, _, shapes = fsm.strip(props=props, nodes=nodes, elements=edges,
                lengths=np.array([length]), springs=np.array([]), constraints=np.array([]),
                GBT_con=config, B_C='S-S', m_all=np.ones((1,1)), n_eigs=1, sect_props=section)
            elastic, geometric = analysis.k_kg_global(nodes=nodes, elements=edges,
                el_props=guarded.el, props=props, length=length, B_C='S-S', m_a=np.ones(1))
            mode = shapes[0,0]
            energy_factor = float(mode @ elastic @ mode/(mode @ geometric @ mode))
            value = guarded.evaluate(length, ('distortional',))['distortional']
            rows.append(dict(half_wavelength_mm=length, upstream_stress_mpa=float(signature[0]),
                upstream_mode_rayleigh_mpa=energy_factor,
                upstream_relative_difference=abs(float(signature[0])-energy_factor)/energy_factor,
                guarded_stress_mpa=value, numerical_audit=guarded.last['distortional']))
        for warning in caught:
            if not issubclass(warning.category, DeprecationWarning) or 'Conversion of an array with ndim > 0 to a scalar' not in str(warning.message):
                raise ValueError('Unrecognized library warning: '+str(warning.message))
    return dict(schema_version='jpn.modal-numerics-audit/1', input_sha256=input_hash(raw),
        dependencies={name:version(name) for name in ('numpy','scipy','pycufsm')}, results=rows,
        verification='independent energy identity and projected residual; not a complete external classification benchmark',
        approved_for_fabrication=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    from local_mixed_worker import memory_limit
    memory_limit()
    result = run(json.loads(args.input.read_text(encoding='utf8')))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n', encoding='utf8')
    print(json.dumps(result, allow_nan=False))
