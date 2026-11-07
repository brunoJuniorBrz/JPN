import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { localMixedEnabled, localMixedLimits } from "./local-mixed-runner";
import { SolverFailure } from "./runner";
import { terminateWorker } from "./worker-process";
import { purlinRequestSchema, purlinResultSchema, verifyPurlinResult, type PurlinRequest } from "@/domain/purlin";

type Gate={active:number;disabled:boolean};
const globals=globalThis as typeof globalThis & {__jpnPurlinGate?:Gate};
const gate=globals.__jpnPurlinGate??={active:0,disabled:false};

/** Standalone local worker, using the SAME Python memory-limited process as mixed3d.
 * No browser-side mechanical result, no remote or production execution. */
export async function runLocalPurlin(input:unknown,signal?:AbortSignal){
  if(!localMixedEnabled())throw new SolverFailure("LOCAL_ONLY","Execute pnpm dev:structural; cálculo experimental somente no computador local.");
  if(gate.disabled)throw new SolverFailure("CLEANUP_FAILURE","Worker não confirmou encerramento; reinicie o servidor local.");
  const request=purlinRequestSchema.parse(input) as PurlinRequest;
  const payload=JSON.stringify(request);
  if(Buffer.byteLength(payload)>25000)throw new SolverFailure("INPUT_LIMIT","Entrada de terças excede 25 kB.");
  if(gate.active>=1)throw new SolverFailure("BUSY","Já existe uma comparação de terças em execução.");
  gate.active++;
  try {
    const portable=path.resolve(".tools/python/python.exe");
    const executable=process.env.JPN_PYTHON_EXECUTABLE || (existsSync(portable)?portable:path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python"));
    const response=await new Promise<unknown>((resolve,reject)=>{
      const child=spawn(executable,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py"),"--purlin"],{
        windowsHide:true,stdio:["pipe","pipe","pipe"],cwd:process.cwd(),env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},
      });
      let done=false,bytes=0,stderrBytes=0,stopping:SolverFailure|null=null;
      const chunks:Buffer[]=[];
      let cleanup:ReturnType<typeof setTimeout>|undefined;
      const settle=(value?:unknown,error?:Error)=>{
        if(done)return;done=true;clearTimeout(timeout);if(cleanup)clearTimeout(cleanup);
        signal?.removeEventListener("abort",cancel);
        if(error)reject(error);else resolve(value);
      };
      const stop=(code:string,message:string)=>{
        if(stopping||done)return;stopping=new SolverFailure(code,message);terminateWorker(child);
        cleanup=setTimeout(()=>{gate.disabled=true;settle(undefined,new SolverFailure("CLEANUP_FAILURE","Python não confirmou encerramento."));},1500);
      };
      const cancel=()=>stop("CANCELLED","Cálculo cancelado; nenhum resultado publicado.");
      const timeout=setTimeout(()=>stop("TIMEOUT","Cálculo excedeu 20 segundos."),localMixedLimits.milliseconds);
      child.on("error",()=>{if(child.pid)stop("SERVICE_FAILURE","Falha ao executar Python.");else settle(undefined,new SolverFailure("UNAVAILABLE","Python 3.12 não disponível."));});
      child.stdin.on("error",()=>stop("SERVICE_FAILURE","Falha de envio à análise."));
      child.stdout.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>200000)stop("OUTPUT_LIMIT","Saída excede o limite do cálculo.");else chunks.push(chunk);});
      child.stderr.on("data",(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>16000)stop("OUTPUT_LIMIT","Diagnóstico do processo excedeu o limite.");});
      child.on("close",code=>{
        if(stopping)return settle(undefined,stopping);
        try {
          const decoded=JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if(code!==0||decoded.status==="error")return settle(undefined,new SolverFailure(decoded.error?.code??"SERVICE_FAILURE",decoded.error?.message??"Python recusou o cálculo."));
          settle(decoded);
        }catch{return settle(undefined,new SolverFailure("INVALID_RESPONSE","Python não retornou JSON válido."));}
      });
      signal?.addEventListener("abort",cancel,{once:true});
      if(signal?.aborted)cancel();else child.stdin.end(payload);
    });
    if(!response||typeof response!=="object"||!("schema_version" in response) || response.schema_version!=="jpn.local-purlin/1")
      throw new SolverFailure("INVALID_RESPONSE","Envelope do motor incompatível.");
    if(!("status" in response)||response.status!=="completed"||!("result" in response))
      throw new SolverFailure("INVALID_RESPONSE","Resultado incompleto.");
    const result=purlinResultSchema.parse(response.result);
    verifyPurlinResult(request,result);
    return result;
  }catch(e){
    if(e instanceof SolverFailure)throw e;
    throw new SolverFailure("INVALID_RESPONSE","O executor retornou um resultado incompatível ou fisicamente inconsistente.");
  }finally{gate.active--;}
}
