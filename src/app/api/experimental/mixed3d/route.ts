import { localMixedEnabled, localMixedLimits, runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { SolverFailure } from "@/infrastructure/analysis/runner";
import { remoteMixedEnabled, remoteMixedAccess, runRemoteMixed } from "@/infrastructure/analysis/remote-mixed-runner";

export const runtime = "nodejs";
export const maxDuration = 35;
function access(request:Request,post=false){
  if(!remoteMixedEnabled())return null;
  const error=remoteMixedAccess(request,post);
  return error?Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:{"Cache-Control":"no-store",...(error.status===401?{"WWW-Authenticate":'Basic realm="JPN experimental", charset="UTF-8"'}:{})}}):null;
}
function reply(value:unknown){const body=JSON.stringify(value);if(Buffer.byteLength(body)>localMixedLimits.outputBytes)throw new SolverFailure("OUTPUT_LIMIT","Resposta excede 2 MB.");return new Response(body,{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
async function readInput(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new SolverFailure("INVALID_INPUT","Corpo ausente.");
  let timer:ReturnType<typeof setTimeout>|undefined;
  const reading=(async()=>{let bytes=0;const chunks:Uint8Array[]=[];while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>localMixedLimits.inputBytes){await reader.cancel();throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");}chunks.push(p.value);}return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));})();
  try{return await Promise.race([reading,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new SolverFailure("TIMEOUT","Prazo de recebimento excedido."));},5000);})]);}finally{clearTimeout(timer);reader.releaseLock();}
}
function permitted(request: Request, post = false) {
  if (!localMixedEnabled()) return false;
  const expected = process.env.JPN_LOCAL_MIXED_ORIGIN!;
  try {
    const url = new URL(request.url), origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    // Next's custom-server Request URL may use localhost internally. The
    // launcher checks the actual socket and Host before invoking this handler.
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === new URL(expected).port && request.headers.get("host") === new URL(expected).host
      && (!post || origin === expected) && (!origin || origin === expected) && (!site || ["same-origin", "none"].includes(site));
  } catch { return false; }
}
function failure(e: unknown) {
  const error = e instanceof SolverFailure ? e : new SolverFailure("INVALID_INPUT", "Requisição experimental inválida.");
  return Response.json({ error: { code: error.code, message: error.message } }, { status: ["REMOTE_UNAUTHORIZED","REMOTE_FORBIDDEN"].includes(error.code)?502:["CONFIGURATION","BUSY", "UNAVAILABLE", "TIMEOUT", "MEMORY_LIMIT", "MEMORY_LIMIT_UNAVAILABLE", "CLEANUP_FAILURE", "CANCELLED"].includes(error.code) ? 503 : error.code === "INPUT_LIMIT" ? 413 : 422, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: Request) {
  if(remoteMixedEnabled()){
    const denied=access(request);if(denied)return denied;
    // A top-level visit lets the browser authenticate natively, without running
    // Python. Only same-origin fetch with a non-simple header requests health.
    if(request.headers.get("x-jpn-request")!=="1")return reply({status:"authenticated",message:"Acesso de operador confirmado. Volte ao JPN e verifique o executor."});
    try{return reply(await runRemoteMixed("","health",request.signal));}catch(e){return failure(e);}
  }
  if (!permitted(request)) return Response.json({ error: { code: "LOCAL_ONLY", message: "Disponível somente pelo comando pnpm dev:structural no computador local." } }, { status: 403 });
  try { return Response.json(await runLocalMixed("", "health", request.signal), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const remote=remoteMixedEnabled(),denied=remote?access(request,true):null;if(denied)return denied;
  if (!remote&&!permitted(request, true)) return Response.json({ error: { code: "LOCAL_ONLY", message: "Origem local de desenvolvimento exigida." } }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(new SolverFailure("INVALID_INPUT", "Envie JSON pelo formulário local."));
  try {
    const option=request.headers.get("X-JPN-Joint-Actions");if(option!==null&&option!=="1")throw new SolverFailure("INVALID_INPUT","Opção de ações de ligação inválida.");
    const mode=option==="1"?"connections":"analysis";
    const payload=await readInput(request);return reply(await (remote?runRemoteMixed(payload,mode,request.signal):runLocalMixed(payload,mode,request.signal)));
  } catch (e) { return failure(e); }
}
