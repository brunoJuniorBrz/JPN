"""Independent native-layout/dimension check after cad-sheets.test.ts."""
import math
from pathlib import Path
import sys
import ezdxf

path = Path(sys.argv[1] if len(sys.argv) > 1 else ".tools/int8/galpao.dxf")
doc = ezdxf.readfile(path)
audit = doc.audit()
assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
assert set(doc.layouts.names()) == {"Model", "PLANTA", "FRONTAL", "LATERAL", "CORTE A-A", "MATERIAIS 1"}
assert doc.units == 4
expected = {"BORDA/BEIRAL": 3000, "CUMEEIRA": 4000, "EIXOS TERÇAS": math.hypot(3000, 1000)}
seen = set()
for layout in doc.layouts:
    if layout.name == "Model":
        continue
    assert any(e.dxf.text == "PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE" for e in layout.query("TEXT"))
    for dim in layout.query("DIMENSION"):
        assert dim.dxf.geometry in doc.blocks
        label = dim.dxf.text.removesuffix(" <>")
        if label in expected:
            factor = doc.dimstyles.get(dim.dxf.dimstyle).dxf.dimlfac
            assert math.isclose(dim.get_measurement()*factor, expected[label], rel_tol=1e-12)
            seen.add(label)
assert seen == set(expected)
print("INT-8 DXF PASS: 5 paper layouts, mm dimensions, zero audit errors/fixes")
