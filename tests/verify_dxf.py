"""Reopen JS-generated DXF using independent ezdxf and audit its structure."""
import json
import math
from pathlib import Path

import ezdxf

doc = ezdxf.readfile("test-results/cad/structure.dxf")
assert doc.units == 4, "DXF must use mm"
auditor = doc.audit()
assert not auditor.has_errors, auditor.errors
lines = list(doc.modelspace().query("LINE"))
expected = json.loads(Path("test-results/cad/expected.json").read_text())
assert len(lines) == len(expected)
for line, ends in zip(lines, expected):
    for actual, node in zip((line.dxf.start, line.dxf.end), ends):
        assert all(math.isclose(a, node[key], rel_tol=1e-12, abs_tol=1e-8) for a, key in zip(actual, ("x", "y", "z")))
print(f"ezdxf {ezdxf.__version__}: {len(lines)} 3D lines verified, units mm, no audit errors")
