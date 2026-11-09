import {z} from "zod";
import {roofOutlineAreaM2,roofOutlineSchema} from "./roof-outline";

/** Real, engineer-declared sloped roof faces in mm, independent of display.
 * No member load is produced by this contract. */
const coord=z.number().finite().min(-10000000).max(10000000);
const point=z.tuple([coord,coord]);
const named=z.string().trim().min(1).max(1000);
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
export const roofFaceSchema=z.object({
  id,outer:z.array(point).min(4).max(101),
  holes:z.array(z.array(point).min(4).max(101)).max(10),
  // z(mm) = zAtOriginMm + dzDx*x(mm) + dzDy*y(mm)
  plane:z.object({zAtOriginMm:coord,dzDx:z.number().finite().min(-10).max(10),
    dzDy:z.number().finite().min(-10).max(10)}).strict(),
  purlinPieceIds:z.array(id).min(1).max(600),
  source:named,revision:named,
}).strict();
export const roofSurfacesSchema=z.object({
  schema_version:z.literal("jpn.physical-roof-surfaces/1"),
  units:z.literal("mm"),
  geometrySignature:z.string().min(1).max(100000),
  surfaces:z.array(roofFaceSchema).min(1).max(32),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.surfaces.map(f=>f.id)).size!==v.surfaces.length)
    ctx.addIssue({code:"custom",message:"ROOF_SURFACE_DUPLICATE_ID"});
  for(const f of v.surfaces){
    const valid=roofOutlineSchema.safeParse({schema_version:"jpn.roof-outline/1",
      units:"mm",projection:"horizontal-XY",source:f.source,revision:f.revision,
      outer:f.outer,holes:f.holes,supportPieceIds:f.purlinPieceIds});
    if(!valid.success)
      ctx.addIssue({code:"custom",message:"ROOF_SURFACE_INVALID_POLYGON: "+f.id+"; "+
        valid.error.issues.map(x=>x.message).slice(0,3).join("; ")});
  }
});
export type RoofSurfaces=z.infer<typeof roofSurfacesSchema>;
export type RoofFace=z.infer<typeof roofFaceSchema>;
export type XY=[number,number];
export const faceElevationMm=(face:RoofFace,[x,y]:XY)=>
  face.plane.zAtOriginMm+face.plane.dzDx*x+face.plane.dzDy*y;
export function projectedFaceAreaM2(face:RoofFace){
  return roofOutlineAreaM2({schema_version:"jpn.roof-outline/1",
    units:"mm",projection:"horizontal-XY",source:face.source,revision:face.revision,
    outer:face.outer,holes:face.holes,supportPieceIds:face.purlinPieceIds});
}
export function physicalFaceAreaM2(face:RoofFace){
  return projectedFaceAreaM2(face)*Math.hypot(1,face.plane.dzDx,face.plane.dzDy);
}
