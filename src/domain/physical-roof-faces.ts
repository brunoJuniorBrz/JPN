import {z} from "zod";
import {roofOutlineSchema,signedRingAreaMm2} from "./roof-outline";

/** Physical surfaces, not finite elements or a normative load model.
 * XYZ in millimetres; planarity is checked for EVERY vertex including holes.
 * A declared roof can have L/U outlines and cutouts without a bounding box.
 * Multi-surface intersection/coverage is not silently assumed or approved. */
type V3=[number,number,number];
type V2=[number,number];
const mm=z.number().finite().min(-1e7).max(1e7);
const xyz=z.tuple([mm,mm,mm]);
const source=z.string().trim().min(5).max(1000);
const ring=z.array(xyz).min(4).max(101);
const face=z.object({
  id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/),
  outer:ring,holes:z.array(ring).max(10),supportPieceIds:z.array(z.string().min(1).max(60)).max(600),
  source,revision:source,
}).strict();
export const physicalRoofFacesSchema=z.object({
  schema_version:z.literal("jpn.physical-roof-faces/1"),
  units:z.literal("mm"),
  source,revision:source,
  faces:z.array(face).min(1).max(20),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.faces.map(f=>f.id)).size!==v.faces.length)
    ctx.addIssue({code:"custom",message:"PHYSICAL_ROOF_DUPLICATE_FACE: IDs de superfícies repetidos."});
  for(const f of v.faces){
    const outline=roofOutlineSchema.safeParse({
      schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",
      source:f.source,revision:f.revision,
      outer:f.outer.map(p=>[p[0],p[1]]),holes:f.holes.map(h=>h.map(p=>[p[0],p[1]])),
      supportPieceIds:f.supportPieceIds,
    });
    if(!outline.success){
      ctx.addIssue({code:"custom",path:["faces",v.faces.indexOf(f)],
        message:"PHYSICAL_ROOF_OUTLINE_INVALID: "+outline.error.issues.map(i=>i.message).join("; ")});
      continue;
    }
    const points=[...f.outer,...f.holes.flat()];
    const a=f.outer[0];let b:V3|undefined,c:V3|undefined;
    // Find three independent XY points, not just 3D noncollinearity.
    outer:for(let i=1;i<f.outer.length-1;i++)for(let j=i+1;j<f.outer.length-1;j++){
      const x=f.outer[i],y=f.outer[j];
      const cross=(x[0]-a[0])*(y[1]-a[1])-(x[1]-a[1])*(y[0]-a[0]);
      if(Math.abs(cross)>1e-4){b=x;c=y;break outer;}
    }
    if(!b||!c){
      ctx.addIssue({code:"custom",message:"PHYSICAL_ROOF_DEGENERATE_PLANE: plano não determinado."});
      continue;
    }
    const det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const dzDx=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/det;
    const dzDy=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/det;
    if(!Number.isFinite(dzDx)||!Number.isFinite(dzDy)||
      Math.hypot(dzDx,dzDy)>10){
      ctx.addIssue({code:"custom",message:"PHYSICAL_ROOF_PLANE_LIMIT: inclinação incompatível com superfície de telhado suportada."});
      continue;
    }
    // Minimum tolerance 0.01 mm for numerical plans, relative to coordinate
    // magnitude to allow large site coordinate systems without false rejection.
    const tol=1e-2+Number.EPSILON*128*Math.max(1,...points.flatMap(p=>p.map(Math.abs)));
    if(points.some(p=>Math.abs(p[2]-a[2]-dzDx*(p[0]-a[0])-dzDy*(p[1]-a[1]))>tol))
      ctx.addIssue({code:"custom",message:"PHYSICAL_ROOF_NONPLANAR: vértices/recortes não coplanares; divida em superfícies físicas."});
  }
});
export type PhysicalRoofFaces=z.infer<typeof physicalRoofFacesSchema>;

export function inspectPhysicalRoofFaces(raw:unknown){
  const data=physicalRoofFacesSchema.parse(raw);
  const faces=data.faces.map(f=>{
    const xyOuter=f.outer.map(p=>[p[0],p[1]] as V2);
    const xyHoles=f.holes.map(h=>h.map(p=>[p[0],p[1]] as V2));
    const projectedAreaMm2=signedRingAreaMm2(xyOuter)+
      xyHoles.reduce((sum,h)=>sum+signedRingAreaMm2(h),0);
    const a=f.outer[0],b=f.outer[1];
    let c=f.outer.find((p,i)=>i>1&&Math.abs((b[0]-a[0])*(p[1]-a[1])-
      (b[1]-a[1])*(p[0]-a[0]))>1e-4);
    if(!c)throw new Error("PHYSICAL_ROOF_DEGENERATE_PLANE");
    const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const dzDx=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/cross;
    const dzDy=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/cross;
    const planeFactor=Math.hypot(1,dzDx,dzDy);
    const horizontalAreaM2=projectedAreaMm2/1e6;
    const surfaceAreaM2=horizontalAreaM2*planeFactor;
    if(!Number.isFinite(surfaceAreaM2)||horizontalAreaM2<=0)
      throw new Error("PHYSICAL_ROOF_AREA_INVALID");
    return {id:f.id,source:f.source,revision:f.revision,
      horizontalAreaM2,surfaceAreaM2,areaFactor:planeFactor,
      plane:{originMm:a,dzDx,dzDy},
      supportPieceIds:[...f.supportPieceIds]};
  });
  return {schema_version:"jpn.physical-roof-face-audit/1" as const,
    geometry:data,faces,
    // DO NOT SUM independent faces as a global occupied footprint before
    // overlaps/abutments have been reviewed. Loads remain gated by M39-M40.
    globalCoverage:"not-reviewed" as const,
    loadingReady:false as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,
    limitations:["As superfícies são verificadas individualmente; sobreposição entre faces e interfaces de cumeeira ainda exigem verificação global.",
      "Cargas em telhado irregular não são geradas por este contrato. M39/M40 validarão cobertura, transmissão e conservação."]};
}
