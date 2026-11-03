import type { ConnectionDeclaration } from "./connections";
import { comparePhysicalProperty } from "./property-precision";

/** Pure geometry. Computed area is one EXPLICIT straight centre-row cut,
 * never a governing effective/net resistant section or a rupture capacity. */
export function auditConnectionGeometry(connection:ConnectionDeclaration){
  const g=connection.transferGeometry,issues:{code:string;message:string;severity:"error"|"pending"}[]=[],add=(code:string,message:string,severity:"error"|"pending"="error")=>{if(issues.length<100)issues.push({code,message,severity});};
  if(!g)return {status:"pending-data" as const,issues:[{code:"GEOMETRY_MISSING",message:"Furação estruturada ausente.",severity:"pending" as const}],holes:[],pitches:[],section:null,resistanceVerified:false as const};
  const plate=g.rectangularPlate,res=plate?.coordinateResolutionMm??0,fp=(...v:number[])=>64*Number.EPSILON*Math.max(...v.map(Math.abs),1),close=(a:number,b:number,scale=res*2)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=scale+fp(a,b);
  const known=g.holes.filter(h=>h.yMm!==null&&h.zMm!==null&&h.diameterMm!==null),positions=new Map(known.map(h=>[h.id,h]));
  if(known.length!==g.holes.length)add("HOLE_DATA_MISSING","Coordenadas/diâmetros ausentes impedem conferência integral.","pending");
  const pitches=g.pitches.map(p=>{const a=positions.get(p.fromHole),b=positions.get(p.toHole);if(!a||!b||p.distanceMm===null){add("PITCH_DATA_MISSING","Passo sem coordenadas/distância completa.","pending");return {from:p.fromHole,to:p.toHole,computedMm:null};}const d=Math.hypot(a.yMm!-b.yMm!,a.zMm!-b.zMm!);if(!close(d,p.distanceMm))add("PITCH_MISMATCH",`${p.fromHole}/${p.toHole}: passo declarado ${p.distanceMm} mm; coordenadas resultam ${d} mm.`);return {from:p.fromHole,to:p.toHole,computedMm:d};});
  for(let i=0;i<known.length;i++)for(let j=0;j<i;j++){const a=known[i],b=known[j];if(a.componentId===b.componentId&&Math.hypot(a.yMm!-b.yMm!,a.zMm!-b.zMm!)<(a.diameterMm!+b.diameterMm!)/2-fp(a.yMm!,a.zMm!,b.yMm!,b.zMm!))add("HOLE_COLLISION",`${a.id}/${b.id}: furos se interceptam na mesma peça física.`);}
  const holes=known.map(h=>{
    if(!plate||h.componentId!==plate.componentId)return {id:h.id,nearestEdgeYMm:null,nearestEdgeZMm:null};
    const ey=Math.min(h.yMm!-plate.originYMm,plate.originYMm+plate.widthYMm-h.yMm!),ez=Math.min(h.zMm!-plate.originZMm,plate.originZMm+plate.heightZMm-h.zMm!);
    if(Math.min(ey,ez)<h.diameterMm!/2-fp(ey,ez,h.diameterMm!))add("HOLE_OUTSIDE_PLATE",`${h.id}: circunferência ultrapassa a chapa.`);
    if(h.edgeYMm!==null&&!close(ey,h.edgeYMm)||h.edgeZMm!==null&&!close(ez,h.edgeZMm))add("EDGE_DISTANCE_MISMATCH",`${h.id}: distância ao bordo mais próximo difere das coordenadas.`);
    return {id:h.id,nearestEdgeYMm:ey,nearestEdgeZMm:ez};
  });
  let section:{grossAreaMm2:number;straightCutNetAreaMm2:number;cutCoordinateMm:number;holeIds:string[];governingNetSectionVerified:false}|null=null;
  if(!plate)add("PLATE_GEOMETRY_MISSING","Retângulo, espessura, origem e precisão da chapa não declarados; áreas digitadas não verificadas.","pending");
  else{
    const component=connection.components.find(c=>c.id===plate.componentId);
    if(component?.kind!=="plate")add("PLATE_COMPONENT_MISSING","Geometria deve referir componente chapa existente.");
    else if(component.widthMm===null||component.heightMm===null||component.thicknessMm===null)add("PLATE_COMPONENT_PENDING","Dimensões do componente chapa incompletas.","pending");
    else if(!close(component.widthMm,plate.widthYMm)||!close(component.heightMm,plate.heightZMm)||!close(component.thicknessMm,plate.thicknessMm))add("PLATE_DIMENSION_MISMATCH","Geometria estruturada e dimensões da chapa divergem.");
    if(known.some(h=>h.componentId!==plate.componentId))add("MULTIPLE_PLATES_UNSUPPORTED","Esta auditoria de área abrange uma chapa explicitamente referenciada.","pending");
    const cut=plate.netCutCoordinateMm,along=plate.loadAxis==="y"?"yMm":"zMm",width=plate.loadAxis==="y"?plate.heightZMm:plate.widthYMm,origin=plate.loadAxis==="y"?plate.originYMm:plate.originZMm,span=plate.loadAxis==="y"?plate.widthYMm:plate.heightZMm;
    if(cut===null)add("NET_CUT_MISSING","Posição da seção reta explicitamente declarada necessária.","pending");
    else if(cut<origin||cut>origin+span)add("NET_CUT_OUTSIDE_PLATE","Corte fora da chapa.");
    else{
      const intersected=known.filter(h=>h.componentId===plate.componentId&&Math.abs(h[along]!-cut)<h.diameterMm!/2),noncentral=intersected.some(h=>!close(h[along]!,cut,res));
      if(noncentral)add("NET_CUT_UNSUPPORTED","Corte cruza furo fora do centro; não se presume trajetória resistente ou correção de escalonamento.","pending");
      else if(!issues.some(i=>i.severity==="error")&&known.length===g.holes.length){
        const gross=width*plate.thicknessMm,net=(width-intersected.reduce((s,h)=>s+h.diameterMm!,0))*plate.thicknessMm;
        section={grossAreaMm2:gross,straightCutNetAreaMm2:net,cutCoordinateMm:cut,holeIds:intersected.map(h=>h.id),governingNetSectionVerified:false};
        const uncertainty=plate.areaResolutionMm2+res*((1+intersected.length)*plate.thicknessMm+width)+res*res*(1+intersected.length);
        if(net<=0)add("NET_SECTION_ZERO","Corte não possui área positiva.");
        if(g.grossAreaMm2!==null&&comparePhysicalProperty(g.grossAreaMm2,gross,2*uncertainty).status!=="consistent")add("GROSS_AREA_MISMATCH","Área bruta declarada difere da seção transversal computada (largura × espessura).");
        if(g.netAreaMm2!==null&&comparePhysicalProperty(g.netAreaMm2,net,2*uncertainty).status!=="consistent")add("NET_AREA_MISMATCH","Área líquida digitada difere do corte geométrico explicitamente computado.");
      }
    }
  }
  return {status:issues.some(i=>i.severity==="error")?"invalid-geometry" as const:issues.some(i=>i.severity==="pending")?"pending-data" as const:"geometry-consistent" as const,issues,holes,pitches,section,resistanceVerified:false as const};
}
