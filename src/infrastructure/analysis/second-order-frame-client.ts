import type {Project} from "@/domain/models";
import {prepareSecondOrderFrameAnalysis,secondOrderDiagnosticSchema,buildSecondOrderFrameReport} from "@/domain/second-order-frame";

/** Experimental entry point from the SAME saved physical Project.
 * Returns a blocked diagnostic report, including an HTTP 422 numerical refusal.
 * It cannot return MixedResult or replace the application's linear analysis.
 */
export async function diagnoseSecondOrderFrameProject(project:Project,numerics:unknown,signal?:AbortSignal,fetcher:typeof fetch=fetch){
  const prepared=await prepareSecondOrderFrameAnalysis(project,numerics);
  const response=await fetcher("/api/experimental/second-order-frame",{method:"POST",signal,
    headers:{"Content-Type":"application/json","X-JPN-Second-Order":"1"},body:JSON.stringify(prepared.request)});
  const body=await response.json();
  if(body?.status!=="diagnostic"||!body.diagnostic)
    throw Error(`${body?.error?.code??"PDELTA_TRANSPORT"}: ${body?.error?.message??"Resposta experimental ausente"}`);
  const diagnostic=secondOrderDiagnosticSchema.parse(body.diagnostic);
  if(response.status!==422)
    throw Error("PDELTA_TRANSPORT: status incompatível com a recusa numérica");
  return buildSecondOrderFrameReport(project,prepared,diagnostic);
}
