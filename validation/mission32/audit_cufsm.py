"""Real original CUFSM/Octave vs pyCUFSM/JPN, same mesh, load, BC and wave.

Use the isolated requirements-sections-fsm.lock environment. External source
is never downloaded/executed implicitly; supply the pinned checkout and CLI.
Intermediate original matrices are retained in --work-dir, outside production.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import warnings

import numpy as np
from scipy.io import loadmat, savemat
from scipy.linalg import orth

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'engine'))
from jpn_structural.constrained_modes import ConstrainedModes, constrained_eigenpair
from jpn_structural.member_buckling import midline_u
from pycufsm.pre import cutwp

SOURCE_SHA = 'ab449cef8d05bb489df591d2e5b4e74571a793f5'


def quote(path):
    return str(path).replace('\\', '/').replace("'", "''")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cufsm-source', type=Path, required=True)
    parser.add_argument('--octave', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--git', default='git')
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Reuse completed native outputs only for identical deterministic numerical inputs')
    args = parser.parse_args()
    source = args.cufsm_source.resolve(); work = args.work_dir.resolve()
    sha = subprocess.check_output([args.git, '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    assert sha == SOURCE_SHA, (sha, SOURCE_SHA)
    assert not subprocess.check_output([args.git, '-C', str(source), 'status', '--porcelain'], text=True).strip()
    from importlib.metadata import version
    versions = {k: version(k) for k in ['numpy','scipy','pycufsm','sectionproperties']}
    assert list(versions.values()) == ['2.3.3','1.15.3','0.2.0','3.10.2'], versions
    work.mkdir(parents=True, exist_ok=True); args.output.parent.mkdir(parents=True, exist_ok=True)
    geometries = [dict(shape='u-stiffened', height=h,width=b,lip=c,wallThickness=t,insideRadius=r)
                  for h,b,c,t,r in [(200,75,20,1,0),(150,60,15,1.5,2),(300,90,25,2,3)]]
    specs = []
    for gi, geometry in enumerate(geometries[:1] if args.probe else geometries):
        for arc,flat in ([(2,6)] if args.probe else [(2,6),(4,8),(8,12)]):
            waves = [870.2079655673336] if args.probe else [2000./m for m in range(1,65)] + [870.2079655673336,870.2079655673337]
            for wavelength in waves:
                nodes,edges = midline_u(geometry,arc,flat)
                mn,me = nodes.copy(),edges.copy(); mn[:,0]+=1; me[:,:3]+=1; me[:,4]+=1
                prop = np.array([[0.,200000.,200000.,.3,.3,200000./2.6]])
                key = len(specs)
                input_path=work/f'input-{key}.mat'
                content=dict(node=mn,elem=me,prop=prop+np.array([[1,0,0,0,0,0]]),wavelength=wavelength)
                if args.resume and input_path.exists():
                    previous=loadmat(input_path)
                    assert all(np.array_equal(previous[k].ravel(),np.asarray(v).ravel()) for k,v in content.items()), 'Resume input changed'
                else:
                    savemat(input_path,content)
                specs.append((geometry,arc,flat,wavelength,nodes,edges,prop))
    driver = [f"addpath('{quote(Path(__file__).parent)}');"]
    for index in range(len(specs)):
        if args.resume and (work/f'output-{index}.mat').exists():
            continue
        driver.append(f"cufsm_reference('{quote(work/f'input-{index}.mat')}','{quote(work/f'output-{index}.mat')}','{quote(source)}');")
    (work/'run.m').write_text('\n'.join(driver)+'\n',encoding='utf8')
    env = {**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
    started = time.perf_counter()
    with (args.output.parent/'cufsm-octave.log').open('w',encoding='utf8') as log:
        result = subprocess.run([str(args.octave.resolve()),'--no-gui','--quiet','--no-history',str(work/'run.m')],
            env=env,stdout=log,stderr=subprocess.STDOUT,timeout=1800)
    assert result.returncode == 0, 'Inspect cufsm-octave.log; no external success presumed'
    rows = []; maximum = {}; problems = {}; failures = []
    for index,(geometry,arc,flat,wavelength,nodes,edges,prop) in enumerate(specs):
        key = (json.dumps(geometry,sort_keys=True),arc,flat)
        with warnings.catch_warnings():
            warnings.filterwarnings('ignore',message='Conversion of an array with ndim > 0 to a scalar',category=DeprecationWarning)
            if key not in problems:
                problems[key] = ConstrainedModes(nodes,edges,prop,cutwp.prop2(nodes[:,1:3],edges[:,1:4]))
            problem = problems[key]
            k,g,spaces = problem.spaces(wavelength)
        original = loadmat(work/f'output-{index}.mat')
        row = dict(geometry=geometry,arc=arc,flat=flat,wavelength_mm=wavelength,
                   matrix_elastic_relative_difference=float(np.linalg.norm(k-original['K'])/np.linalg.norm(k)),
                   matrix_geometric_relative_difference=float(np.linalg.norm(g-original['Kg'])/np.linalg.norm(g)),families={})
        for family,prefix in [('local','local'),('distortional','dist')]:
            value,mode,diagnostic = constrained_eigenpair(k,g,spaces[family])
            refvalue = float(original[prefix+'_value'].item()); refmode = original[prefix+'_mode'].ravel()
            refbasis = original['Blocal' if family=='local' else 'Bdist']
            q,qr = orth(spaces[family]),orth(refbasis)
            space_error = float(np.linalg.norm(q-qr@(qr.T@q),2)) if q.shape[1]==qr.shape[1] else 1.
            # Eigenvector sign is arbitrary; repeated roots require a subspace
            # comparison, so alignment is diagnostic, never a false mode gate.
            correlation = float(abs(mode@refmode)/np.linalg.norm(mode)/np.linalg.norm(refmode))
            rayleigh = float(mode@k@mode/(mode@g@mode))
            disagreement = abs(value-refvalue)/abs(refvalue)
            entry = dict(jpn_stress_mpa=value,cufsm_stress_mpa=refvalue,relative_difference=disagreement,
                rayleigh_stress_mpa=rayleigh,subspace_relative_projection_error=space_error,
                mode_vector_abs_correlation=correlation,mode=mode.tolist(),cufsm_mode=refmode.tolist(),
                original_projected_residual=float(original[prefix+'_residual'].item()),diagnostics=diagnostic)
            row['families'][family] = entry
            for metric,v in dict(eigenvalue_relative_difference=disagreement,subspace_error=space_error,
                **diagnostic).items():
                maximum[metric] = max(maximum.get(metric,0.),v)
            # Fixed audit criteria, independent of the member's mesh acceptance:
            # matrix agreement 1e-12; spaces 1e-6; eigenvalues 1e-5. These do
            # not replace the existing 0.001 governing mesh/energy-bound gate.
            if disagreement>1e-5 or space_error>1e-6:
                failures.append(dict(index=index,family=family,relative_difference=disagreement,space_error=space_error))
        if max(row['matrix_elastic_relative_difference'],row['matrix_geometric_relative_difference'])>1e-12:
            failures.append(dict(index=index,reason='matrix-disagreement'))
        rows.append(row)
    output = dict(schema_version='jpn.cufsm-independent-audit/1',cufsm_commit=sha,versions=versions,
        octave=str(args.octave.name),elapsed_seconds=time.perf_counter()-started,cases=len(rows),maxima=maximum,
        failures=failures,results=rows,member_search_still_integer_half_waves_1_to_64=True,
        certified_spectrum_tail=False,normative_approval=False,approved_for_fabrication=False)
    args.output.write_text(json.dumps(output,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps(dict(cases=len(rows),failures=len(failures),maxima=maximum)))
    return 1 if failures else 0


if __name__=='__main__':
    sys.exit(main())
