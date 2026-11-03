"""Offline executable for the isolated NBR14762 single-bolt component evaluator.

Example (no JPN UI or project integration):
  python engine/check_single_bolt.py engine/examples/single-bolt-14762.json
An isolated PASS never approves a complete connection or fabrication.
"""
import argparse
import json
import sys
from pathlib import Path
from jpn_structural.single_bolt_14762 import BoltCheckError, check_single_bolt


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise BoltCheckError('INVALID_INPUT', 'Duplicate JSON key: ' + key)
        value[key] = item
    return value


def _constant(value):
    raise BoltCheckError('INVALID_INPUT', 'Nonfinite JSON number: ' + value)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Isolated ABNT NBR 14762:2010 §10.3 bolt checks, NOT a complete connection design')
    parser.add_argument('input_json', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    try:
        data = args.input_json.read_bytes()
        if len(data) > 500000:
            raise BoltCheckError('INPUT_LIMIT', 'Input must not exceed 500 kB')
        raw = json.loads(data.decode('utf8'), object_pairs_hook=_unique, parse_constant=_constant)
        result = check_single_bolt(raw)
        output = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if args.output:
            args.output.write_text(output, encoding='utf8')
        else:
            sys.stdout.write(output)
        return 0 if result['status'] == 'PASS-ISOLATED-CHECKS-ONLY' else 2
    except (BoltCheckError, OSError, UnicodeError, ValueError) as exc:
        code = getattr(exc, 'code', 'INPUT_ERROR')
        sys.stderr.write(f'{code}: {exc}\n')
        return 3


if __name__ == '__main__':
    sys.exit(main())
