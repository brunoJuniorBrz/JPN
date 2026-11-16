import { mixedInputHash } from "@/domain/mixed-analysis";
import { coldformedDesignResultSchema, requireCurrentBucklingNumerics, verifiedColdformedBatchRequestSchema,
  verifiedColdformedBatchResultSchema, verifiedColdformedRequestSchema } from "@/domain/coldformed-design";
import { SolverFailure } from "./runner";

export async function verifySectionBinding(kind:"section"|"design"|"design-batch"|"steel-design",
  input:unknown,result:{input_sha256:string}){
  if(result.input_sha256!==await mixedInputHash(input))throw new SolverFailure("HASH_MISMATCH","Cálculo não corresponde à entrada física.");
  if(kind==="design")requireCurrentBucklingNumerics(verifiedColdformedRequestSchema.parse(input),coldformedDesignResultSchema.parse(result));
  if(kind!=="design-batch")return;
  const batch=verifiedColdformedBatchRequestSchema.parse(input),response=verifiedColdformedBatchResultSchema.parse(result);
  if(response.results.length!==batch.requests.length||response.geometry_evaluations+response.geometry_reuses!==batch.requests.length)
    throw new SolverFailure("INVALID_RESPONSE","Incomplete verified batch");
  for(let i=0;i<batch.requests.length;i++){
    const request=batch.requests[i],item=response.results[i];
    if(item.input_sha256!==await mixedInputHash(request)||item.piece_id!==request.design.piece_id||item.combination_id!==request.design.combination_id)
      throw new SolverFailure("HASH_MISMATCH","Batch member result does not match its physical request");
    requireCurrentBucklingNumerics(request,item);
  }
}
