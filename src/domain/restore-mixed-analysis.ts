import { z } from "zod";
import type { Project } from "./models";
import { adaptMixedProject } from "./mixed-adapter";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { verifyMixedResult } from "./mixed-analysis";
import { anyMixedResultSchema,verifyLoadingTrace } from "./structural-loading";
const exported=z.object({prepared:z.unknown(),result:anyMixedResultSchema,execution:z.unknown()}).strict();
/** Rebuild the current request; imported preparation/approval claims are never trusted. */
export async function restoreMixedAnalysis(project:Project,text:string){
  if(new TextEncoder().encode(text).length>5*1024*1024)throw Error("Resultado excede 5 MB.");
  const packet=exported.parse(JSON.parse(text));
  const prepared=await(project.workspace.spatialPreparation?.loading?adaptLoadedMixedProject(project):adaptMixedProject(project));
  if(packet.result.schema_version!==prepared.request.schema_version.replace("mixed3d/","mixed3d-result/"))throw Error("Versão do resultado incompatível com o carregamento atual.");
  verifyMixedResult(prepared.request,packet.result,prepared.input_sha256);verifyLoadingTrace(prepared.request,packet.result);
  return {prepared,result:packet.result,execution:{source:"restored-file",originVerified:false},computedStructuralApproval:false,fabricationRelease:false};
}
