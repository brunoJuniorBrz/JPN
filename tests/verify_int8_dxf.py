"""Independent native-paper/viewport/geometry checks after cad-sheets.test.ts."""
import math
from pathlib import Path
import sys
import ezdxf
from ezdxf import bbox

NOTICE = "PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE"


def verify(path):
    doc = ezdxf.readfile(path)
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
    assert doc.units == 4
    assert doc.header["$PSLTSCALE"] == 1 and doc.header["$LWDISPLAY"] == 1
    papers = [p for p in doc.layouts if p.name != "Model"]
    names = [p.name for p in papers]
    assert len(set(names)) == len(names)
    for name in ["PLANTAS", "ELEVACOES", "BASES", "NOTAS", "MATERIAIS"]:
        assert name in names, name
    is_a1 = "A1" in papers[0].dxf.paper_size
    width, height = (841, 594) if is_a1 else (420, 297)
    cache = {i.dxf.name: i for i in doc.modelspace().query("INSERT") if i.dxf.name.startswith("JPN_VISTA_")}
    seen_views = set()
    index_text = " ".join(e.dxf.text for page in papers if page is papers[0] or page.name.startswith("INDICE CONTINUACAO") for e in page.query("TEXT"))
    for i, page in enumerate(papers, 1):
        text = [e.dxf.text for e in page.query("TEXT")]
        assert NOTICE in text
        assert f"Folha {i} de {len(papers)}" in text
        assert any(t.startswith("Responsável técnico: ___") for t in text)
        assert any(t.startswith("CREA: ___") and "ART: ___" in t for t in text)
        assert "Quadro de revisões" in text
        title = next(e.dxf.text for e in page.query("TEXT") if e.dxf.height == 4.5)
        assert title in index_text
        assert page.dxf.paper_width == width and page.dxf.paper_height == height
        assert page.dxf.plot_layout_flags & 128  # print actual layer lineweights
        assert tuple(page.dxf.ucs_origin) == (0, 0, 0)
        assert tuple(page.dxf.extmax) == (width, height, 0)
        main = [v for v in page.query("VIEWPORT") if v.dxf.id == 1]
        assert len(main) == 1 and main[0].dxf.status == 1
        # Check actual font extents: no sheet text crosses the frame.
        for entity in page.query("TEXT"):
            box = bbox.extents([entity], fast=True)
            assert box.extmin.x >= 25 and box.extmax.x <= width-10, (page.name, entity.dxf.text, box)
            assert box.extmin.y >= 10 and box.extmax.y <= height-10, (page.name, entity.dxf.text, box)
        for vp in page.query("VIEWPORT"):
            if vp.dxf.id == 1:
                continue
            assert vp.dxf.status > 1 and vp.dxf.flags & 16384
            denominator = vp.dxf.view_height / vp.dxf.height
            assert denominator in [20, 25, 50, 75, 100, 200, 250, 500, 750, 1000]
            # Match the window to its scaled projection cache, proving it is not an empty/fake viewport.
            matches = [ins for ins in cache.values() if math.isclose(ins.dxf.insert.x + vp.dxf.width/2*denominator,
                                                                    vp.dxf.view_center_point.x, abs_tol=1e-7)]
            assert len(matches) == 1
            ins = matches[0]
            assert ins.dxf.xscale == ins.dxf.yscale == denominator
            block = doc.blocks[ins.dxf.name]
            assert list(block.query("DIMENSION")) and list(block.query('CIRCLE[layer=="EIXOS"]'))
            assert any(e.dxf.text.endswith(" mm") for e in block.query('TEXT[layer=="COTAS"]'))
            assert not any("Ue 150" in e.dxf.text for e in block.query("TEXT"))
            balloons = list(block.query('CIRCLE[layer=="MARCAS"]'))
            for j, c in enumerate(balloons):
                for other in balloons[j+1:]:
                    assert c.dxf.center.distance(other.dxf.center) >= c.dxf.radius+other.dxf.radius+1-1e-9
            seen_views.add(ins.dxf.name)
    assert seen_views == set(cache)
    for name, color, weight in [("EIXOS", 8, 18), ("PERFIS", 7, 50), ("TEXTOS", 7, 25),
                                ("COTAS", 2, 25), ("PENDENCIAS", 1, 35)]:
        assert doc.layers.get(name).dxf.color == color
        assert doc.layers.get(name).dxf.lineweight == weight
    assert doc.layers.get("EIXOS").dxf.linetype == "JPN_EIXO"
    assert doc.styles.get("JPN_TEXTO").dxf.font == "Arial.ttf"
    all_text = [e.dxf.text for p in papers for e in p.query("TEXT")]
    all_text += [e.dxf.text for block in doc.blocks for e in block.query("TEXT")]
    assert "PENDENTE DE PROJETO (A4/A5)" in all_text
    if path.name.startswith("galpao"):
        assert len(papers) == 6
        assert "PORTICO 1" in names and "PORTICO 2" not in names
        expected = {"BORDA/BEIRAL": {3000, 4000}, "CUMEEIRA": {4000}, "EIXOS TERÇAS": {math.hypot(3000, 1000)},
                    "EIXOS A-B": {6000}, "VÃO Y 1-2": {4000}}
        seen = set()
        for name in cache:
            for dim in doc.blocks[name].query("DIMENSION"):
                label = next(tag.value for tag in dim.get_xdata("JPN_COTA") if tag.code == 1000)
                assert dim.dxf.text == "<>"  # regeneration must keep numeric-only text
                assert dim.dxf.geometry in doc.blocks
                assert any(math.hypot(p[0]-dim.dxf.defpoint.x, p[1]-dim.dxf.defpoint.y) < 1e-9
                           for line in doc.blocks[dim.dxf.geometry].query("LWPOLYLINE") for p in line.get_points())
                factor = doc.dimstyles.get(dim.dxf.dimstyle).dxf.dimlfac
                assert doc.dimstyles.get(dim.dxf.dimstyle).dxf.dimtxt == 2.5
                if label in expected:
                    measurement = dim.get_measurement()*factor
                    assert any(math.isclose(measurement, value, rel_tol=1e-12) for value in expected[label])
                    seen.add(label)
        assert seen == set(expected), seen
        assert len(list(doc.modelspace().query("LINE"))) == 9
        # Independent section geometry: 2 slopes share a single high point, no duplicates.
        roof = list(doc.blocks["JPN_VISTA_5"].query('LWPOLYLINE[layer=="COBERTURA"]'))
        assert len(roof) == 2
        ends = [tuple(p[:2]) for line in roof for p in line.get_points()]
        high = max(p[1] for p in ends)
        ridge = [p for p in ends if p[1] == high]
        assert len(ridge) == 2 and ridge[0] == ridge[1]
        materials = [e.dxf.text for e in doc.layouts.get("MATERIAIS").query("TEXT")]
        assert all(value in materials for value in ["24000", "12000", "753.6", "188.4"])
        assert any("9 peças; 36000 mm; 942 kg" in s for s in materials)
    if path.name == "garagem-reacoes.dxf":
        assert all(value in all_text for value in ["G_ONLY", "W_ONLY", "3.6", "-5.4", "Fx (kN)", "Mz (kNm)"])
        assert "input_sha256=" in " ".join(e.dxf.text for e in doc.layouts.get("NOTAS").query("TEXT"))
    print(f"INT-8 DXF PASS: {path.name}, {len(papers)} {('A1' if is_a1 else 'A3')} sheets; native locked viewports; zero errors/fixes")


if __name__ == "__main__":
    paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else [Path(".tools/int8") / name for name in ("galpao.dxf", "galpao-a1.dxf", "garagem-reacoes.dxf")]
    for path in paths:
        verify(path)
