"""JSON stdin -> JSON stdout; errors have no forces/displacements and exit 2."""

import json
import sys

from . import AnalysisError, analyze


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise AnalysisError("INVALID_INPUT", f"Repeated JSON key {key}")
        result[key] = value
    return result


def main():
    try:
        text = sys.stdin.read(1_000_001)
        if len(text) > 1_000_000:
            raise AnalysisError("INVALID_INPUT", "JSON request exceeds 1 MB")
        result = analyze(json.loads(text, object_pairs_hook=_unique_object))
    except (ValueError, RecursionError) as exc:
        print(json.dumps({"status": "error", "error": {"code": getattr(exc, "code", "INVALID_INPUT"), "message": str(exc)}}))
        return 2
    print(json.dumps(result, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
