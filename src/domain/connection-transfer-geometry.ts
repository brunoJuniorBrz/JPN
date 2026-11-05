import { z } from "zod";
const text=z.string().trim().min(1).max(1000),known=z.number().finite().nullable();
const positive=z.number().finite().positive().nullable();
/** Structured declaration only. Never parse dimensions from holesAndDistances. */
export const connectionTransferGeometrySchema=z.object({schema_version:z.literal("jpn.connection-transfer-geometry/1"),source:text,revision:text,
  coordinateReference:text,units:z.literal("mm"),fixing:z.enum(["pending","bolted","welded","combined"]),
  holes:z.array(z.object({id:z.string().min(1).max(100),componentId:z.string().min(1).max(100),pieceId:z.string().min(1).max(100),diameterMm:positive,yMm:known,zMm:known,edgeYMm:positive,edgeZMm:positive}).strict()).max(500),
  pitches:z.array(z.object({fromHole:z.string().min(1).max(100),toHole:z.string().min(1).max(100),distanceMm:positive}).strict()).max(1000),
  grossAreaMm2:positive,netAreaMm2:positive,netSectionPath:text.nullable(),loadTransferPath:text.nullable(),eccentricityMm:z.tuple([known,known,known]).nullable(),
  rectangularPlate:z.object({schema_version:z.literal("jpn.rectangular-plate/1"),componentId:z.string().min(1).max(100),widthYMm:z.number().finite().positive().max(1e6),heightZMm:z.number().finite().positive().max(1e6),thicknessMm:z.number().finite().positive().max(1e6),originYMm:z.number().finite(),originZMm:z.number().finite(),coordinateResolutionMm:z.number().finite().positive(),areaResolutionMm2:z.number().finite().positive(),loadAxis:z.enum(["y","z"]),netCutCoordinateMm:known}).strict().optional(),
}).strict().superRefine((v,ctx)=>{
  const ids=new Set(v.holes.map(h=>h.id));if(ids.size!==v.holes.length)ctx.addIssue({code:"custom",message:"Duplicate hole IDs"});
  if(v.pitches.some(p=>!ids.has(p.fromHole)||!ids.has(p.toHole)||p.fromHole===p.toHole))ctx.addIssue({code:"custom",message:"Invalid hole spacing reference"});
  if(v.netAreaMm2!==null&&v.grossAreaMm2!==null&&v.netAreaMm2>v.grossAreaMm2)ctx.addIssue({code:"custom",message:"Net area exceeds gross area"});
});
