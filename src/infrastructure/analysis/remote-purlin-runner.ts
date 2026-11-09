import {createHash} from "node:crypto";
import {z} from "zod";
import {purlinRequestSchema,purlinResultSchema,verifyPurlinResult,type PurlinResult} from "@/domain/purlin";
import {remoteMixedEnabled} from "./remote-mixed-runner";
import {SolverFailure} from "./runner";

/** Preview-only opt-in. Never enable transport using client-exposed variables. */
export const remotePurlinEnabled=()=>process.env.JPN_PURLIN_REMOTE_ENABLED==="1"&&remoteMixedEnabled();
export const remotePurlinLimits={inputBytes:25000,outputBytes:200000,milliseconds:28000} as const;
const execution=z.object({
  memory_limit_bytes:z.literal(805306368),
  memory_kind:z.enum(["linux-address-space","windows-job-process-commit"]),
  timeout_seconds:z.literal(20),
  concurrency_per_instance:z.literal(1),
  isolation:z.literal("subprocess"),
}).strict();
const envelope=z.object({
  schema_version:z.literal("jpn.http-purlin/1"),
  request_sha256:z.string().regex(/^[a-f0-9]{64}$/),
  result:purlinResultSchema,execution,
}).strict();
const globals=globalThis as typeof globalThis&{__jpnRemotePurlinGate?:{active:number}};
const gate=globals.__jpnRemotePurlinGate??={active:0};

function config(){
  if(!remotePurlinEnabled())throw new SolverFailure("REMOTE_DISABLED","Cálculo remoto de terças desativado.");
  try{
    const url=new URL(process.env.JPN_MIXED_BACKEND_URL??"");
    const local=process.env.NODE_ENV==="test"&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname);
    const token=process.env.JPN_ANALYSIS_TOKEN;
    if((url.protocol!=="https:"&&!local)||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!token||/[\r\n]/.test(token))throw Error();
    return {endpoint:url.origin+"/api/analyze-purlin",token,bypass:process.env.JPN_MIXED_DEPLOYMENT_BYPASS_SECRET};
  }catch{throw new SolverFailure("CONFIGURATION","Configure o backend HTTPS e credenciais privadas de cálculo.");}
}
async function readBounded(response:Response,signal:AbortSignal){
  const limit=remotePurlinLimits.outputBytes;
  const reported=response.headers.get("content-length");
  if(reported!==null&&Number(reported)>limit){await response.body?.cancel();throw new SolverFailure("OUTPUT_LIMIT","Resposta de terças excedeu o limite.");}
  const reader=response.body?.getReader();
  if(!reader)throw new SolverFailure("INVALID_RESPONSE","Resposta do executor vazia.");
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      if(signal.aborted)throw new SolverFailure("CANCELLED","Cálculo cancelado.");
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>limit){await reader.cancel();throw new SolverFailure("OUTPUT_LIMIT","Resposta de terças excedeu o limite.");}
      chunks.push(chunk.value);
    }
  }finally{reader.releaseLock();}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{throw new SolverFailure("INVALID_RESPONSE","Executor retornou JSON incompatível.");}
}
export async function runRemotePurlin(input:unknown,signal?:AbortSignal):Promise<PurlinResult>{
  if(!remotePurlinEnabled())throw new SolverFailure("REMOTE_DISABLED","Cálculo remoto de terças desativado.");
  let request:ReturnType<typeof purlinRequestSchema.parse>;
  try{request=purlinRequestSchema.parse(input);}
  catch{throw new SolverFailure("INVALID_INPUT","Dados da terça não atendem ao contrato.");}
  const payload=JSON.stringify(request);
  if(Buffer.byteLength(payload)>remotePurlinLimits.inputBytes)throw new SolverFailure("INPUT_LIMIT","Entrada excede 25 kB.");
  const {endpoint,token,bypass}=config();
  if(gate.active)throw new SolverFailure("BUSY","Já existe análise de terças neste executor.");
  gate.active++;
  const controller=new AbortController();let timedOut=false,received=false;
  const cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  if(signal?.aborted)cancel();
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},remotePurlinLimits.milliseconds);
  try{
    if(controller.signal.aborted)throw new SolverFailure("CANCELLED","Cálculo cancelado.");
    const response=await fetch(endpoint,{method:"POST",body:payload,
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(bypass?{"x-vercel-protection-bypass":bypass}:{})},
      signal:controller.signal,cache:"no-store",redirect:"error"});
    received=true;
    if(response.status===401||response.status===403){
      await response.body?.cancel();
      throw new SolverFailure(response.status===401?"REMOTE_UNAUTHORIZED":"REMOTE_FORBIDDEN","Backend recusou as credenciais ou a proteção.");
    }
    const raw=await readBounded(response,controller.signal);
    if(!response.ok){
      const code=raw?.error?.code;
      throw new SolverFailure(typeof code==="string"&&/^[A-Z_]{1,80}$/.test(code)?code:"UNAVAILABLE","Backend recusou o cálculo; nenhum resultado foi publicado.");
    }
    const parsed=envelope.parse(raw);
    if(parsed.request_sha256!==createHash("sha256").update(payload).digest("hex"))
      throw new SolverFailure("INVALID_RESPONSE","Identidade da requisição não confere.");
    verifyPurlinResult(request,parsed.result);
    if(controller.signal.aborted)throw new SolverFailure("CANCELLED","Resposta cancelada.");
    return parsed.result;
  }catch(e){
    // CI-only diagnostic: report the stage/type, never inputs, credentials or output.
    if(process.env.NODE_ENV==="test"&&!(e instanceof SolverFailure)){
      const issue=(e instanceof z.ZodError)?e.issues.map(x=>({path:x.path.join("."),code:x.code})):undefined;
      console.error("REMOTE_PURLIN_VERIFICATION_DIAGNOSTIC",
        e instanceof Error?e.constructor.name:typeof e,issue??(e instanceof Error?e.message:"unknown"));
    }
    if(e instanceof SolverFailure)throw e;
    throw new SolverFailure(timedOut?"TIMEOUT":controller.signal.aborted?"CANCELLED":received?"INVALID_RESPONSE":"UNAVAILABLE",
      "Análise remota indisponível ou resultado inconsistente. Nenhum cálculo foi publicado.");
  }finally{
    clearTimeout(timeout);signal?.removeEventListener("abort",cancel);gate.active--;
  }
}
