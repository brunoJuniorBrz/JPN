import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { localMixedEnabled,localMixedLimits } from "./local-mixed-runner";
import { SolverFailure } from "./runner";
import { sectionAnalysisRequestSchema,sectionAnalysisResultSchema } from "@/domain/section-analysis";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { verifiedColdformedRequestSchema,coldformedDesignResultSchema } from "@/domain/coldformed-design";
const envelope=z.object({schema_version:z.literal("jpn.local-section/1"),status:z.literal("completed"),execution:z.object({memory_limit_bytes:z.literal(localMixedLimits.memoryBytes),memory_kind:z.enum(["windows-job-process-commit","linux-address-space"]),local_only:z.literal(true)}).strict(),result:sectionAnalysisResultSchema}).strict();
const designEnvelope=envelope.extend({result:coldformedDesignResultSchema.required({geometry_audit:true,calculation_input_sha256:true})});
export function runLocalSection(payload:string,signal?:AbortSignal):Promise<z.infer<typeof envelope>>;
export function runLocalSection(payload:string,signal:AbortSignal|undefined,kind:"design"):Promise<z.infer<typeof designEnvelope>>;
export async function runLocalSection(payload:string,signal?:AbortSignal,kind:"section"|"design"="section"){
  if(!localMixedEnabled())throw new SolverFailure("LOCAL_ONLY","Módulo de seções disponível no executor local configurado, sem publicação remota nesta campanha.");
  const globals=globalThis as typeof globalThis&{__jpnLocalMixedGate?:{active:number;disabled:boolean}},gate=globals.__jpnLocalMixedGate??={active:0,disabled:false};
  if(gate.disabled)throw new SolverFailure("CLEANUP_FAILURE","Executor bloqueado após falha de limpeza.");
  if(Buffer.byteLength(payload)>localMixedLimits.inputBytes)throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");
  const input=kind==="design"?verifiedColdformedRequestSchema.parse(JSON.parse(payload)):sectionAnalysisRequestSchema.parse(JSON.parse(payload));if(gate.active>=1)throw new SolverFailure("BUSY","Outro cálculo está em execução.");gate.active++;
  try{
    const raw=await new Promise<unknown>((resolve,reject)=>{
      const executable=process.env.JPN_SECTION_PYTHON_EXECUTABLE||process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
      const child=spawn(executable,["-I","-X","utf8",path.resolve("engine/section_worker.py")],{windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}});
      const chunks:Buffer[]=[];let bytes=0,stderr=0,settled=false,failure:SolverFailure|null=null,cleanup:ReturnType<typeof setTimeout>|undefined;
      const finish=(value?:unknown,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(cleanup);signal?.removeEventListener("abort",cancel);if(error)reject(error);else resolve(value);};
      const stop=(code:string,message:string)=>{if(settled||failure)return;failure=new SolverFailure(code,message);child.kill();cleanup=setTimeout(()=>{gate.disabled=true;finish(undefined,new SolverFailure("CLEANUP_FAILURE","Sem confirmação de encerramento; executor bloqueado."));},1500);};
      const cancel=()=>stop("CANCELLED","Cálculo descartado após alteração/cancelamento."),timer=setTimeout(()=>stop("TIMEOUT","Seção excedeu 20 segundos."),localMixedLimits.milliseconds);
      child.on("error",()=>{if(child.pid)stop("UNAVAILABLE","Falha no worker.");else finish(undefined,new SolverFailure("UNAVAILABLE","Python configurado indisponível."));});
      child.stdin.on("error",()=>stop("UNAVAILABLE","Falha no envio ao worker."));
      child.stdout.on("data",(b:Buffer)=>{bytes+=b.length;if(bytes>localMixedLimits.outputBytes)stop("OUTPUT_LIMIT","Saída excede 2 MB.");else chunks.push(b);});
      child.stderr.on("data",(b:Buffer)=>{stderr+=b.length;if(stderr>16000)stop("OUTPUT_LIMIT","Diagnóstico excede limite.");});
      child.on("close",code=>{if(failure)return finish(undefined,failure);try{const x=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(code!==0||x.status!=="completed")return finish(undefined,new SolverFailure(x.error?.code??"SECTION_UNAVAILABLE",x.error?.message??"Seção recusada."));finish(x);}catch{finish(undefined,new SolverFailure("INVALID_RESPONSE","Resposta de seção inválida."));}});
      signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();else child.stdin.end(payload);
    });
    const out=kind==="design"?designEnvelope.parse(raw):envelope.parse(raw);if(out.result.input_sha256!==await mixedInputHash(input))throw new SolverFailure("HASH_MISMATCH","Cálculo não corresponde à entrada física.");return out;
  }finally{gate.active--;}
}
