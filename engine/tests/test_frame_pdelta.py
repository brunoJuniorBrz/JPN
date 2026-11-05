"""Continuum beam-column oracles, not a second call to the native method."""
import copy
import json
import math
import os
from pathlib import Path
import subprocess
import sys

import pytest

from jpn_structural.frame_pdelta import analyze_frame_pdelta
from jpn_structural.model import AnalysisError
from .test_frame3d import beam, portal


def column(count=16, ratio=.6, transverse=100., pinned=False):
    data = beam(axis=2)
    E, I, L = 200e9, 1e-5, 4.
    critical = math.pi**2*E*I/L**2/(1 if pinned else 4)
    data['nodes'] = [dict(id='N'+str(i), x_m=0., y_m=0., z_m=L*i/count) for i in range(count+1)]
    template = data['members'][0]
    data['members'] = [dict(template, id='F'+str(i), start='N'+str(i), end='N'+str(i+1)) for i in range(count)]
    data['sections'][0].update(iy_m4=I, iz_m4=I)
    data['supports'] = [dict(node='N0', restrained=[True, True, True, True, not pinned, True])]
    if pinned:
        data['supports'].append(dict(node='N'+str(count), restrained=[True, True, False, True, False, True]))
    load = data['nodal_loads'][0]
    load.update(node='N'+str(count), fx_n=0., fy_n=0., fz_n=-ratio*critical, mx_nm=0., my_nm=0., mz_nm=0.)
    data['nodal_loads'].append(dict(load, node='N'+str(count//2 if pinned else count), fx_n=transverse, fz_n=0.))
    return dict(schema_version='jpn.frame-pdelta/1', model=data, max_iterations=30)


@pytest.mark.parametrize('ratio', [.2, .6, .85, -.6])
def test_compressed_and_tensioned_cantilever_converges_to_exact_continuum(ratio):
    E, I, L, H = 200e9, 1e-5, 4., 100.
    P = abs(ratio)*math.pi**2*E*I/(4*L*L)
    k = math.sqrt(P/(E*I))
    exact = H/P*(math.tan(k*L)/k-L) if ratio>0 else H/P*(L-math.tanh(k*L)/k)
    errors = []
    for count in (8, 16, 32):
        out = analyze_frame_pdelta(column(count, ratio))
        delta = out['combinations']['TESTE-1']['nodes']['N'+str(count)]['translation_m'][0]
        errors.append(abs(delta-exact))
        assert abs(delta-exact) < abs(exact)*(abs(ratio)/count)**2
        linear = out['first_order']['combinations']['TESTE-1']['nodes']['N'+str(count)]['translation_m'][0]
        assert linear == pytest.approx(H*L**3/(3*E*I), rel=1e-9)
        assert (delta>linear) if ratio>0 else (delta<linear)
        assert out['combinations']['TESTE-1']['tangent_relative_residual'] <= 1e-8
        assert not out['normative_second_order_verified'] and not out['approved_for_fabrication']
    assert errors[2] < errors[1] < errors[0]


def test_pin_pin_column_with_center_transverse_force_has_independent_closed_solution():
    raw = column(32, .6, pinned=True)
    E, I, L, H = 200e9, 1e-5, 4., 100.
    P = .6*math.pi**2*E*I/L**2
    k = math.sqrt(P/(E*I))
    exact = H/(2*P)*(math.tan(k*L/2)/k-L/2)
    result = analyze_frame_pdelta(raw)['combinations']['TESTE-1']
    assert result['nodes']['N16']['translation_m'][0] == pytest.approx(exact, rel=(.6/32)**2)
    assert result['nodes']['N0']['force_n'][0] == pytest.approx(-H/2, rel=1e-8)


@pytest.mark.parametrize('ratio', [1.01, 1.2])
def test_native_positive_return_above_euler_does_not_admit_negative_tangent(ratio):
    with pytest.raises(AnalysisError) as caught:
        analyze_frame_pdelta(column(16, ratio))
    assert caught.value.code in ('UNSTABLE', 'NUMERICAL_FAILURE', 'MODEL_LIMIT')


def test_sign_superposition_and_no_input_or_first_order_mutation():
    raw = column(16, .6)
    before = copy.deepcopy(raw)
    positive = analyze_frame_pdelta(raw)
    assert raw == before
    raw['model']['nodal_loads'][1]['fx_n'] *= -2
    negative = analyze_frame_pdelta(raw)
    a = positive['combinations']['TESTE-1']['nodes']['N16']['translation_m'][0]
    b = negative['combinations']['TESTE-1']['nodes']['N16']['translation_m'][0]
    assert b == pytest.approx(-2*a, rel=1e-9)


@pytest.mark.parametrize('mutation', [
    lambda r:r.update(max_iterations=0),
    lambda r:r.update(max_iterations=True),
    lambda r:r['model']['members'][0]['release_end'].__setitem__(4, True),
    lambda r:r.update(model=portal()),
    lambda r:r['model']['supports'].clear(),
    lambda r:r['model']['sections'][0].update(iy_m4=0.),
    lambda r:r['model']['nodes'][1].update(z_m=0.),
])
def test_unsupported_and_unstable_models_never_fall_back_to_linear_approval(mutation):
    raw = column(8)
    mutation(raw)
    with pytest.raises(AnalysisError):
        analyze_frame_pdelta(raw)


def test_real_isolated_worker_has_os_cap_and_preserves_first_order_result():
    worker = Path(__file__).resolve().parents[1]/'second_order_worker.py'
    run = subprocess.run([sys.executable, '-I', '-X', 'utf8', str(worker)],
        input=json.dumps(column(8, .2)).encode(), capture_output=True, timeout=20,
        env={**os.environ, 'OPENBLAS_NUM_THREADS':'1', 'OMP_NUM_THREADS':'1', 'MKL_NUM_THREADS':'1'})
    result = json.loads(run.stdout)
    assert run.returncode == 0, result
    assert result['execution']['memory_limit_bytes'] == 768*1024*1024
    assert result['result']['first_order']['schema_version'] == 'jpn.frame3d-result/1'


def test_recovered_reactions_use_the_solved_initial_stress_equation_not_updated_axial_postprocessing():
    out=analyze_frame_pdelta(column(8,.85))['combinations']['TESTE-1']
    P=.85*math.pi**2*200e9*1e-5/(4*4**2)
    delta=out['nodes']['N8']['translation_m'][0]
    base=out['nodes']['N0']
    assert base['force_n'][0]==pytest.approx(-100.,rel=1e-8)
    assert base['force_n'][2]==pytest.approx(P,rel=1e-8)
    assert base['moment_nm'][1]==pytest.approx(-400.-P*delta,rel=1e-8)
    # Both values are retained, with an explicit distinct interpretation.
    assert 'native_force_n' in base
    assert out['equilibrium']['relative_residual']<=1e-8


@pytest.mark.parametrize('axis',[0,1])
def test_rotated_global_axes_reproduce_the_same_continuum_solution(axis):
    raw=column(16,.6)
    permutation=([2,0,1] if axis==0 else [1,2,0])
    for node in raw['model']['nodes']:
        v=[node[k] for k in ('x_m','y_m','z_m')]
        node.update(zip(('x_m','y_m','z_m'),[v[i] for i in permutation]))
    for load in raw['model']['nodal_loads']:
        v=[load[k] for k in ('fx_n','fy_n','fz_n')]
        load.update(zip(('fx_n','fy_n','fz_n'),[v[i] for i in permutation]))
    out=analyze_frame_pdelta(raw)['combinations']['TESTE-1']['nodes']['N16']
    P=.6*math.pi**2*200e9*1e-5/(4*4**2);k=math.sqrt(P/(200e9*1e-5))
    exact=100/P*(math.tan(k*4)/k-4)
    assert out['translation_m'][permutation.index(0)]==pytest.approx(exact,rel=(.6/16)**2)


def test_near_critical_large_motions_and_stiffness_contrast_remain_blocked():
    with pytest.raises(AnalysisError):
        analyze_frame_pdelta(column(16,.999))
    raw=column(8)
    raw['model']['sections'].append({**raw['model']['sections'][0],'id':'DIFFERENT','iy_m4':1e-8})
    raw['model']['members'][3]['section']='DIFFERENT'
    with pytest.raises(AnalysisError):
        analyze_frame_pdelta(raw)
