import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { localMixedEnabled,localMixedLimits } from "./local-mixed-runner";
import { SolverFailure } from "./runner";
import { terminateWorker } from "./worker-process";
import { sectionAnalysisRequestSchema,sectionAnalysisResultSchema } from "@/domain/section-analysis";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { verifiedColdformedRequestSchema,coldformedDesignResultSchema,requireCurrentBucklingNumerics,verifiedColdformedBatchRequestSchema,verifiedColdformedBatchResultSchema } from "@/domain/coldformed-design";
const envelope=z.object({schema_version:z.literal("jpn.local-section/1"),status:z.literal("completed"),execution:z.object({memory_limit_bytes:z.literal(localMixedLimits.memoryBytes),memory_kind:z.enum(["windows-job-process-commit","linux-address-space"]),local_only:z.literal(true)}).strict(),result:sectionAnalysisResultSchema}).strict();
const designEnvelope=envelope.extend({result:coldformedDesignResultSchema.required({geometry_audit:true,calculation_input_sha256:true})});
const batchEnvelope=envelope.extend({result:verifiedColdformedBatchResultSchema});
export function runLocalSection(payload:string,signal?:AbortSignal):Promise<z.infer<typeof envelope>>;
export function runLocalSection(payload:string,signal:AbortSignal|undefined,kind:"design"):Promise<z.infer<typeof designEnvelope>>;
export function runLocalSection(payload:string,signal:AbortSignal|undefined,kind:"design-batch"):Promise<z.infer<typeof batchEnvelope>>;
export async function runLocalSection(payload:string,signal?:AbortSignal,kind:"section"|"design"|"design-batch"="section"){
  if(!localMixedEnabled())throw new SolverFailure("LOCAL_ONLY","Módulo de seções disponível no executor local configurado, sem publicação remota nesta campanha.");
  const globals=globalThis as typeof globalThis&{__jpnLocalMixedGate?:{active:number;disabled:boolean}},gate=globals.__jpnLocalMixedGate??={active:0,disabled:false};
  if(gate.disabled)throw new SolverFailure("CLEANUP_FAILURE","Executor bloqueado após falha de limpeza.");
  if(Buffer.byteLength(payload)>localMixedLimits.inputBytes)throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");
  const input=kind==="design-batch"?verifiedColdformedBatchRequestSchema.parse(JSON.parse(payload)):kind==="design"?verifiedColdformedRequestSchema.parse(JSON.parse(payload)):sectionAnalysisRequestSchema.parse(JSON.parse(payload));if(gate.active>=1)throw new SolverFailure("BUSY","Outro cálculo está em execução.");gate.active++;
  try{
    const raw=await new Promise<unknown>((resolve,reject)=>{
      const automatic="requests"in input?input.requests.some(r=>r.design.study.minimum_search==="computed-cfsm-ss"):kind==="design"&&"design"in input&&input.design.study.minimum_search==="computed-cfsm-ss";
      if(automatic&&!process.env.JPN_SECTION_FSM_PYTHON_EXECUTABLE)return reject(new SolverFailure("UNAVAILABLE","Configure o perfil isolado requirements-sections-fsm.lock em JPN_SECTION_FSM_PYTHON_EXECUTABLE. O solver principal não será alterado."));
      const executable=(automatic?process.env.JPN_SECTION_FSM_PYTHON_EXECUTABLE:process.env.JPN_SECTION_PYTHON_EXECUTABLE)||process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
      const symmetricI=kind==="section"&&"geometry"in input&&input.geometry.shape==="i";
      const worker=symmetricI?"scripts/section-i-worker.py":"engine/section_worker.py";
      const child=spawn(executable,["-I","-X","utf8",path.resolve(worker)],{windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}});
      const chunks:Buffer[]=[];let bytes=0,stderr=0,settled=false,failure:SolverFailure|null=null,cleanup:ReturnType<typeof setTimeout>|undefined;
      const finish=(value?:unknown,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(cleanup);signal?.removeEventListener("abort",cancel);if(error)reject(error);else resolve(value);};
      const stop=(code:string,message:string)=>{if(settled||failure)return;failure=new SolverFailure(code,message);terminateWorker(child);cleanup=setTimeout(()=>{gate.disabled=true;finish(undefined,new SolverFailure("CLEANUP_FAILURE","Sem confirmação de encerramento; executor bloqueado."));},1500);};
      const cancel=()=>stop("CANCELLED","Cálculo descartado após alteração/cancelamento."),timer=setTimeout(()=>stop("TIMEOUT","Seção excedeu 20 segundos."),localMixedLimits.milliseconds);
      child.on("error",()=>{if(child.pid)stop("UNAVAILABLE","Falha no worker.");else finish(undefined,new SolverFailure("UNAVAILABLE","Python configurado indisponível."));});
      child.stdin.on("error",()=>stop("UNAVAILABLE","Falha no envio ao worker."));
      child.stdout.on("data",(b:Buffer)=>{bytes+=b.length;if(bytes>localMixedLimits.outputBytes)stop("OUTPUT_LIMIT","Saída excede 2 MB.");else chunks.push(b);});
      child.stderr.on("data",(b:Buffer)=>{stderr+=b.length;if(stderr>16000)stop("OUTPUT_LIMIT","Diagnóstico excede limite.");});
      child.on("close",code=>{if(failure)return finish(undefined,failure);try{const x=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(code!==0||x.status!=="completed")return finish(undefined,new SolverFailure(x.error?.code??"SECTION_UNAVAILABLE",x.error?.message??"Seção recusada."));finish(x);}catch{finish(undefined,new SolverFailure("INVALID_RESPONSE","Resposta de seção inválida."));}});
      signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();else child.stdin.end(payload);
    });
    const out=kind==="design-batch"?batchEnvelope.parse(raw):kind==="design"?designEnvelope.parse(raw):envelope.parse(raw);if(out.result.input_sha256!==await mixedInputHash(input))throw new SolverFailure("HASH_MISMATCH","Cálculo não corresponde à entrada física.");
    if(kind==="design")requireCurrentBucklingNumerics(verifiedColdformedRequestSchema.parse(input),coldformedDesignResultSchema.parse(out.result));
    if(kind==="design-batch"){
      const batch=verifiedColdformedBatchRequestSchema.parse(input),response=verifiedColdformedBatchResultSchema.parse(out.result);
      if(response.results.length!==batch.requests.length||response.geometry_evaluations+response.geometry_reuses!==batch.requests.length)throw new SolverFailure("INVALID_RESPONSE","Incomplete verified batch");
      for(let i=0;i<batch.requests.length;i++){
        const request=batch.requests[i],result=response.results[i];
        if(result.input_sha256!==await mixedInputHash(request)||result.piece_id!==request.design.piece_id||result.combination_id!==request.design.combination_id)throw new SolverFailure("HASH_MISMATCH","Batch member result does not match its physical request");
        requireCurrentBucklingNumerics(request,result);
      }
    }
    return out;
  }finally{gate.active--;}
}
