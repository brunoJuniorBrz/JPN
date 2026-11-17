"""Independent native-layout/dimension check after cad-sheets.test.ts."""
import math
from pathlib import Path
import sys
import ezdxf

NOTICE = "PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE"


def verify(path):
    doc = ezdxf.readfile(path)
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
    assert doc.units == 4
    papers = [layout for layout in doc.layouts if layout.name != "Model"]
    names = [p.name for p in papers]
    assert len(set(names)) == len(names)
    for name in ["INDICE 1", "PLANTA", "FRONTAL", "LATERAL", "CORTE A-A", "TERCAS E CONTRAVENTOS",
                 "BASES E CHUMBADORES", "BASES POSICOES 1", "RASTREIO REACOES 1", "NOTAS GERAIS 1", "MATERIAIS 1"]:
        assert name in names, name
    is_a1 = "A1" in doc.layouts.get("PLANTA").dxf.paper_size
    width, height = (841, 594) if is_a1 else (420, 297)
    index_text = " ".join(e.dxf.text for p in papers if p.name.startswith("INDICE ") for e in p.query("TEXT"))
    for i, layout in enumerate(papers, 1):
        text = [e.dxf.text for e in layout.query("TEXT")]
        assert NOTICE in text
        assert f"Folha {i} de {len(papers)}" in text
        assert any(t.startswith("Responsável técnico: ___") for t in text)
        assert any(t.startswith("CREA: ___") and "ART: ___" in t for t in text)
        assert layout.name in index_text
        assert layout.dxf.paper_width == width and layout.dxf.paper_height == height
        assert tuple(layout.dxf.ucs_origin) == (0, 0, 0)
        assert tuple(layout.dxf.extmax) == (width, height, 0)
        for dim in layout.query("DIMENSION"):
            assert dim.dxf.geometry in doc.blocks
            style = doc.dimstyles.get(dim.dxf.dimstyle)
            assert style.dxf.dimlfac > 0 and style.dxf.dimtxt == 2.5
            assert style.dxf.dimtxsty == "JPN_TEXTO"
    for name in ["PLANTA", "FRONTAL", "LATERAL", "TERCAS E CONTRAVENTOS"]:
        layout = doc.layouts.get(name)
        assert list(layout.query('CIRCLE[layer=="EIXOS"]'))
        assert list(layout.query('DIMENSION[layer=="COTAS"]'))
    assert doc.layers.get("EIXOS").dxf.linetype == "JPN_EIXO"
    for layer, color, weight in [("EIXOS", 8, 13), ("PERFIS", 7, 35), ("CARIMBO", 7, 50), ("CONTRAVENTOS", 6, 25), ("COTAS", 2, 13)]:
        assert doc.layers.get(layer).dxf.color == color
        assert doc.layers.get(layer).dxf.lineweight == weight
    assert doc.styles.get("JPN_TEXTO").dxf.font == "Arial.ttf"
    bases = doc.layouts.get("BASES E CHUMBADORES")
    assert any("PENDENTE DE PROJETO" in e.dxf.text and "A4/A5" in e.dxf.text for e in bases.query("TEXT"))
    if path.name.startswith("galpao"):
        assert "PORTICO 1" in names and "PORTICO 2" not in names
        assert any(e.dxf.text.startswith("2× PORTICO:") for e in doc.layouts.get("PORTICO 1").query("TEXT"))
        expected = {"BORDA/BEIRAL": 3000, "CUMEEIRA": 4000, "EIXOS TERÇAS": math.hypot(3000, 1000), "EIXOS A-B": 6000, "VÃO Y 1-2": 4000}
        seen = set()
        for layout in papers:
            for dim in layout.query("DIMENSION"):
                label = dim.dxf.text.removesuffix(" <>")
                if label in expected:
                    factor = doc.dimstyles.get(dim.dxf.dimstyle).dxf.dimlfac
                    assert math.isclose(dim.get_measurement()*factor, expected[label], rel_tol=1e-12)
                    seen.add(label)
        assert seen == set(expected), seen
        assert len(list(doc.modelspace().query("LINE"))) == 9
    if path.name == "garagem-reacoes.dxf":
        assert "REACOES 1" in names
        rows = list(doc.layouts.get("REACOES 1").query("TEXT"))
        text = [e.dxf.text for e in rows]
        assert all(value in text for value in ["G_ONLY", "W_ONLY", "3.6", "-5.4", "Fx (kN)", "Mz (kNm)"])
        assert any("input_sha256=" in e.dxf.text for e in doc.layouts.get("RASTREIO REACOES 1").query("TEXT"))
    print(f"INT-8 DXF PASS: {path.name}, {len(papers)} native {('A1' if is_a1 else 'A3')} sheets; zero errors/fixes")


paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else [Path(".tools/int8") / name for name in ("galpao.dxf", "galpao-a1.dxf", "garagem-reacoes.dxf")]
for path in paths:
    verify(path)
