import { z } from "zod";
import type { MemberDemands } from "./member-demands";
const n=z.number().finite(),nullable=n.nullable();
export const stationDemandsSchema=z.array(z.object({segment_id:z.string().min(1),offset_m:n.nonnegative(),length_m:n.positive(),
  stations:z.array(z.object({u:n.min(0).max(1),forces:z.object({nN:n,vyN:nullable,vzN:nullable,tNm:nullable,myNm:nullable,mzNm:nullable}).strict()}).strict()).min(2).max(5)}).strict()).min(1).max(320);

/** Exact INT-3c samples, not a fitted/interpolated force field. */
export function stationResistanceDemands(piece:MemberDemands["pieces"][number],combinationId:string){
  if(!piece)throw Error("SECOND_ORDER_STATIONS_REQUIRED: peça sem esforços.");
  const result=stationDemandsSchema.safeParse(piece.segments.map(segment=>{
    const samples=piece.samples.filter(s=>s.segmentId===segment.id&&s.combinationId===combinationId).sort((a,b)=>a.stationIndex-b.stationIndex);
    if(samples.length!==(piece.kind==="frame"?5:2)||samples.some((s,i)=>s.stationIndex!==i))throw Error("SECOND_ORDER_STATIONS_REQUIRED: "+piece.pieceId+"/"+combinationId);
    return {segment_id:segment.id,offset_m:segment.t0*piece.lengthM,length_m:segment.lengthMm/1000,
      stations:samples.map(s=>({u:s.segmentPositionM/(segment.lengthMm/1000),forces:s.forces}))};
  }));
  if(!result.success)throw Error("SECOND_ORDER_STATION_VECTOR_INVALID: "+piece.pieceId+"/"+combinationId);
  return result.data;
}
