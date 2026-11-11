import {z} from "zod";
import type {PhysicalGeometry} from "./structure";
import {roofOutlineSchema,signedRingAreaMm2} from "./roof-outline";
import {entirePieceOnFace} from "./physical-roof-coverage";

/** Facades live in a VERTICAL (u,z) plane, never in the roof XY footprint.
 * Only explicitly surveyed rectilinear vertical planes are accepted in P1.
 * No wind zone, internal pressure or load coefficient is inferred. */
type V3=[number,number,number];
type V2=[number,number];
const mm=z.number().finite().min(-1e7).max(1e7);
const xyz=z.tuple([mm,mm,mm]);
const ring=z.array(xyz).min(4).max(101);
const evidence=z.string().trim().min(5).max(1000);
const memberId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/);
export const facadeOrientationSchema=z.enum(["+X","-X","+Y","-Y"]);
const facadeSchema=z.object({
  id:memberId,
  outward:facadeOrientationSchema,
  kind:z.enum(["wall","gable","parapet"]),
  enclosure:z.enum(["cladded","partially-cladded","open","unknown"]),
  outer:ring,openings:z.array(ring).max(10),
  supportPieceIds:z.array(memberId).max(600),
  source:evidence,revision:evidence,
  enclosureSource:evidence,
}).strict();
export const physicalFacadesSchema=z.object({
  schema_version:z.literal("jpn.physical-facades/1"),units:z.literal("mm"),
  source:evidence,revision:evidence,
  facades:z.array(facadeSchema).min(1).max(32),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.facades.map(f=>f.id)).size!==v.facades.length)
    ctx.addIssue({code:"custom",message:"FACADE_DUPLICATE_ID: identificadores repetidos."});
  for(let i=0;i<v.facades.length;i++){
    const f=v.facades[i],all=[f.outer,...f.openings];
    const constantAxis=f.outward.endsWith("X")?0:1;
    const coord=f.outer[0][constantAxis];
    if(all.some(r=>r.some(p=>Math.abs(p[constantAxis]-coord)>0.01))){
      ctx.addIssue({code:"custom",path:["facades",i],
        message:"FACADE_NOT_VERTICAL_PLANE: vértices/aberturas fora do mesmo plano vertical."});
      continue;
    }
    // Reuse robust planar polygon edge/winding/hole checks in local (u,z).
    // The outline schema's XY indices are parametric coordinates ONLY here:
    // they do not represent a horizontal XY roof or an external area claim.
    const projection={
      schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",
      source:f.source,revision:f.revision,
      outer:f.outer.map(p=>toFacadeLocal(f.outward,p)),
      holes:f.openings.map(r=>r.map(p=>toFacadeLocal(f.outward,p))),
      supportPieceIds:f.supportPieceIds,
    };
    const validated=roofOutlineSchema.safeParse(projection);
    if(!validated.success)ctx.addIssue({code:"custom",path:["facades",i],
      message:"FACADE_GEOMETRY_INVALID: "+validated.error.issues.map(x=>x.message).join("; ")});
  }
});
export type PhysicalFacades=z.infer<typeof physicalFacadesSchema>;
export type FacadeOrientation=z.infer<typeof facadeOrientationSchema>;

export function toFacadeLocal(orientation:FacadeOrientation,p:V3):V2{
  switch(orientation){
    case "+X":return [p[1],p[2]];
    case "-X":return [-p[1],p[2]];
    case "+Y":return [-p[0],p[2]];
    case "-Y":return [p[0],p[2]];
  }
}
export function fromFacadeLocal(orientation:FacadeOrientation,coordinateMm:number,p:V2):V3{
  switch(orientation){
    case "+X":return [coordinateMm,p[0],p[1]];
    case "-X":return [coordinateMm,-p[0],p[1]];
    case "+Y":return [-p[0],coordinateMm,p[1]];
    case "-Y":return [p[0],coordinateMm,p[1]];
  }
}
export function facadeOutwardNormal(orientation:FacadeOrientation):V3{
  switch(orientation){
    case "+X":return [1,0,0];
    case "-X":return [-1,0,0];
    case "+Y":return [0,1,0];
    case "-Y":return [0,-1,0];
  }
}
/** Signed-area weighted centroids remove opening area and its first moment. */
function signedMoments(r:V2[]){
  let doubleArea=0,x6=0,y6=0;
  for(let i=0;i<r.length-1;i++){
    const a=r[i],b=r[i+1],c=a[0]*b[1]-b[0]*a[1];
    doubleArea+=c;x6+=(a[0]+b[0])*c;y6+=(a[1]+b[1])*c;
  }
  return {areaMm2:doubleArea/2,xFirstMomentMm3:x6/6,yFirstMomentMm3:y6/6};
}
function fail(code:string,message:string):never{throw Error(code+": "+message);}
export function inspectPhysicalFacades(raw:unknown,structure?:PhysicalGeometry|null){
  const data=physicalFacadesSchema.parse(raw);
  if(structure&&structure.units!=="mm")fail("FACADE_UNITS","estrutura requer mm");
  const nodes=new Map(structure?.nodes.map(n=>[n.id,n])??[]),
    members=new Map(structure?.pieces.map(p=>[p.id,p])??[]);
  const faces=data.facades.map(f=>{
    const main=f.outer.map(p=>toFacadeLocal(f.outward,p)),
      holes=f.openings.map(r=>r.map(p=>toFacadeLocal(f.outward,p))),
      areaMm2=signedRingAreaMm2(main)+holes.reduce((s,r)=>s+signedRingAreaMm2(r),0),
      moments=[main,...holes].map(signedMoments);
    const combined=moments.reduce((s,m)=>({
      areaMm2:s.areaMm2+m.areaMm2,
      xFirstMomentMm3:s.xFirstMomentMm3+m.xFirstMomentMm3,
      yFirstMomentMm3:s.yFirstMomentMm3+m.yFirstMomentMm3,
    }),{areaMm2:0,xFirstMomentMm3:0,yFirstMomentMm3:0});
    if(!Number.isFinite(areaMm2)||areaMm2<=1e-5||
      Math.abs(combined.areaMm2-areaMm2)>1e-7*Math.max(1,areaMm2))
      fail("FACADE_AREA_INVALID",f.id+" tem área/primeiros momentos inconsistentes");
    const centerLocal:V2=[combined.xFirstMomentMm3/areaMm2,combined.yFirstMomentMm3/areaMm2];
    const axis=f.outward.endsWith("X")?0:1,
      offset=f.outer[0][axis],
      centroidMm=fromFacadeLocal(f.outward,offset,centerLocal);
    const bound=[Math.min(...main.map(p=>p[0])),Math.min(...main.map(p=>p[1])),
      Math.max(...main.map(p=>p[0])),Math.max(...main.map(p=>p[1]))] as [number,number,number,number];
    for(const id of f.supportPieceIds){
      if(!structure)fail("FACADE_STRUCTURE_PENDING",f.id+" associa peça sem estrutura física explícita");
      const m=members.get(id);
      if(!m)fail("FACADE_MEMBER_ORPHAN",f.id+"/"+id+" não existe");
      const a=nodes.get(m.start),b=nodes.get(m.end);
      if(!a||!b)fail("FACADE_MEMBER_NODE",f.id+"/"+id+" tem nó inexistente");
      const A:[number,number,number]=[a.x,a.y,a.z],B:[number,number,number]=[b.x,b.y,b.z];
      if(Math.abs(A[axis]-offset)>0.01||Math.abs(B[axis]-offset)>0.01)
        fail("FACADE_MEMBER_OFF_PLANE",f.id+"/"+id+" não pertence ao plano vertical");
      if(!entirePieceOnFace(toFacadeLocal(f.outward,A),toFacadeLocal(f.outward,B),main,holes))
        fail("FACADE_MEMBER_OUTSIDE",f.id+"/"+id+" cruza uma abertura ou sai do pano");
    }
    return {id:f.id,kind:f.kind,enclosure:f.enclosure,
      outward:f.outward,unitOutwardNormal:facadeOutwardNormal(f.outward),
      constantPlaneMm:offset,localBoundsMm:bound,
      verticalAreaM2:areaMm2/1e6,centroidMm,
      openingAreaM2:-holes.reduce((s,h)=>s+signedRingAreaMm2(h),0)/1e6,
      supportPieceIds:[...f.supportPieceIds],
      source:f.source,revision:f.revision,enclosureSource:f.enclosureSource};
  });
  return {schema_version:"jpn.physical-facade-audit/1" as const,
    geometry:data,faces,totalVerticalAreaM2:faces.reduce((s,f)=>s+f.verticalAreaM2,0),
    enclosureReviewed:false as const,globalOverlapReviewed:false as const,
    facadeLoadPathReady:false as const,windReady:false as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,
    limitations:["Áreas e centróides são verticais e declarados; não se presume o volume de fechamento da edificação.",
      "Sem pressão externa/interna, zonas de vento, coeficientes normativos ou transmissão aos contraventamentos/apoiamentos.",
      "Posição geométrica de peças não comprova rigidez, resistência ou ligação física do fechamento."]};
}
