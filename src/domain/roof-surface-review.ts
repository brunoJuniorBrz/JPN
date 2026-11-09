import type {Project} from "./models";
import type {SpatialPreparation} from "./spatial-preparation";
import {resolvePhysicalStructure} from "./physical-structure";
import {structureSignature} from "./calculations/project-basis";
import {roofOutlineAreaM2,roofOutlineSchema} from "./roof-outline";
import {faceElevationMm,physicalFaceAreaM2,projectedFaceAreaM2,roofSurfacesSchema,type XY,type RoofFace} from "./roof-surface-geometry";

export type RoofSurfaceIssue={code:string;message:string};
const eps=1e-6;
const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const onEdge=(p:XY,a:XY,b:XY)=>
 Math.abs(cross(a,b,p))<=eps*Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]))&&
 p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&
 p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
function inRing(p:XY,ring:XY[]){
 let inside=false;
 for(let i=0;i<ring.length-1;i++){
  const a=ring[i],b=ring[i+1];
  if(onEdge(p,a,b))return 0;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside?1:-1;
}
/** +1 interior; 0 boundary; -1 outside or in cut-out. */
export function pointInRoofFace(p:XY,face:Pick<RoofFace,"outer"|"holes">){
 const outer=inRing(p,face.outer);
 if(outer!==1)return outer;
 for(const hole of face.holes){
  const match=inRing(p,hole);
  if(match===0)return 0;
  if(match===1)return -1;
 }
 return 1;
}
const rings=(face:Pick<RoofFace,"outer"|"holes">)=>[face.outer,...face.holes];
function edges(face:Pick<RoofFace,"outer"|"holes">){
 return rings(face).flatMap(r=>r.slice(1).map((p,i)=>[r[i],p] as [XY,XY]));
}
const strictCross=(a:XY,b:XY,c:XY,d:XY)=>
 (cross(a,b,c)*cross(a,b,d)<-eps)&&(cross(c,d,a)*cross(c,d,b)<-eps);
function interiorProbes(face:Pick<RoofFace,"outer"|"holes">){
 // CCW outer: the left of each directed edge points into the face.
 return face.outer.slice(1).flatMap((b,i)=>{
  const a=face.outer[i],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
  if(!L)return [];
  const shift=Math.min(10,L/100);
  const p:XY=[(a[0]+b[0])/2-dy/L*shift,(a[1]+b[1])/2+dx/L*shift];
  return pointInRoofFace(p,face)===1?[p]:[];
 });
}
function overlap(a:Pick<RoofFace,"outer"|"holes">,b:Pick<RoofFace,"outer"|"holes">){
 if(edges(a).some(([u,v])=>edges(b).some(([w,x])=>strictCross(u,v,w,x))))return true;
 return interiorProbes(a).some(p=>pointInRoofFace(p,b)===1)||
  interiorProbes(b).some(p=>pointInRoofFace(p,a)===1);
}
/** Fail closed: no silent bounding rectangle, gap, double area, missing
 * supporting bars, fictitious height or auto-generated restraints.
 * Physical models may be analyzed with independently entered nodal loads;
 * registering surfaces alone does not create tributary forces. */
export function reviewPhysicalRoofSurfaces(project:Project,draft:Pick<SpatialPreparation,"roofSurfaces">=project.workspace.spatialPreparation??{}):{
 issues:RoofSurfaceIssue[];projectedAreaM2:number|null;physicalAreaM2:number|null;
}{
 const raw=draft.roofSurfaces;
 if(!raw)return {issues:[],projectedAreaM2:null,physicalAreaM2:null};
 const issues:RoofSurfaceIssue[]=[];
 const add=(code:string,message:string)=>issues.push({code,message});
 const parsed=roofSurfacesSchema.safeParse(raw);
 if(!parsed.success)return {issues:[{code:"ROOF_SURFACES_INVALID",message:parsed.error.issues.map(x=>x.message).slice(0,5).join(" ")}],
  projectedAreaM2:null,physicalAreaM2:null};
 const {surfaces,geometrySignature}=parsed.data;
 if(geometrySignature!==structureSignature(project))
  add("STALE_ROOF_SURFACES","Revisão geométrica mudou; revise todos os planos e apoios.");
 const footprint=roofOutlineSchema.safeParse(project.workspace.roofOutline);
 if(!footprint.success)add("ROOF_OUTLINE_REQUIRED","Declare o perímetro e os recortes reais da cobertura.");
 let model:ReturnType<typeof resolvePhysicalStructure>["model"]=null;
 try{model=resolvePhysicalStructure(project).model;}catch{add("ROOF_PHYSICAL_GEOMETRY","Geometria de barras físicas indisponível.");}
 if(!model)add("ROOF_PHYSICAL_GEOMETRY","Modelo físico não disponível para conferir terças.");
 const pieces=new Map(model?.pieces.map(x=>[x.id,x])??[]);
 const points=new Map(model?.nodes.map(x=>[x.id,x])??[]);
 let projected=0,physical=0;
 for(const face of surfaces){
  projected+=projectedFaceAreaM2(face);physical+=physicalFaceAreaM2(face);
  for(const pieceId of face.purlinPieceIds){
   const piece=pieces.get(pieceId);
   if(!piece||piece.role!=="purlin"){
    add("ROOF_PURLIN_REFERENCE",face.id+": terça física ausente ou não identificada: "+pieceId);continue;
   }
   const a=points.get(piece.start),b=points.get(piece.end);
   if(!a||!b){add("ROOF_PURLIN_NODE","Nó da terça não existe.");continue;}
   for(const p of [a,b]){
    if(pointInRoofFace([p.x,p.y],face)<0||
      Math.abs(p.z-faceElevationMm(face,[p.x,p.y]))>1e-4)
      add("ROOF_PURLIN_OFF_SURFACE",face.id+": barra "+pieceId+" não coincide com a superfície real.");
   }
  }
  if(footprint.success){
   const f=footprint.data;
   if(interiorProbes(face).some(p=>pointInRoofFace(p,f)<1))
    add("ROOF_OUTSIDE_FOOTPRINT",face.id+": parte da superfície fica fora do contorno real.");
   if(edges(face).some(([a,b])=>edges(f).some(([c,d])=>strictCross(a,b,c,d))))
    add("ROOF_FOOTPRINT_CROSSING",face.id+": superfície cruza o contorno/recorte declarado.");
  }
 }
 for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++){
  const a=surfaces[i],b=surfaces[j];
  if(overlap(a,b))add("ROOF_SURFACE_OVERLAP",a.id+"/"+b.id+": áreas projetadas sobrepostas.");
  // Same XY vertices at ridge/valley must meet in elevation; no phantom steps.
  for(const p of a.outer.slice(0,-1))if(b.outer.slice(0,-1).some(q=>q[0]===p[0]&&q[1]===p[1])&&
    Math.abs(faceElevationMm(a,p)-faceElevationMm(b,p))>1e-4)
    add("ROOF_SEAM",a.id+"/"+b.id+": planos não se encontram na mesma altura.");
 }
 if(footprint.success){
  const expected=roofOutlineAreaM2(footprint.data);
  if(Math.abs(projected-expected)>1e-9*Math.max(1,expected))
    add("ROOF_AREA_GAP","Somatório das áreas difere do contorno real; lacuna/sobreposição não autorizada.");
 }
 return {issues,projectedAreaM2:projected,physicalAreaM2:physical};
}
