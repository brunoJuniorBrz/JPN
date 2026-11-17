"""Independent ZIP/CSV/hash/DXF checks; --render also requires PyMuPDF and Pillow."""
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import zipfile
import ezdxf

root = Path('.tools/complete-package')
for case in ('regular', 'irregular'):
    folder = root/case
    manifest = json.loads((folder/'manifesto.json').read_text('utf-8'))
    project = json.loads((folder/'rastreabilidade/projeto.json').read_text('utf-8'))
    assert manifest['fabricationRelease'] is False
    assert manifest['computedStructuralApproval'] is False
    assert manifest['releaseGate'] == 'NOT_READY_BLOCKED'
    with zipfile.ZipFile(folder/'pacote.zip') as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(manifest['files'])+1
        assert len(set(archive.namelist())) == len(archive.namelist())
        prefix = archive.namelist()[0].split('/')[0]
        for entry in manifest['files']:
            data = archive.read(prefix+'/'+entry['name'])
            assert data == (folder/entry['name']).read_bytes()
            assert len(data) == entry['bytes']
            assert hashlib.sha256(data).hexdigest() == entry['sha256']
    doc = ezdxf.readfile(folder/'cad/pranchas.dxf')
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (case, audit.errors, audit.fixes)
    sheets = [p for p in doc.layouts if p.name != 'Model']
    assert len(sheets) == len(manifest['pages'])
    rows = list(csv.DictReader(io.StringIO((folder/'materiais/lista.csv').read_text('utf-8-sig')), delimiter=';'))
    cuts = list(csv.DictReader(io.StringIO((folder/'corte/plano.csv').read_text('utf-8-sig')), delimiter=';'))
    assert len(rows) == manifest['totals']['quantity'] == len(cuts)
    assert {p['ID'] for p in rows} == {p['ID peça'] for p in cuts}
    assert len({p['ID peça'] for p in cuts}) == len(cuts)
    assert math.isclose(sum(float(p['Comprimento geométrico mm']) for p in rows)/1000, manifest['totals']['lengthM'], rel_tol=1e-12)
    for p in rows:
        c = next(c for c in cuts if c['ID peça'] == p['ID'])
        # packBars rounds UP to integer micrometres; do not compare to rounded drawing labels.
        assert 0 <= float(c['Corte mm'])-float(p['Comprimento geométrico mm']) < .00100001
    if project['workspace'].get('physicalStructure'):
        structure = project['workspace']['physicalStructure']
        nodes = {n['id']: n for n in structure['nodes']}
        lines = list(doc.modelspace().query('LINE'))
        for piece, line in zip(structure['pieces'], lines, strict=True):
            for endpoint, field in [('start', 'start'), ('end', 'end')]:
                node = nodes[piece[endpoint]]
                assert all(math.isclose(a, node[k], abs_tol=1e-9) for a, k in zip(line.dxf.get(field), ('x', 'y', 'z')))
    if '--render' in sys.argv:
        import fitz
        from PIL import Image, ImageDraw
        pdf = fitz.open(folder/'pranchas/pranchas.pdf')
        assert len(pdf) == len(sheets)
        thumbs = []
        for i, page in enumerate(pdf):
            assert abs(page.rect.width*25.4/72-manifest['pages'][i]['widthMm']) < .01
            assert f'Folha {i+1} de {len(pdf)}' in page.get_text()
            path = folder/f'page-{i+1:02d}.png'
            page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(path)
            image = Image.open(path).convert('RGB');image.thumbnail((630,450));thumbs.append(image.copy())
        canvas = Image.new('RGB',(1260,480*math.ceil(len(thumbs)/2)),'#dddddd')
        draw = ImageDraw.Draw(canvas)
        for i, image in enumerate(thumbs):
            x,y=(i%2)*630,(i//2)*480
            draw.text((x+8,y+3),f'{case}: folha {i+1}',fill='black');canvas.paste(image,(x,y+22))
        canvas.save(folder/'contact-sheet.png')
        memorial = fitz.open(folder/'memorial/quantitativos.pdf')
        assert 'Memorial' in memorial[0].get_text()
    print(f'{case}: ZIP, SHA256, CSV, {len(rows)} peças, {len(sheets)} layouts, DXF zero erros/reparos OK')
