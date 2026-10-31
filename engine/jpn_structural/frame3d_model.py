"""jpn.frame3d/1: strict SI contracts, no visual or implicit physical data."""
import hashlib
import json
import math
import re
import struct
from .model import AnalysisError

DOFS = ('UX', 'UY', 'UZ', 'RX', 'RY', 'RZ')
LIMITS = dict(nodes=250, members=600, materials=50, sections=50, supports=250,
              cases=10, nodal_loads=500, combinations=10)


def fail(code, message):
    raise AnalysisError(code, message)


def canonical(value):
    """Sorted keys + IEEE754 tags: identical across Python and ECMAScript."""
    if type(value) in (int, float):
        return {'$f64': struct.pack('>d', float(value) if value != 0 else 0.).hex()}
    if isinstance(value, dict):
        return {k: canonical(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    return value


def input_hash(data):
    return hashlib.sha256(json.dumps(canonical(data), sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def obj(value, keys, label):
    if type(value) is not dict or set(value) != set(keys.split()):
        fail('INVALID_INPUT', f'{label}: campos obrigatórios/extras inválidos.')


def number(value, lo, hi, label, positive=False):
    if type(value) not in (int, float) or not lo <= value <= hi or not math.isfinite(value) or (positive and value <= 0):
        fail('INVALID_INPUT', f'{label}: número finito fora do domínio permitido.')


def text(value, label, identifier=False):
    if type(value) is not str or not value.strip() or len(value) > (80 if identifier else 1000):
        fail('INVALID_INPUT', f'{label}: identificação/fonte obrigatória.')
    if identifier and (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]*', value) or value in ('constructor', 'prototype')):
        fail('INVALID_INPUT', f'{label}: identificador inválido.')


def flags(value):
    if type(value) is not list or len(value) != 6 or any(type(v) is not bool for v in value):
        fail('INVALID_INPUT', 'Informe exatamente seis booleanos: UX UY UZ RX RY RZ.')


def validate(data):
    obj(data, 'schema_version units project theory nodes members materials sections supports cases nodal_loads combinations', 'modelo')
    if data['schema_version'] != 'jpn.frame3d/1' or data['units'] != 'SI' or data['theory'] != 'linear-elastic-euler-bernoulli':
        fail('UNSUPPORTED_MODEL', 'Somente pórticos 3D elásticos de primeira ordem, em SI.')
    obj(data['project'], 'id revision source', 'projeto')
    for key, value in data['project'].items():
        text(value, f'projeto.{key}')
    ids = {}
    for field, limit in LIMITS.items():
        values = data[field]
        if type(values) is not list or len(values) > limit:
            fail('INPUT_LIMIT', f'{field}: máximo {limit} registros.')
        if field not in ('supports', 'nodal_loads') and not values:
            fail('INCOMPLETE_MODEL', f'{field}: dados obrigatórios ausentes; sem valores presumidos.')
        if field not in ('supports', 'nodal_loads'):
            keys = []
            for value in values:
                if type(value) is not dict or 'id' not in value:
                    fail('INVALID_INPUT', f'{field}: registro inválido.')
                text(value['id'], f'{field}.id', True)
                keys.append(value['id'])
            if len(set(keys)) != len(keys):
                fail('DUPLICATE_ID', f'{field}: IDs repetidos.')
            ids[field] = set(keys)
    if len(data['nodes']) < 2:
        fail('INCOMPLETE_MODEL', 'São necessários dois nós e uma barra.')
    for n in data['nodes']:
        obj(n, 'id x_m y_m z_m', 'nó')
        for key in ('x_m', 'y_m', 'z_m'):
            number(n[key], -10000, 10000, key)
    for material in data['materials']:
        obj(material, 'id e_pa g_pa nu source revision', 'material')
        for key in ('e_pa', 'g_pa'):
            number(material[key], 1, 1e13, key)
        number(material['nu'], -.99, .499, 'nu')
        if abs(material['e_pa'] / (2 * material['g_pa'] * (1 + material['nu'])) - 1) > .001:
            fail('INVALID_MATERIAL', 'E, G e nu incompatíveis com a hipótese isotrópica declarada.')
        text(material['source'], 'fonte'); text(material['revision'], 'revisão')
    for section in data['sections']:
        obj(section, 'id area_m2 iy_m4 iz_m4 j_m4 source revision', 'seção')
        for key in ('area_m2', 'iy_m4', 'iz_m4', 'j_m4'):
            number(section[key], 1e-16, 1000, key, True)
        text(section['source'], 'fonte'); text(section['revision'], 'revisão')
    edges = set()
    for m in data['members']:
        obj(m, 'id start end kind material section rotation_deg release_start release_end', 'barra')
        for key in ('start', 'end', 'material', 'section'):
            text(m[key], key, True)
        if m['kind'] != 'frame':
            fail('UNSUPPORTED_MODEL', 'Este contrato aceita barras de pórtico; não converte treliças em ligações rígidas.')
        if m['start'] not in ids['nodes'] or m['end'] not in ids['nodes'] or m['start'] == m['end']:
            fail('INVALID_REFERENCE', f"{m['id']}: extremidades inexistentes/iguais.")
        if m['material'] not in ids['materials'] or m['section'] not in ids['sections']:
            fail('INVALID_REFERENCE', f"{m['id']}: material/seção não declarado.")
        edge = tuple(sorted((m['start'], m['end'])))
        if edge in edges:
            fail('INVALID_GEOMETRY', 'Barras duplicadas/sobrepostas.')
        edges.add(edge)
        number(m['rotation_deg'], -360, 360, 'giro')
        flags(m['release_start']); flags(m['release_end'])
        if any(m['release_start'][:3] + m['release_end'][:3]):
            fail('UNSUPPORTED_RELEASE', 'Liberações translacionais não implementadas; não são substituídas por rigidez artificial.')
    supported = set()
    for support in data['supports']:
        obj(support, 'node restrained', 'apoio'); flags(support['restrained'])
        text(support['node'], 'apoio.node', True)
        if support['node'] not in ids['nodes'] or support['node'] in supported or not any(support['restrained']):
            fail('INVALID_REFERENCE', 'Apoio inexistente, repetido ou vazio.')
        supported.add(support['node'])
    for case in data['cases']:
        obj(case, 'id source', 'caso'); text(case['source'], 'fonte da carga')
    for load in data['nodal_loads']:
        obj(load, 'node case fx_n fy_n fz_n mx_nm my_nm mz_nm', 'carga')
        text(load['node'], 'carga.node', True); text(load['case'], 'carga.case', True)
        if load['node'] not in ids['nodes'] or load['case'] not in ids['cases']:
            fail('INVALID_REFERENCE', 'Carga referencia nó/caso inexistente.')
        for key in ('fx_n', 'fy_n', 'fz_n', 'mx_nm', 'my_nm', 'mz_nm'):
            number(load[key], -1e9, 1e9, key)
    if any(not any(l['case'] == case for l in data['nodal_loads']) for case in ids['cases']):
        fail('INCOMPLETE_MODEL', 'Declare as cargas de cada caso; peso próprio não é presumido.')
    for combo in data['combinations']:
        obj(combo, 'id factors', 'combinação')
        factors = combo['factors']
        if type(factors) is not dict or not factors or set(factors) - ids['cases']:
            fail('INVALID_COMBINATION', 'Combinação sem coeficientes explícitos ou com caso inexistente.')
        for factor in factors.values():
            number(factor, -100, 100, 'coeficiente')
        if not any(factors.values()):
            fail('INVALID_COMBINATION', 'Combinação com todos os coeficientes nulos.')
    return data
