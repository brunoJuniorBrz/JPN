"""Bounded orchestration of EXISTING verified member procedures, not a solver.

One private exact geometry cache per worker; no tolerance or equation changes.
"""
from .frame3d_model import obj, fail, input_hash, text
from .coldformed_geometry import analyze_verified_coldformed


def analyze_verified_batch(raw):
    obj(raw, 'schema_version requests', 'verified member batch')
    if raw['schema_version'] != 'jpn.verified-coldformed-batch/1':
        fail('UNSUPPORTED_MODEL', 'Verified coldformed batch version required')
    requests = raw['requests']
    if type(requests) is not list or not 1 <= len(requests) <= 4:
        fail('INPUT_LIMIT', 'One through four explicit member/combination requests required')
    keys = [(r.get('design', {}).get('piece_id'), r.get('design', {}).get('combination_id'))
            for r in requests if type(r) is dict and type(r.get('design')) is dict]
    for piece, combination in keys:
        text(piece, 'member identity')
        text(combination, 'combination identity')
    if len(keys) != len(requests) or len(set(keys)) != len(keys):
        fail('INVALID_INPUT', 'Missing or duplicated member/combination identity')
    geometry_cache = {}
    results = [analyze_verified_coldformed(r, _geometry_cache=geometry_cache) for r in requests]
    return dict(schema_version='jpn.verified-coldformed-batch-result/1',
                input_sha256=input_hash(raw), results=results,
                geometry_evaluations=len(geometry_cache), geometry_reuses=len(results)-len(geometry_cache),
                computed_structural_approval=False, approved_for_fabrication=False)
