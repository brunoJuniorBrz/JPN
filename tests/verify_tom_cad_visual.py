"""Independent PDF/DXF visual QA of native Tom project. Reports measured values.

This is NOT a structural appraisal. Geometry placements are schematic;
height datum Z=3000 mm and four loose members have no surveyed location.
"""
from pathlib import Path
import csv
import json
import math
import fitz
import ezdxf

OUT=Path(".tools/complete-package/tom")
DOC=ezdxf.readfile(OUT/"cad/pranchas.dxf")
audit=DOC.audit()
assert not audit.errors and not audit.fixes, (audit.errors,audit.fixes)
PDF=fitz.open(OUT/"pranchas/pranchas.pdf")
manifest=json.loads((OUT/"manifesto.json").read_text())
assert len(PDF)==len(DOC.layouts)-1==len(manifest["pages"])
model_inserts=[e for e in DOC.modelspace().query("INSERT") if e.dxf.name.startswith("JPN_VISTA_")]
metrics=[]
def cross(a,b,c,d):
    def o(p,q,r):return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
    return o(a,b,c)*o(a,b,d)<-1e-8 and o(c,d,a)*o(c,d,b)<-1e-8
for index,layout in enumerate(p for p in DOC.layouts if p.name!="Model"):
    page=PDF[index]
    assert "PRELIMINAR" in page.get_text()
    for vp in layout.query("VIEWPORT"):
        if vp.dxf.id==1:continue
        scale=vp.dxf.view_height/vp.dxf.height
        matches=[ins for ins in model_inserts if math.isclose(
           ins.dxf.insert.x + vp.dxf.width*scale/2,
           vp.dxf.view_center_point.x,abs_tol=.00001)]
        if len(matches)!=1:
            raise ValueError(f"viewport {index+1}: cache count {len(matches)}")
        block=DOC.blocks[matches[0].dxf.name]
        coords=[]
        leaders=[]
        marks=[]
        for e in block:
            if e.dxftype()=="LWPOLYLINE":
                pts=[(v[0],v[1]) for v in e.get_points("xy")]
                if e.dxf.layer in ("PERFIS","COBERTURA","CONTRAVENTOS"):
                    coords.extend(pts)
                if e.dxf.layer=="MARCAS" and len(pts)==2:
                    leaders.append(pts)
            if e.dxftype()=="CIRCLE" and e.dxf.layer=="MARCAS":
                marks.append((e.dxf.center.x,e.dxf.center.y,e.dxf.radius))
        occupied=0
        if coords:
            xs=[v[0] for v in coords];ys=[v[1] for v in coords]
            occupied=(max(xs)-min(xs))*(max(ys)-min(ys))/(vp.dxf.width*vp.dxf.height)*100
        crossings=sum(cross(*leaders[i],*leaders[j]) for i in range(len(leaders)) for j in range(i+1,len(leaders)))
        overlap=sum(math.hypot(a[0]-b[0],a[1]-b[1]) < a[2]+b[2]-.01
            for i,a in enumerate(marks) for b in marks[i+1:])
        metrics.append({"folha":index+1,"layout":layout.name,"vista_cache":matches[0].dxf.name,
          "escala":f"1:{scale:g}","area_util_vista_mm2":vp.dxf.width*vp.dxf.height,
          "ocupacao_geometria_percent":round(occupied,2),"lideres":len(leaders),
          "cruzamentos_lideres":crossings,"sobreposicoes_baloes":overlap})
with (OUT/"medicoes-cad.json").open("w") as f:
    json.dump({"source":"DXF real do PR141 renderizado em PDF","metrics":metrics,
      "limits":["Ocupação por bbox de perfis/cobertura na viewport; não equivale a área real das peças",
       "Teste de balões verifica círculos e cruzamento estrito de linhas MARCAS; anotações e cotas requerem verificação visual",
       "Geometria Tom esquemática, sem validação de apoios, ligações ou elevação real"]},f,ensure_ascii=False,indent=2)
with (OUT/"medicoes-cad.csv").open("w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=list(metrics[0]),delimiter=";");w.writeheader();w.writerows(metrics)
assert all(r["cruzamentos_lideres"]==0 for r in metrics), "Cruzamento de leaders na impressão"
assert all(r["sobreposicoes_baloes"]==0 for r in metrics), "Balões colidem na impressão"
print(json.dumps({"pages":len(PDF),"views":len(metrics),
    "min_occupancy":min((v["ocupacao_geometria_percent"] for v in metrics),default=0),
    "scales":[(r["folha"],r["escala"],r["ocupacao_geometria_percent"]) for r in metrics]},
    ensure_ascii=False))
