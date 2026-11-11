import {z} from "zod";
import {p4RequestSchema,p4DiagnosticSchema,verifyP4Diagnostic} from "@/domain/p4-frame";
import {executeSecondOrderWorker,secondOrderFrameEnabled} from "./local-second-order-frame-runner";
import {SolverFailure} from "./runner";

export async function runLocalP4Frame(input:unknown,signal?:AbortSignal){
  if(!secondOrderFrameEnabled())throw new SolverFailure("LOCAL_ONLY","Ensaio P4 somente local por opção experimental explícita.");
  const payload=typeof input==="string"?input:JSON.stringify(input);
  if(typeof payload!=="string"||Buffer.byteLength(payload)>500000)throw new SolverFailure("INPUT_LIMIT","Entrada ausente ou maior que 500 kB.");
  let request:z.infer<typeof p4RequestSchema>;
  try{request=p4RequestSchema.parse(JSON.parse(payload));}
  catch(e){throw new SolverFailure("P4_CONTRACT",e instanceof Error?e.message.slice(0,2000):"Contrato inválido.");}
  const response=await executeSecondOrderWorker(payload,"--p4-frame",signal);
  try{
    const envelope=z.object({schema_version:z.literal("jpn.local-p4-frame/1"),status:z.literal("diagnostic"),
      execution:z.object({memory_limit_bytes:z.literal(768*1024*1024),memory_kind:z.enum(["windows-job-process-commit","linux-address-space"]),local_only:z.literal(true)}).strict(),
      diagnostic:p4DiagnosticSchema}).strict().parse(response);
    await verifyP4Diagnostic(request,envelope.diagnostic);return envelope.diagnostic;
  }catch(e){throw new SolverFailure("INVALID_RESPONSE",e instanceof Error?e.message.slice(0,2000):"Ensaio P4 incompatível com o estado físico.");}
}
