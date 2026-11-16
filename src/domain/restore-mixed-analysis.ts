import { z } from "zod";
import type { Project } from "./models";
import { adaptMixedForVersion,adaptMixedForRequest,type MixedRequestVersion } from "./current-mixed-adapter";
import { verifyMixedResult } from "./mixed-analysis";
import { anyMixedResultSchema,secondOrderMixedResultSchema,secondOrderMixedRequestSchema,verifySecondOrderDemandTrace,verifyLoadingTrace } from "./structural-loading";
const exported=z.object({prepared:z.unknown(),result:z.union([anyMixedResultSchema,secondOrderMixedResultSchema]),execution:z.unknown()}).strict();
/** Rebuild the current request; imported preparation/approval claims are never trusted. */
export async function restoreMixedAnalysis(project:Project,text:string){
  if(new TextEncoder().encode(text).length>5*1024*1024)throw Error("Resultado excede 5 MB.");
  const packet=exported.parse(JSON.parse(text));
  // the file's own contract decides how to rebuild: /3 needs the reviewed axes, /2 and /1 rebuild exactly as before
  const second="analysis_order" in packet.result;
  const prepared=second?await adaptMixedForRequest(project,secondOrderMixedRequestSchema.parse((packet.prepared as {request?:unknown})?.request)):await adaptMixedForVersion(project,packet.result.schema_version.replace("mixed3d-result/","mixed3d/") as MixedRequestVersion);
  if(packet.result.schema_version!==prepared.request.schema_version.replace("mixed3d/","mixed3d-result/"))throw Error("Versão do resultado incompatível com o carregamento atual.");
  verifyMixedResult(prepared.request,packet.result,prepared.input_sha256);if(second)verifySecondOrderDemandTrace(secondOrderMixedRequestSchema.parse(prepared.request),secondOrderMixedResultSchema.parse(packet.result));
  else verifyLoadingTrace(prepared.request,anyMixedResultSchema.parse(packet.result));
  return {prepared,result:packet.result,execution:{source:"restored-file",originVerified:false},computedStructuralApproval:false,fabricationRelease:false};
}
