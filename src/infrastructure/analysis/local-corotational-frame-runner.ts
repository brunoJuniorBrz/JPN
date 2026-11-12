import {z} from "zod";
import {corotationalRequestSchema,corotationalDiagnosticSchema,verifyCorotationalDiagnostic} from "@/domain/corotational-frame";
import {executeSecondOrderWorker,secondOrderFrameEnabled} from "./local-second-order-frame-runner";
import {SolverFailure} from "./runner";

/** Explicit v2 entrypoint; default/P2 dispatch and the linear solver stay separate. */
export async function runLocalCorotationalFrame(input:unknown,signal?:AbortSignal){
  if(!secondOrderFrameEnabled())throw new SolverFailure("LOCAL_ONLY","Diagnóstico experimental somente local.");
  const payload=typeof input==="string"?input:JSON.stringify(input);
  if(typeof payload!=="string"||Buffer.byteLength(payload)>500000)throw new SolverFailure("INPUT_LIMIT","Entrada ausente ou maior que 500 kB.");
  let request:z.infer<typeof corotationalRequestSchema>;
  try{request=corotationalRequestSchema.parse(JSON.parse(payload));}
  catch(e){throw new SolverFailure("COROTATIONAL_CONTRACT",e instanceof Error?e.message.slice(0,2000):"Contrato inválido.");}
  const response=await executeSecondOrderWorker(payload,"--corotational-planar",signal);
  try{
    const envelope=z.object({schema_version:z.literal("jpn.local-corotational-frame/1"),status:z.literal("diagnostic"),
      execution:z.object({memory_limit_bytes:z.literal(768*1024*1024),memory_kind:z.enum(["windows-job-process-commit","linux-address-space"]),local_only:z.literal(true)}).strict(),
      diagnostic:corotationalDiagnosticSchema}).strict().parse(response);
    await verifyCorotationalDiagnostic(request,envelope.diagnostic);return envelope.diagnostic;
  }catch{throw new SolverFailure("INVALID_RESPONSE","Diagnóstico corrotacional incompatível com o estado físico declarado.");}
}
