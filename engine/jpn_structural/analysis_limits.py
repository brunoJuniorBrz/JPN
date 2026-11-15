"""Execution limits of the mixed analysis, DERIVED from the transport budgets instead of a fixed count.

A request may carry as many combinations as the single-envelope result still fits in the output cap
(2 MB, `app.py` OUTPUT_BYTES and the Node runner) with the SAME input hash. The per-element byte counts
were measured on real /3 results (node 185 B, frame member with 5 stations 1227 B, equilibrium 156 B)
and rounded UP with a safety margin; `tests/test_analysis_limits.py` checks the estimate against real
output. The TypeScript mirror lives in `src/domain/analysis-limits.ts` and a test keeps both equal.
"""
OUTPUT_BYTES = 2_000_000          # transport cap on the response (HTTP backend and local runner)
SAFETY_FRACTION = 0.95            # never plan to use the very last bytes of the cap
MAX_CASES = 40                    # structural cap on load cases (was 10)
MAX_COMBINATIONS = 256            # hard cap; the derived budget is normally lower
NODE_BYTES, FRAME_BYTES, AXIAL_BYTES, COMBINATION_OVERHEAD_BYTES = 230, 1400, 160, 400
FIXED_BYTES, FRAME_FIXED_BYTES, LOAD_TRACE_BYTES = 4000, 700, 350


def bytes_per_combination(nodes, frame_members, axial_members):
    return nodes*NODE_BYTES + frame_members*FRAME_BYTES + axial_members*AXIAL_BYTES + COMBINATION_OVERHEAD_BYTES


def fixed_bytes(frame_members, member_loads=0, self_weight_members=0):
    return FIXED_BYTES + frame_members*FRAME_FIXED_BYTES + (member_loads + self_weight_members)*LOAD_TRACE_BYTES


def combination_limit(nodes, frame_members, axial_members, member_loads=0, self_weight_members=0):
    """Largest number of combinations whose single result is estimated to fit under the output cap."""
    room = OUTPUT_BYTES*SAFETY_FRACTION - fixed_bytes(frame_members, member_loads, self_weight_members)
    return max(0, min(MAX_COMBINATIONS, int(room // bytes_per_combination(nodes, frame_members, axial_members))))
