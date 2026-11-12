import pytest
from jpn_structural.model import AnalysisError
from jpn_structural.verified_design_batch import analyze_verified_batch


@pytest.mark.parametrize('raw', [
    {'schema_version': 'wrong', 'requests': []},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': []},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': [{}] * 5},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': [None]},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': [
        {'design': {'piece_id': 'P', 'combination_id': 'C'}},
        {'design': {'piece_id': 'P', 'combination_id': 'C'}}]},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': [
        {'design': {'piece_id': [], 'combination_id': 'C'}}]},
    {'schema_version': 'jpn.verified-coldformed-batch/1', 'requests': [], 'geometry_cache': {}},
])
def test_invalid_or_unbounded_batch_is_rejected_before_optional_geometry_imports(raw):
    with pytest.raises(AnalysisError):
        analyze_verified_batch(raw)
