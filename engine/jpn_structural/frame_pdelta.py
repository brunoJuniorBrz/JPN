"""Opt-in native PyNite P-Delta for explicitly meshed FRAME-ONLY models.

This is not the mixed solver: Spring3D has no geometric stiffness in 3.2.1.
No supports, sections, releases, loads or intermediate nodes are invented.
The original first-order result is returned separately and never overwritten.
"""
import contextlib
from importlib.metadata import version
import io
import time
import warnings

import numpy as np
from scipy.linalg import eigvalsh

from .frame3d import analyze_frame3d
from .frame3d_model import obj, input_hash, fail, validate
from .model import AnalysisError


def _native_model(data):
    from Pynite import FEModel3D
    model = FEModel3D()
    for node in data['nodes']:
        model.add_node(node['id'], *(node[k] for k in ('x_m', 'y_m', 'z_m')))
    for material in data['materials']:
        model.add_material(material['id'], material['e_pa'], material['g_pa'], material['nu'], 0)
    for section in data['sections']:
        model.add_section(section['id'], *(section[k] for k in ('area_m2', 'iy_m4', 'iz_m4', 'j_m4')))
    for member in data['members']:
        model.add_member(member['id'], member['start'], member['end'], member['material'],
                         member['section'], rotation=member['rotation_deg'])
    for support in data['supports']:
        model.def_support(support['node'], *support['restrained'])
    for load in data['nodal_loads']:
        for direction, key in zip(('FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'),
                                  ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')):
            if load[key]:
                model.add_node_load(load['node'], direction, load[key], load['case'])
    for combo in data['combinations']:
        model.add_load_combo(combo['id'], combo['factors'])
    return model


def analyze_frame_pdelta(raw):
    obj(raw, 'schema_version model max_iterations', 'frame P-Delta request')
    if raw['schema_version'] != 'jpn.frame-pdelta/1':
        fail('UNSUPPORTED_MODEL', 'Explicit experimental frame P-Delta contract required.')
    if type(raw['max_iterations']) is not int or not 1 <= raw['max_iterations'] <= 30:
        fail('INVALID_INPUT', 'Native iteration limit must be an integer from 1 to 30.')
    data = raw['model']
    validate(data)
    if len(data['nodes']) > 100 or len(data['members']) > 128:
        fail('INPUT_LIMIT', 'Experimental P-Delta limit: 100 explicit nodes and 128 frames.')
    # Strict validation, connectivity, true local bases, initial stability,
    # conditioning, small motions and equilibrium all use the existing path.
    linear = analyze_frame3d(data)
    if any(any(m['release_start'] + m['release_end']) for m in data['members']):
        fail('UNSUPPORTED_RELEASE', 'This initial P-Delta domain admits unreleased frames only.')
    # Deliberately narrow first release: a straight prismatic beam-column,
    # explicitly discretized by the caller. General sway frames require a
    # separate independent validation campaign; they are not inferred here.
    points = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')], dtype=float) for n in data['nodes']}
    first = data['members'][0]
    direction = points[first['end']]-points[first['start']]
    direction /= np.linalg.norm(direction)
    reference = points[first['start']]
    span = max(np.linalg.norm(p-reference) for p in points.values())
    if any(np.linalg.norm(np.cross(p-reference, direction)) > 1e-10*span for p in points.values()):
        fail('UNSUPPORTED_SECOND_ORDER_MODEL', 'Initial validated experiment: straight prismatic beam-column only, not a portal or mixed structure.')
    if any((m['material'], m['section'], m['rotation_deg']) !=
           (first['material'], first['section'], first['rotation_deg']) for m in data['members']):
        fail('UNSUPPORTED_SECOND_ORDER_MODEL', 'One common material, section and roll required along the straight member.')
    for combination in linear['combinations'].values():
        normal = [member['stations'][0]['n_n'] for member in combination['members'].values()]
        if max(normal)-min(normal) > 128*np.finfo(float).eps*max(1., *map(abs, normal)):
            fail('UNSUPPORTED_SECOND_ORDER_MODEL', 'Uniform axial force along the beam-column is required.')
    for load in data['nodal_loads']:
        torque = np.array([load[k] for k in ('mx_nm', 'my_nm', 'mz_nm')])
        if abs(torque @ direction) > 128*np.finfo(float).eps*max(1., np.linalg.norm(torque)):
            fail('UNSUPPORTED_SECOND_ORDER_MODEL', 'Torsion is outside the initial beam-column experiment.')
    if version('PyNiteFEA') != '3.2.1':
        fail('DEPENDENCY_VERSION', 'Only the audited native PyNiteFEA 3.2.1 is supported.')
    started = time.perf_counter()
    model = _native_model(data)
    combinations = {}
    try:
        with contextlib.redirect_stdout(io.StringIO()), warnings.catch_warnings():
            warnings.simplefilter('error')
            # PyNite 3.2.1 uses TWO solves: Ke first, then Ke+Kg(N_linear).
            # max_iter controls unilateral active sets, not Newton iterations.
            # Audit the actual frozen-axial tangent it solves. Rebuilding Kg
            # from the final axial strain changes the mathematical problem
            # and is not a residual of this native initial-stress method.
            model.analyze_linear(log=False, check_stability=True, sparse=True)
            initial_tangents = {combo['id']: model.Ke(combo['id'], sparse=False)
                + model.Kg(combo['id'], sparse=False, first_step=False) for combo in data['combinations']}
            initial_elements = {}
            for combo in data['combinations']:
                name = combo['id']
                initial_elements[name] = {}
                for mid, member in model.members.items():
                    element = next(iter(member.sub_members.values()))
                    d = element.d(name)
                    normal = (d[6, 0]-d[0, 0])*element.material.E*element.section.A/element.L()
                    initial_elements[name][mid] = element.ke(name)+element.kg(normal)
            model.analyze_PDelta(log=False, check_stability=True, sparse=True,
                                max_iter=raw['max_iterations'])
            restrained = {s['node']: s['restrained'] for s in data['supports']}
            free = [node.ID*6+i for node in model.nodes.values() for i in range(6)
                    if not restrained.get(node.name, [False]*6)[i]]
            xyz = {n['id']: np.array([n[k] for k in ('x_m', 'y_m', 'z_m')]) for n in data['nodes']}
            length_scale = max(float(np.ptp(list(xyz.values()), axis=0).max()), 1e-5)
            for combo in data['combinations']:
                name = combo['id']
                tangent = initial_tangents[name]
                displacement = model.D(name)
                applied = model.P(name)
                if not np.isfinite(tangent).all() or not np.isfinite(displacement).all():
                    fail('NUMERICAL_FAILURE', 'Nonfinite tangent or displacement; no partial result.')
                condition = 1.
                if free:
                    k = tangent[np.ix_(free, free)]
                    diagonal = np.diag(k)
                    if np.any(diagonal <= 0):
                        fail('UNSTABLE', 'Nonpositive tangent stiffness.')
                    scale = np.sqrt(diagonal)
                    spectrum = eigvalsh(k / scale[:, None] / scale[None, :])
                    if spectrum[0] <= 10*len(free)*np.finfo(float).eps*spectrum[-1]:
                        fail('UNSTABLE', 'Nonpositive or singular tangent: no post-buckling result admitted.')
                    condition = float(spectrum[-1]/spectrum[0])
                    if condition > 1e10:
                        fail('ILL_CONDITIONED', 'Tangent conditioning exceeds the existing numerical domain.')
                # Check the actual initial-stress equation, not merely the
                # native routine's successful return or active-set counter.
                residual = (tangent @ displacement - applied).ravel()
                units = np.tile([1., 1., 1., length_scale, length_scale, length_scale], len(model.nodes))
                denominator = max(float(np.linalg.norm((tangent @ displacement).ravel()/units)),
                                  float(np.linalg.norm(applied.ravel()/units)), 1e-30)
                relative = float(np.linalg.norm(residual[free]/units[free])/denominator)
                if relative > 1e-8:
                    fail('NONCONVERGENCE', 'Initial-stress tangent/load residual exceeds 1e-8; native return is insufficient.')
                updated_tangent = model.Ke(name, sparse=False) + model.Kg(name, sparse=False, first_step=False)
                axial_update_residual = float(np.linalg.norm(((updated_tangent @ displacement-applied).ravel()/units)[free])/denominator)
                nodes = {}
                force_sum = np.zeros(3)
                moment_sum = np.zeros(3)
                nonlinear_moment_sum = np.zeros(3)
                external_scale = 0.
                origin = next(iter(xyz.values()))
                for nid, node in model.nodes.items():
                    translation = np.array([getattr(node, key)[name] for key in ('DX', 'DY', 'DZ')])
                    rotation = np.array([getattr(node, key)[name] for key in ('RX', 'RY', 'RZ')])
                    native_reaction = np.array([getattr(node, key)[name] for key in ('RxnFX', 'RxnFY', 'RxnFZ', 'RxnMX', 'RxnMY', 'RxnMZ')])
                    # Native f()/reaction postprocessing rebuilds Kg from the
                    # UPDATED axial strain. Recover actions from the SAME
                    # native matrices used in the two-step equation instead;
                    # retain the library's different values for audit.
                    reaction = np.array([residual[node.ID*6+i] if restrained.get(nid, [False]*6)[i]
                                         else 0. for i in range(6)])
                    if np.linalg.norm(translation)/length_scale > .01 or np.linalg.norm(rotation) > .05:
                        fail('MODEL_LIMIT', 'Second-order motions exceed the existing small-motion operational domain.')
                    applied_node = np.zeros(6)
                    for load in data['nodal_loads']:
                        if load['node'] == nid:
                            applied_node += combo['factors'].get(load['case'], 0)*np.array(
                                [load[k] for k in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm')])
                    external = reaction + applied_node
                    force_sum += external[:3]
                    # The native initial-stress theory retains N*u_perp,
                    # not all products of displacements and transverse loads.
                    # Full deformed geometry is a DIFFERENT nonlinear theory;
                    # report its residual separately, never call it converged.
                    axial_external = direction*(external[:3] @ direction)
                    moment_sum += external[3:] + np.cross(xyz[nid]-origin, external[:3]) + np.cross(translation, axial_external)
                    nonlinear_moment_sum += external[3:] + np.cross(xyz[nid]+translation-origin, external[:3])
                    external_scale += np.linalg.norm(reaction[:3])+np.linalg.norm(applied_node[:3])
                    external_scale += (np.linalg.norm(reaction[3:])+np.linalg.norm(applied_node[3:]))/length_scale
                    nodes[nid] = dict(translation_m=translation.tolist(), rotation_rad=rotation.tolist(),
                                      force_n=reaction[:3].tolist(), moment_nm=reaction[3:].tolist(),
                                      native_force_n=native_reaction[:3].tolist(), native_moment_nm=native_reaction[3:].tolist())
                equilibrium = max(float(np.linalg.norm(force_sum)), float(np.linalg.norm(moment_sum))/length_scale)/max(external_scale, 1e-30)
                if equilibrium > 1e-8:
                    fail('EQUILIBRIUM_FAILURE', 'Initial-stress equilibrium exceeds 1e-8; refine the declared mesh or investigate the model.')
                members = {}
                for mid, member in model.members.items():
                    element = next(iter(member.sub_members.values()))
                    members[mid] = dict(end_actions_local=(initial_elements[name][mid] @ element.d(name)).ravel().tolist(),
                        native_end_actions_local=element.f(name).ravel().tolist(), local_axes=element.T()[:3, :3].tolist())
                combinations[name] = dict(nodes=nodes, members=members, tangent_condition=condition,
                    tangent_relative_residual=relative, updated_axial_tangent_relative_residual=axial_update_residual,
                    nonlinear_deformed_moment_relative_residual=float(np.linalg.norm(nonlinear_moment_sum))/length_scale/max(external_scale, 1e-30),
                    equilibrium=dict(relative_residual=equilibrium,
                        force_n=force_sum.tolist(), initial_stress_moment_nm=moment_sum.tolist()))
    except AnalysisError:
        raise
    except Exception as exc:
        raise AnalysisError('NUMERICAL_FAILURE', 'Native P-Delta failed or did not converge; no partial result: '+type(exc).__name__) from exc
    return dict(schema_version='jpn.frame-pdelta-result/1', input_sha256=input_hash(raw), units='SI',
        status='experimental-frame-only', solver=dict(name='PyNiteFEA', version='3.2.1', method='analyze_PDelta'),
        first_order=linear, combinations=combinations, elapsed_seconds=time.perf_counter()-started,
        equilibrium_model='native-two-step-initial-stress', nonlinear_iteration_convergence_verified=False,
        mesh_convergence_verified=False, normative_second_order_verified=False,
        mixed_axial_geometric_stiffness_supported=False, approved_for_fabrication=False,
        limitations=['Caller must demonstrate mesh convergence; explicit nodes are never added automatically.',
                     'No Spring3D, releases, distributed loading, imperfections, material nonlinearity or code stability approval.',
                     'Native cubic geometric stiffness, small motions and first-step axial-force approximation; not full nonlinear equilibrium.'])
