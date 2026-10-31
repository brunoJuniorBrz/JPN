"""PyNite adapter, not a new frame finite-element implementation.

Global Z up. Local axes are returned explicitly (PyNite T rows). Section forces
are actions of the END portion on the START portion, expressed in local XYZ.
Only nodal loading is supported: exact constant force/linear moment recovery.
"""
import contextlib
from importlib.metadata import version
import io
import json
import sys
import time
import warnings
import numpy as np
from scipy.linalg import eigvalsh
from .frame3d_model import validate, input_hash, fail
from .model import AnalysisError


def geometry_check(data):
    points = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')], dtype=float) for n in data['nodes']}
    tolerance = 1e-8
    for i, a in enumerate(points.values()):
        for b in list(points.values())[i + 1:]:
            if np.linalg.norm(a - b) <= tolerance:
                fail('INVALID_GEOMETRY', 'Nós coincidentes; a conectividade deve usar um ID único por junta.')
    adjacent = {key: set() for key in points}
    segments = []
    for m in data['members']:
        a, b = points[m['start']], points[m['end']]
        d = b - a; length = np.linalg.norm(d)
        if not 1e-5 <= length <= 1000:
            fail('INVALID_GEOMETRY', f"{m['id']}: comprimento fora de 0,00001–1.000 m.")
        for nid, p in points.items():
            if nid in (m['start'], m['end']):
                continue
            t = np.dot(p - a, d) / length**2
            if 0 < t < 1 and np.linalg.norm(p - a - t * d) <= tolerance:
                fail('UNRESOLVED_CONTACT', f"{nid} toca interior de {m['id']}; segmente e declare a ligação, sem conexão automática.")
        adjacent[m['start']].add(m['end']); adjacent[m['end']].add(m['start'])
        segments.append((m, a, b))
    # Interior intersections (including skew lines); shared endpoint IDs are
    # explicit connections. Parallel overlap is also caught by node-on-member.
    for i, (m, a, b) in enumerate(segments):
        for n, c, d in segments[i + 1:]:
            if {m['start'], m['end']} & {n['start'], n['end']}:
                continue
            matrix = np.column_stack((b - a, -(d - c)))
            if np.linalg.matrix_rank(matrix) < 2:
                continue
            uv = np.linalg.lstsq(matrix, c - a, rcond=None)[0]
            if all(0 < v < 1 for v in uv) and np.linalg.norm(a + uv[0] * (b - a) - c - uv[1] * (d - c)) <= tolerance:
                fail('UNRESOLVED_CONTACT', f"{m['id']} cruza {n['id']} sem junta declarada.")
    visited, stack = set(), [next(iter(points))]
    while stack:
        node = stack.pop()
        if node not in visited:
            visited.add(node); stack.extend(adjacent[node] - visited)
    if len(visited) != len(points):
        fail('DISCONNECTED_MODEL', 'Componentes desconectados ou nós órfãos; não são estabilizados automaticamente.')
    return points


def analyze_frame3d(raw):
    started = time.perf_counter()
    data = validate(raw); points = geometry_check(data)
    try:
        from Pynite import FEModel3D, Analysis
        if version('PyNiteFEA') != '3.2.1':
            fail('DEPENDENCY_VERSION', 'PyNiteFEA 3.2.1 é a única versão validada deste adaptador.')
    except ImportError as exc:
        raise AnalysisError('DEPENDENCY_MISSING', 'Instale PyNiteFEA==3.2.1 no serviço Python.') from exc
    model = FEModel3D()
    for node, point in points.items():
        model.add_node(node, *point)
    for m in data['materials']:
        # Density is unused: this contract has NO self-weight operation.
        model.add_material(m['id'], m['e_pa'], m['g_pa'], m['nu'], 0)
    for s in data['sections']:
        model.add_section(s['id'], s['area_m2'], s['iy_m4'], s['iz_m4'], s['j_m4'])
    for m in data['members']:
        model.add_member(m['id'], m['start'], m['end'], m['material'], m['section'], rotation=m['rotation_deg'])
        model.def_releases(m['id'], *(m['release_start'] + m['release_end']))
    for s in data['supports']:
        model.def_support(s['node'], *s['restrained'])
    for load in data['nodal_loads']:
        for direction, key in zip(('FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'), ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')):
            model.add_node_load(load['node'], direction, load[key], load['case'])
    for combo in data['combinations']:
        model.add_load_combo(combo['id'], combo['factors'])
    try:
        with contextlib.redirect_stdout(io.StringIO()), warnings.catch_warnings():
            warnings.simplefilter('error')
            # Version-pinned library preparation/matrix API, NOT our assembly.
            Analysis._prepare_model(model)
            for member in model.members.values():
                if len(member.sub_members) != 1:
                    fail('UNRESOLVED_CONTACT', 'PyNite tentou criar juntas não declaradas.')
            first_combo = data['combinations'][0]['id']
            stiffness = model.Ke(first_combo, check_stability=False, sparse=False)
            restrained = {s['node']: s['restrained'] for s in data['supports']}
            free = [node.ID * 6 + dof for node in model.nodes.values() for dof in range(6) if not restrained.get(node.name, [False] * 6)[dof]]
            condition = 1.
            if free:
                k = stiffness[np.ix_(free, free)]
                diagonal = np.diag(k)
                if not np.isfinite(k).all():
                    fail('NUMERICAL_FAILURE', 'Rigidez não finita.')
                if (diagonal <= 0).any():
                    fail('UNSTABLE', 'Grau livre sem rigidez; reveja apoios e liberações.')
                scale = np.sqrt(diagonal)
                spectrum = eigvalsh(k / scale[:, None] / scale[None, :])
                if spectrum[0] <= 10 * len(free) * np.finfo(float).eps * spectrum[-1]:
                    fail('UNSTABLE', 'Mecanismo ou matriz singular; nenhuma restrição artificial foi aplicada.')
                condition = float(spectrum[-1] / spectrum[0])
                if condition > 1e10:
                    fail('ILL_CONDITIONED', 'Condicionamento numérico fora do domínio experimental.')
            model.analyze_linear(log=False, check_stability=True, sparse=True)
    except AnalysisError:
        raise
    except (np.linalg.LinAlgError, ZeroDivisionError) as exc:
        raise AnalysisError('UNSTABLE', 'Liberação ou modelo singular; sem resultado parcial.') from exc
    except Exception as exc:
        raise AnalysisError('NUMERICAL_FAILURE', f'Falha numérica do PyNite ({type(exc).__name__}); sem resultado parcial.') from exc
    combinations = {}
    length_scale = max(np.ptp(np.array(list(points.values())), axis=0).max(), 1e-5)
    reference = next(iter(points.values()))
    for combo in data['combinations']:
        name = combo['id']; nodes = {}; members = {}
        force_sum = np.zeros(3); moment_sum = np.zeros(3); force_scale = moment_scale = 0.
        assembled = {key: np.zeros(6) for key in points}
        for mid, m in model.members.items():
            element = next(iter(m.sub_members.values()))
            actions = element.f(name).ravel()
            axes = element.T()[:3, :3]
            start_force, start_moment = actions[:3], actions[3:6]
            stations = []
            for x in np.linspace(0, m.L(), 5):
                cut_force = -start_force
                cut_moment = -start_moment + np.cross([x, 0, 0], start_force)
                stations.append(dict(x_m=float(x), n_n=float(cut_force[0]), vy_n=float(cut_force[1]), vz_n=float(cut_force[2]), t_nm=float(cut_moment[0]), my_nm=float(cut_moment[1]), mz_nm=float(cut_moment[2])))
            global_actions = element.T().T @ actions
            assembled[m.i_node.name] += global_actions[:6]; assembled[m.j_node.name] += global_actions[6:]
            members[mid] = dict(length_m=m.L(), local_axes=axes.tolist(), end_actions_local=actions.tolist(), stations=stations)
        nodal_loads = {key: np.zeros(6) for key in points}
        for load in data['nodal_loads']:
            factor = combo['factors'].get(load['case'], 0)
            nodal_loads[load['node']] += factor * np.array([load[k] for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')])
        nodal_residual = 0.; nodal_scale = 0.
        for nid, node in model.nodes.items():
            translation = np.array([getattr(node, k)[name] for k in ('DX', 'DY', 'DZ')])
            rotation = np.array([getattr(node, k)[name] for k in ('RX', 'RY', 'RZ')])
            reaction = np.array([getattr(node, k)[name] for k in ('RxnFX', 'RxnFY', 'RxnFZ', 'RxnMX', 'RxnMY', 'RxnMZ')])
            if np.linalg.norm(translation) / length_scale > .01 or np.linalg.norm(rotation) > .05:
                fail('MODEL_LIMIT', 'Movimento excede o domínio linear operacional; não é um limite normativo.')
            external = nodal_loads[nid] + reaction
            units = np.array([1., 1, 1, length_scale, length_scale, length_scale])
            nodal_residual = max(nodal_residual, np.linalg.norm((assembled[nid] - external) / units))
            nodal_scale += np.linalg.norm(external / units) + np.linalg.norm(assembled[nid] / units)
            force_sum += external[:3]
            moment_sum += external[3:] + np.cross(points[nid] - reference, external[:3])
            force_scale += np.linalg.norm(nodal_loads[nid][:3]) + np.linalg.norm(reaction[:3])
            moment_scale += np.linalg.norm(nodal_loads[nid][3:]) + np.linalg.norm(reaction[3:])
            nodes[nid] = dict(translation_m=translation.tolist(), rotation_rad=rotation.tolist(), force_n=reaction[:3].tolist(), moment_nm=reaction[3:].tolist())
        residual = max(np.linalg.norm(force_sum) / max(force_scale, 1e-30), np.linalg.norm(moment_sum) / max(moment_scale + force_scale * length_scale, 1e-30), nodal_residual / max(nodal_scale, 1e-30))
        if residual > 1e-8:
            fail('EQUILIBRIUM_FAILURE', 'Resíduo de equilíbrio acima de 1e-8; resultado recusado.')
        combinations[name] = dict(nodes=nodes, members=members, equilibrium=dict(force_n=force_sum.tolist(), moment_nm=moment_sum.tolist(), relative_residual=float(residual)))
    result = dict(schema_version='jpn.frame3d-result/1', status='analysis_completed_experimental', units='SI', project=data['project'], input_sha256=input_hash(data),
                  solver=dict(name='PyNiteFEA', version=version('PyNiteFEA'), adapter='jpn-frame3d/1'),
                  assumptions=['Primeira ordem, material isotrópico linear, Euler–Bernoulli; sem deformação por cisalhamento.', 'Somente cargas nodais e apoios cartesianos em zero, com seis graus declarados.', 'Sem peso próprio, vento, P-Delta, flambagem, resistência normativa ou liberação de fabricação.', 'Eixos locais do PyNite devolvidos explicitamente; não são os eixos do desenho 3D.'],
                  diagnostics=dict(free_dofs=len(free), scaled_condition=condition, elapsed_seconds=time.perf_counter() - started), combinations=combinations)
    try:
        encoded = json.dumps(result, allow_nan=False)
    except ValueError as exc:
        raise AnalysisError('NUMERICAL_FAILURE', 'Resultado não finito; nada publicado.') from exc
    if len(encoded.encode()) > 2_000_000:
        fail('OUTPUT_LIMIT', 'Resultado excede 2 MB.')
    return result


def main():
    from .__main__ import _unique_object
    try:
        encoded = sys.stdin.buffer.read(500001)
        if len(encoded) > 500000:
            fail('INPUT_LIMIT', 'Entrada excede 500 kB.')
        raw = encoded.decode('utf-8')
        result = analyze_frame3d(json.loads(raw, object_pairs_hook=_unique_object))
        print(json.dumps(result, allow_nan=False)); return 0
    except (ValueError, RecursionError, TypeError, OverflowError) as exc:
        print(json.dumps(dict(status='error', error=dict(code=getattr(exc, 'code', 'INVALID_INPUT'), message=str(exc))))); return 2


if __name__ == '__main__':
    sys.exit(main())
