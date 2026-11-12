import type {Project} from "@/domain/models";
import {prepareP4FrameAnalysis,buildP4FrameReport,type P4Formulation} from "@/domain/p4-frame";

export async function diagnoseP4FrameProject(project:Project,numerics:unknown,formulation:P4Formulation,signal?:AbortSignal,fetcher:typeof fetch=fetch){
  const prepared=await prepareP4FrameAnalysis(project,numerics,formulation);
  const response=await fetcher("/api/experimental/second-order-frame",{method:"POST",signal,headers:{"Content-Type":"application/json","X-JPN-Second-Order":"1"},body:JSON.stringify(prepared.request)});
  const body=await response.json();
  if(response.status!==422||body.status!=="diagnostic"||body.error?.code!=="PDELTA_NOT_VERIFIED")throw Error(body.error?.code??"P4_INVALID_RESPONSE");
  return buildP4FrameReport(project,prepared,body.diagnostic);
}
