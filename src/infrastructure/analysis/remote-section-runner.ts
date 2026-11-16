import { createHash } from "node:crypto";
import { z } from "zod";
import { sectionAnalysisRequestSchema,sectionAnalysisResultSchema } from "@/domain/section-analysis";
import { verifiedColdformedRequestSchema,coldformedDesignResultSchema,verifiedColdformedBatchRequestSchema,
  verifiedColdformedBatchResultSchema } from "@/domain/coldformed-design";
import { checkRemoteInputBudget, remoteEngineExecutionSchema, requestRemoteEngine } from "./remote-mixed-runner";
import { verifySectionBinding } from "./section-result-binding";
import { SolverFailure } from "./runner";

const base=z.object({schema_version:z.literal("jpn.http-numerical/1"),
  request_sha256:z.string().regex(/^[a-f0-9]{64}$/),execution:remoteEngineExecutionSchema}).strict();

const profiles={
  section:{input:sectionAnalysisRequestSchema,output:sectionAnalysisResultSchema,path:"/api/analyze-section"},
  design:{input:verifiedColdformedRequestSchema,output:coldformedDesignResultSchema.required({geometry_audit:true,calculation_input_sha256:true}),path:"/api/analyze-design"},
  "design-batch":{input:verifiedColdformedBatchRequestSchema,output:verifiedColdformedBatchResultSchema,path:"/api/analyze-design"},
} as const;

export async function runRemoteSection<K extends keyof typeof profiles>(payload:string,signal:AbortSignal|undefined,kind:K){
  checkRemoteInputBudget(payload);
  const profile=profiles[kind];
  const {data:input,success}=profile.input.safeParse(JSON.parse(payload));
  if(!success)throw new SolverFailure("INVALID_INPUT","Entrada numérica incompatível com o contrato.");
  return requestRemoteEngine(profile.path,payload,async raw=>{
    const out=base.extend({result:profile.output}).parse(raw);
    if(out.request_sha256!==createHash("sha256").update(payload).digest("hex"))
      throw new SolverFailure("HASH_MISMATCH","Resposta remota não corresponde aos bytes enviados.");
    await verifySectionBinding(kind,input,out.result);
    return {schema_version:"jpn.remote-section/1" as const,status:"completed" as const,
      request_sha256:out.request_sha256,result:out.result as z.infer<(typeof profiles)[K]["output"]>,
      execution:{...out.execution,transport:"remote" as const,local_only:false as const}};
  },signal);
}
