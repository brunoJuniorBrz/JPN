import type {Project} from "./models";
import {spatialPreparationSchema} from "./spatial-preparation";
import {localAxesReviewSchema,LOCAL_AXES_CONVENTION} from "./local-axes-schema";
import type {LocalAxesReview} from "./local-axes-schema";
export {localAxesReviewSchema,LOCAL_AXES_CONVENTION} from "./local-axes-schema";
export type {LocalAxesReview} from "./local-axes-schema";

export type AxisPendency={pieceId:string;reason:"missing"|"stale-geometry"|"duplicate"|"orphan"};
export class AxisReviewPendingError extends Error{
  readonly code="AXIS_REVIEW_PENDING";
  constructor(readonly pending:AxisPendency[]){
    super("AXIS_REVIEW_PENDING: giro por peça sem revisão no sistema jpn-z-up/1 — "+pending.slice(0,12).map(p=>p.pieceId+" ("+p.reason+")").join(", ")+(pending.length>12?" …":""));
  }
}
/** Frame pieces without a current reviewed roll (visible pendency, never a default of 0°). */
export function localAxesPendency(review:LocalAxesReview|undefined,currentSignature:string,framePieceIds:string[],allPieceIds:string[]):AxisPendency[]{
  const out:AxisPendency[]=[];
  const entries=review?.members??[];
  const seen=new Map<string,number>();
  for(const e of entries)seen.set(e.pieceId,(seen.get(e.pieceId)??0)+1);
  for(const id of framePieceIds){
    if(!review||!seen.has(id))out.push({pieceId:id,reason:"missing"});
    else if(seen.get(id)!>1)out.push({pieceId:id,reason:"duplicate"});
    else if(review.geometrySignature!==currentSignature)out.push({pieceId:id,reason:"stale-geometry"});
  }
  for(const e of entries)if(!allPieceIds.includes(e.pieceId))out.push({pieceId:e.pieceId,reason:"orphan"});
  return out;
}
/** Explicit replacement of the review for the CURRENT geometry (the caller supplies every roll). */
export function declareLocalAxes(project:Project,signature:string,members:LocalAxesReview["members"]):Project{
  const draft=project.workspace.spatialPreparation;
  if(!draft)throw Error("Declare o modelo físico antes dos eixos locais.");
  const review=localAxesReviewSchema.parse({version:1,convention:LOCAL_AXES_CONVENTION,geometrySignature:signature,members});
  return {...project,workspace:{...project.workspace,spatialPreparation:spatialPreparationSchema.parse({...draft,localAxes:review})}};
}
