import { jointActionTraceSchema, verifyJointActionTrace } from "@/domain/member-end-actions";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { anyMixedRequestSchema, anyMixedResultSchema, verifyLoadingTrace } from "@/domain/structural-loading";
import { mixedInputHash, verifyMixedResult } from "@/domain/mixed-analysis";
import { SolverFailure } from "./runner";

export const remoteMixedLimits = { inputBytes:500000, outputBytes:2000000, milliseconds:28000 } as const;
const execution=z.object({memory_limit_bytes:z.literal(805306368),memory_kind:z.enum(["linux-address-space","windows-job-process-commit"]),timeout_seconds:z.literal(20),concurrency_per_instance:z.literal(1),isolation:z.literal("subprocess")}).strict();
const envelope=z.object({schema_version:z.literal("jpn.http-mixed/1"),request_sha256:z.string().regex(/^[a-f0-9]{64}$/),execution,result:anyMixedResultSchema,joint_actions:jointActionTraceSchema.optional()}).strict();
const health=z.object({schema_version:z.literal("jpn.http-mixed/1"),status:z.literal("ready"),contracts:z.array(z.enum(["jpn.mixed3d/1","jpn.mixed3d/2"])).length(2),dependencies:z.object({python:z.literal("3.12"),PyNiteFEA:z.literal("3.2.1"),numpy:z.string(),scipy:z.string()}).strict(),execution}).strict();
const globals=globalThis as typeof globalThis & {__jpnRemoteMixedGate?:{active:number}};
const gate=globals.__jpnRemoteMixedGate??={active:0};
export function remoteMixedEnabled(){return process.env.JPN_MIXED_REMOTE_ENABLED==="1";}
const same=(a:string,b:string)=>timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
export function remoteMixedAccess(request:Request,post=false){
  const user=process.env.JPN_MIXED_ACCESS_USER,password=process.env.JPN_MIXED_ACCESS_PASSWORD;
  if(!user||!password||password.length<16||password===process.env.JPN_ANALYSIS_TOKEN)return {status:503,code:"ACCESS_CONFIGURATION",message:"Configure acesso de operador separado do token Python."};
  const authorization=request.headers.get("authorization")??"";
  let decoded="";
  if(authorization.length<=4096&&/^Basic [A-Za-z0-9+/]+=*$/.test(authorization))decoded=Buffer.from(authorization.slice(6),"base64").toString("utf8");
  const split=decoded.indexOf(":"),validUser=same(decoded.slice(0,split),user),validPassword=same(split<0?"":decoded.slice(split+1),password);
  if(split<0||!validUser||!validPassword)return {status:401,code:"ACCESS_REQUIRED",message:"Autentique o operador em /api/experimental/mixed3d e volte ao JPN."};
  try{
    const expected=new URL(process.env.JPN_MIXED_APP_ORIGIN??"");
    const local=["development","test"].includes(process.env.NODE_ENV??"")&&expected.protocol==="http:"&&["127.0.0.1","localhost"].includes(expected.hostname);
    if(expected.origin!==process.env.JPN_MIXED_APP_ORIGIN||(!local&&expected.protocol!=="https:"))throw new Error();
    const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
    if(request.headers.get("host")!==expected.host||(post&&origin!==expected.origin)||(origin&&origin!==expected.origin)||(site&&!["same-origin","none"].includes(site)))return {status:403,code:"ORIGIN",message:"Origem não permitida para computação remota."};
  }catch{return {status:503,code:"ACCESS_CONFIGURATION",message:"Configure a origem privada do frontend."};}
  return null;
}
function configuration(){
  if(!remoteMixedEnabled())throw new SolverFailure("REMOTE_DISABLED","Execução remota desativada.");
  try{
    const url=new URL(process.env.JPN_MIXED_BACKEND_URL??"");
    const testLocal=process.env.NODE_ENV==="test"&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname);
    if((url.protocol!=="https:"&&!testLocal)||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error();
    const token=process.env.JPN_ANALYSIS_TOKEN;
    if(!token||/[\r\n]/.test(token))throw new Error();
    return {origin:url.origin,token,bypass:process.env.JPN_MIXED_DEPLOYMENT_BYPASS_SECRET};
  }catch{throw new SolverFailure("CONFIGURATION","Configure URL HTTPS do backend e credenciais somente no servidor.");}
}
async function readResponse(response:Response,signal:AbortSignal){
  if(Number(response.headers.get("content-length"))>remoteMixedLimits.outputBytes){await response.body?.cancel();throw new SolverFailure("OUTPUT_LIMIT","Resposta excede 2 MB.");}
  const reader=response.body?.getReader();if(!reader)throw new SolverFailure("INVALID_RESPONSE","Resposta vazia do backend.");
  const chunks:Uint8Array[]=[];let bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  try{while(true){const chunk=await reader.read();if(signal.aborted)throw new SolverFailure("CANCELLED","Leitura cancelada.");if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>remoteMixedLimits.outputBytes){await reader.cancel();throw new SolverFailure("OUTPUT_LIMIT","Resposta excede 2 MB.");}chunks.push(chunk.value);}}finally{signal.removeEventListener("abort",abort);reader.releaseLock();}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new SolverFailure("INVALID_RESPONSE","Backend retornou conteúdo incompatível, possivelmente uma página de proteção.");}
}
export async function runRemoteMixed(payload:string,mode:"health"|"analysis"|"connections"="analysis",signal?:AbortSignal){
  const config=configuration();
  if(Buffer.byteLength(payload)>remoteMixedLimits.inputBytes)throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");
  let request:ReturnType<typeof anyMixedRequestSchema.parse>|undefined;
  if(mode!=="health"){try{request=anyMixedRequestSchema.parse(JSON.parse(payload));}catch{throw new SolverFailure("INVALID_INPUT","Modelo misto incompatível com o contrato SI.");}}
  if(gate.active)throw new SolverFailure("BUSY","Uma consulta remota já está em execução nesta instância.");
  gate.active++;
  const controller=new AbortController();let timeout:ReturnType<typeof setTimeout>|undefined,hasResponse=false;
  let cancel:()=>void=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new SolverFailure("TIMEOUT","Backend excedeu o prazo de 28 segundos; nenhum resultado publicado."));},remoteMixedLimits.milliseconds);
    cancel=()=>{controller.abort();reject(new SolverFailure("CANCELLED","Consulta cancelada; resposta descartada."));};
    signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
  });
  try{
    return await Promise.race([interrupted,(async()=>{
      if(controller.signal.aborted)throw new SolverFailure("CANCELLED","Consulta cancelada.");
      const response=await fetch(config.origin+(mode==="health"?"/health":"/api/analyze-mixed"),{method:mode==="health"?"GET":"POST",headers:{...(mode==="connections"?{"X-JPN-Joint-Actions":"1"}:{}),Authorization:`Bearer ${config.token}`,...(mode!=="health"?{"Content-Type":"application/json"}:{}),...(config.bypass?{"x-vercel-protection-bypass":config.bypass}:{})},...(mode!=="health"?{body:payload}:{}),signal:controller.signal,redirect:"error",cache:"no-store"});
      hasResponse=true;
      if(response.status===401||response.status===403){await response.body?.cancel();throw new SolverFailure(response.status===401?"REMOTE_UNAUTHORIZED":"REMOTE_FORBIDDEN","Backend recusou as credenciais ou a proteção de deployment. Revise a configuração privada.");}
      const raw=await readResponse(response,controller.signal);
      if(!response.ok){const code=raw?.error?.code;if(typeof code!=="string"||!/^[A-Z_]{1,80}$/.test(code))throw new SolverFailure("UNAVAILABLE","Backend indisponível.");throw new SolverFailure(code,"O backend recusou a consulta; nenhum resultado publicado.");}
      if(controller.signal.aborted)throw new SolverFailure("CANCELLED","Resposta descartada.");
      if(mode==="health"){
        const h=health.parse(raw);if(new Set(h.contracts).size!==2)throw new Error();
        return {schema_version:"jpn.remote-mixed/1" as const,status:"ready" as const,dependencies:h.dependencies,execution:{...h.execution,transport:"remote" as const,local_only:false as const}};
      }
      const out=envelope.parse(raw);
      if(out.request_sha256!==createHash("sha256").update(payload).digest("hex")||out.result.schema_version!==request!.schema_version.replace("mixed3d/","mixed3d-result/"))throw new Error();
      verifyMixedResult(request!,out.result,await mixedInputHash(request));verifyLoadingTrace(request!,out.result);
      if(mode==="connections"){if(!out.joint_actions)throw new SolverFailure("JOINT_TRACE_UNAVAILABLE","Backend ainda não fornece ações de ligação; requer publicação autorizada dessa versão.");verifyJointActionTrace(request!,out.result,out.joint_actions);}
      return {...(out.joint_actions?{joint_actions:out.joint_actions}:{}),schema_version:"jpn.remote-mixed/1" as const,status:"completed" as const,request_sha256:out.request_sha256,result:out.result,execution:{...out.execution,transport:"remote" as const,local_only:false as const}};
    })()]);
  }catch(e){if(e instanceof SolverFailure)throw e;throw new SolverFailure(controller.signal.aborted?"CANCELLED":hasResponse?"INVALID_RESPONSE":"UNAVAILABLE","Resposta remota inválida ou backend indisponível; nenhum resultado publicado.");}
  finally{clearTimeout(timeout);signal?.removeEventListener("abort",cancel);gate.active--;}
}
