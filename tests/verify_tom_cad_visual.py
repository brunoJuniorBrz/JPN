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

import sys
# Default: the Tom regression package; pass another package folder to check it.
OUT=Path(sys.argv[1] if len(sys.argv)>1 else ".tools/complete-package/tom")
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
        annotation_text=[]
        member_edges=[]
        for e in block:
            if e.dxftype()=="LWPOLYLINE":
                pts=[(v[0],v[1]) for v in e.get_points("xy")]
                if e.dxf.layer in ("PERFIS","COBERTURA","CONTRAVENTOS"):
                    coords.extend(pts)
                    member_edges.extend(zip(pts,pts[1:]))
                if e.dxf.layer=="MARCAS" and len(pts)==2:
                    leaders.append(pts)
            if e.dxftype()=="CIRCLE" and e.dxf.layer=="MARCAS":
                marks.append((e.dxf.center.x,e.dxf.center.y,e.dxf.radius))
            if e.dxftype()=="TEXT" and e.dxf.layer in ("MARCAS","PENDENCIAS"):
                p=e.dxf.get("align_point",e.dxf.insert)
                if p is None:p=e.dxf.insert
                h=e.dxf.height
                width=max(1,len(e.dxf.text))*h*0.85*0.56
                angle=math.radians(e.dxf.get("rotation",0))
                halfx=abs(math.cos(angle))*width/2+abs(math.sin(angle))*h/2
                halfy=abs(math.sin(angle))*width/2+abs(math.cos(angle))*h/2
                annotation_text.append((p.x-halfx,p.y-halfy,p.x+halfx,p.y+halfy))
        # Everything the viewport would hide: drawing, dimensions and texts must
        # lie inside the window (block units are paper mm, origin at the window).
        def points(container,depth=0,skip_notes=False):
            for e in container:
                t=e.dxftype()
                if t=="LWPOLYLINE":yield from ((v[0],v[1]) for v in e.get_points("xy"))
                elif t=="TEXT":
                    if not skip_notes or e.dxf.layer!="PENDENCIAS":yield (e.dxf.insert.x,e.dxf.insert.y)
                elif t=="CIRCLE":
                    c,r=e.dxf.center,e.dxf.radius;yield (c.x-r,c.y-r);yield (c.x+r,c.y+r)
                elif t=="DIMENSION" and depth<3 and e.dxf.get("geometry") in DOC.blocks:
                    yield from points(DOC.blocks[e.dxf.geometry],depth+1,skip_notes)
        every=list(points(block))
        # Pending notes sit in a fixed band at the top; they do not grow with scale.
        annotated=list(points(block,skip_notes=True))
        outside=sum(1 for x,y in every if x< -.5 or y< -.5 or x>vp.dxf.width+.5 or y>vp.dxf.height+.5)
        denominator=round(1/scale) if scale<1 else round(scale)
        standard=[20,25,50,75,100,125,150,200]
        larger=[v for v in standard if v<denominator]
        fits_larger=False
        if coords and larger:
            k=denominator/larger[-1]
            xs=[v[0] for v in coords];ys=[v[1] for v in coords]
            ax=[v[0] for v in annotated];ay=[v[1] for v in annotated]
            gw,gh=max(xs)-min(xs),max(ys)-min(ys)
            # Geometry grows with the scale; dimensions, bubbles and notes keep
            # their paper size. Both must stay inside the viewport window.
            fits_larger=gw*k+(max(ax)-min(ax)-gw)<=vp.dxf.width and gh*k+(max(ay)-min(ay)-gh)<=vp.dxf.height
        occupied=0
        if coords:
            xs=[v[0] for v in coords];ys=[v[1] for v in coords]
            occupied=(max(xs)-min(xs))*(max(ys)-min(ys))/(vp.dxf.width*vp.dxf.height)*100
        crossings=sum(cross(*leaders[i],*leaders[j]) for i in range(len(leaders)) for j in range(i+1,len(leaders)))
        through_pieces=sum(cross(*lead,*edge) for lead in leaders for edge in member_edges)
        overlap=sum(math.hypot(a[0]-b[0],a[1]-b[1]) < a[2]+b[2]-.01
            for i,a in enumerate(marks) for b in marks[i+1:])
        def box_overlap(a,b):
            return min(a[2],b[2])-max(a[0],b[0])>0.4 and min(a[3],b[3])-max(a[1],b[1])>0.4
        text_overlap=sum(box_overlap(a,b) for i,a in enumerate(annotation_text) for b in annotation_text[i+1:])
        metrics.append({"folha":index+1,"layout":layout.name,"vista_cache":matches[0].dxf.name,
          "escala":f"1:{scale:g}","area_util_vista_mm2":vp.dxf.width*vp.dxf.height,
          "ocupacao_geometria_percent":round(occupied,2),"pontos_fora_da_vista":outside,"escala_maior_caberia":fits_larger,"lideres":len(leaders),
          "cruzamentos_lideres":crossings,"lideres_atravessando_pecas":through_pieces,
          "sobreposicoes_baloes":overlap,"sobreposicoes_textos":text_overlap})
with (OUT/"medicoes-cad.json").open("w") as f:
    json.dump({"source":"DXF real do PR141 renderizado em PDF","metrics":metrics,
      "limits":["Ocupação por bbox de perfis/cobertura na viewport; não equivale a área real das peças",
       "Teste de balões verifica círculos e cruzamento estrito de linhas MARCAS; anotações e cotas requerem verificação visual",
       "Geometria Tom esquemática, sem validação de apoios, ligações ou elevação real"]},f,ensure_ascii=False,indent=2, default=lambda o:o.item() if hasattr(o,"item") else str(o))
baseline=Path("validation/tom-2026/cad-pr141-before-metrics.json")
if baseline.exists():
    before=json.loads(baseline.read_text("utf-8"))
    after=next((r for r in metrics if r["layout"]=="PLANTAS"),None)
    comparison={"baseline":before["sheet1"],"after":after,
      "area_definition":"bbox das linhas PERFIS+COBERTURA em cada viewport; base comparável por viewport"}
    (OUT/"comparativo-cad-antes-depois.json").write_text(
      json.dumps(comparison,indent=2,ensure_ascii=False, default=lambda o:o.item() if hasattr(o,"item") else str(o)),encoding="utf-8")
with (OUT/"medicoes-cad.csv").open("w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=list(metrics[0]),delimiter=";");w.writeheader();w.writerows(metrics)
principal=[r for r in metrics if r["layout"]=="PLANTAS"]
assert len(principal)==1, "Esperada uma vista principal de cobertura isolada na prancha de plantas"
assert principal[0]["ocupacao_geometria_percent"]>=50 or not principal[0]["escala_maior_caberia"], (
    "Planta pequena e a escala maior seguinte caberia: "+str(principal[0])
)
assert all(r["pontos_fora_da_vista"]==0 for r in metrics), ("Conteúdo fora da janela da vista (cortado no AutoCAD)",
    [(r["folha"],r["layout"],r["pontos_fora_da_vista"]) for r in metrics if r["pontos_fora_da_vista"]])
assert all(not r["escala_maior_caberia"] for r in metrics), ("Vista poderia usar escala maior",
    [(r["folha"],r["layout"],r["escala"]) for r in metrics if r["escala_maior_caberia"]])
assert all(r["cruzamentos_lideres"]==0 for r in metrics), "Cruzamento de leaders na impressão"
assert all(r["sobreposicoes_baloes"]==0 for r in metrics), "Balões colidem na impressão"
assert all(r["sobreposicoes_textos"]==0 for r in metrics), "Textos MARCAS colidem na impressão"
assert all(r["lideres_atravessando_pecas"]==0 for r in metrics), "Líderes atravessam peças de outras linhas"
print(json.dumps({"pages":len(PDF),"views":len(metrics),
    "min_occupancy":min((v["ocupacao_geometria_percent"] for v in metrics),default=0),
    "scales":[(r["folha"],r["escala"],r["ocupacao_geometria_percent"]) for r in metrics]},
    ensure_ascii=False, default=lambda o:o.item() if hasattr(o,"item") else str(o)))
