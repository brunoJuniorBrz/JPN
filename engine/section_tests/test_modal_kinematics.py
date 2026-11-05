"""Original CUFSM/Octave fixtures plus independent wall/energy constraints."""
import json
from pathlib import Path
import warnings

import numpy as np
import pytest
from pycufsm.pre import cutwp

from jpn_structural.constrained_modes import ConstrainedModes, constrained_eigenpair
from jpn_structural.member_buckling import midline_u
from jpn_structural.modal_kinematics import local_modes, corner_constraints

REFERENCE=json.loads((Path(__file__).parent/'fixtures/cufsm_m32_reference.json').read_text())
pytestmark=pytest.mark.filterwarnings('default:Conversion of an array with ndim > 0 to a scalar is deprecated:DeprecationWarning')


@pytest.mark.parametrize('row',REFERENCE['cases'])
def test_modal_spaces_match_real_original_cufsm_executable(row):
    n,e=midline_u(row['geometry'],row['arc'],row['flat'])
    props=np.array([[0.,200000.,200000.,.3,.3,200000./2.6]])
    problem=ConstrainedModes(n,e,props,cutwp.prop2(n[:,1:3],e[:,1:4]))
    k,g,spaces=problem.spaces(row['wavelength_mm'])
    for family in ['local','distortional']:
        expected=row['families'][family]
        value,mode,diagnostic=constrained_eigenpair(k,g,spaces[family])
        assert value==pytest.approx(expected['cufsm_stress_mpa'],rel=1e-5,abs=0.)
        # The independent original mode must lie in the complete declared
        # physical space, regardless of arbitrary eigenvector sign/scale.
        trial=np.array(expected['cufsm_mode']);q=np.linalg.qr(spaces[family])[0]
        assert np.linalg.norm(trial-q@(q.T@trial))/np.linalg.norm(trial)<1e-6
        assert abs(mode@k@mode-value*(mode@g@mode))/(abs(mode@k@mode)+value*abs(mode@g@mode))<=max(diagnostic['energy_accumulation_bound'],128*np.finfo(float).eps)


def test_local_wall_displacements_are_normal_to_each_actual_wall_not_element_zero():
    n,e=midline_u(dict(height=200,width=75,lip=20,wallThickness=1,insideRadius=0),2,6)
    from pycufsm.solve import cfsm
    main,meta,types,nm,nc,ns,nd,nl,perm=cfsm.base_properties(n,e)
    local=local_modes(n,e,types,nl);column=len(n)
    for i,kind in enumerate(types[:,3]):
        if kind in (2,3):
            edge=e[np.flatnonzero((e[:,1]==i)|(e[:,2]==i))[0]]
            a,b=edge[1:3].astype(int);tangent=n[b,1:3]-n[a,1:3]
            normal=local[[2*i,2*len(n)+2*i],column]
            assert abs(normal@tangent)<1e-12*np.linalg.norm(tangent)
            column+=1
    rx,rz=corner_constraints(main,meta)
    rng=np.random.default_rng(32);dy=rng.normal(size=len(main));ux,uz=rx@dy,rz@dy;corner=0
    for i,node in enumerate(main):
        adjacent=np.flatnonzero((meta[:,1]==i)|(meta[:,2]==i))
        if len(adjacent)==2:
            for index in adjacent:
                other=int(meta[index,2] if int(meta[index,1])==i else meta[index,1])
                delta=main[other,1:3]-node[1:3]
                assert delta@np.array([ux[corner],uz[corner]])==pytest.approx(dy[i]-dy[other],abs=1e-10)
            corner+=1


@pytest.mark.parametrize('wavelength',[31.25,870.2079655673336])
@pytest.mark.parametrize('dimensions',[(200,75,20,1,0),(150,60,15,1.5,2),(300,90,25,2,3)])
def test_fast_real_local_kernels_preserve_full_double_precision_python_matrices(wavelength,dimensions):
    from pycufsm.solve import analysis_p
    from jpn_structural.finite_strip_matrices import FiniteStripMatrices
    n,e=midline_u(dict(zip(('height','width','lip','wallThickness','insideRadius'),dimensions)),2,6)
    props=np.array([[0.,200000.,200000.,.3,.3,200000./2.6]])
    el=analysis_p.elem_prop(n,e)
    k,g,t=FiniteStripMatrices(n,e,props,el).assemble(wavelength)
    pk,pg=analysis_p.k_kg_global(n,e,el,props,wavelength,'S-S',np.ones(1))
    pt=analysis_p.kglobal_transv(n,e,props,1.,wavelength,'S-S',el)
    for actual,reference in [(k,pk),(g,pg),(t,pt)]:
        assert np.linalg.norm(actual-reference)/np.linalg.norm(reference)<1e-12
    # Exact physical scaling behind the cached condensation: longitudinal
    # DOFs are excluded; every retained transverse entry is proportional L.
    from pycufsm.solve import cfsm
    main,meta,types,nm,nc,ns,nd,nl,perm=cfsm.base_properties(n,e)
    ref_length=float(np.ptp(n[:,1:3],axis=0).max())
    tr=analysis_p.kglobal_transv(n,e,props,1.,ref_length,'S-S',el)
    ids=list(range(nm,4*len(n)-ns))
    a=(perm.T@t@perm)[np.ix_(ids,ids)]/wavelength
    b=(perm.T@tr@perm)[np.ix_(ids,ids)]/ref_length
    assert np.linalg.norm(a-b)/np.linalg.norm(b)<1e-12
