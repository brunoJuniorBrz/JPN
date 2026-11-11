import type {Project} from "@/domain/models";
import {prepareCorotationalFrameAnalysis,buildCorotationalFrameReport} from "@/domain/corotational-frame";

/** Project -> physical preparation -> protected worker -> audited blocked report. */
export async function diagnoseCorotationalFrameProject(project:Project,numerics:unknown,signal?:AbortSignal,fetcher:typeof fetch=fetch){
  const prepared=await prepareCorotationalFrameAnalysis(project,numerics);
  const response=await fetcher("/api/experimental/second-order-frame",{method:"POST",signal,
    headers:{"Content-Type":"application/json","X-JPN-Second-Order":"1"},body:JSON.stringify(prepared.request)});
  const body=await response.json();
  if(response.status!==422||body.status!=="diagnostic"||body.error?.code!=="PDELTA_NOT_VERIFIED")
    throw Error(body.error?.code??"COROTATIONAL_INVALID_RESPONSE");
  return buildCorotationalFrameReport(project,prepared,body.diagnostic);
}
