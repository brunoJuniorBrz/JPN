"""CLI local: python -m engine < arquivo.json > resultado.json."""
from __future__ import annotations
import json
import sys
from .truss2d import AnalysisError, analyze

def main() -> int:
    try:
        result = analyze(json.load(sys.stdin))
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
        return 0
    except (AnalysisError, json.JSONDecodeError) as error:
        print(json.dumps({"status":"ERROR_NO_RESULTS","error":str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
