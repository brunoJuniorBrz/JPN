import {localMixedEnabled} from "@/infrastructure/analysis/local-mixed-runner";
import {runLocalPurlin} from "@/infrastructure/analysis/local-purlin-runner";
import {SolverFailure} from "@/infrastructure/analysis/runner";
import {remoteMixedAccess} from "@/infrastructure/analysis/remote-mixed-runner";
import {remotePurlinEnabled,runRemotePurlin} from "@/infrastructure/analysis/remote-purlin-runner";

export const runtime="nodejs";
export const maxDuration=35;
const headers={"Cache-Control":"no-store"};
const err=(code:string,message:string,status=422)=>Response.json({error:{code,message}},{status,headers});

function authorized(req:Request){
  if(!localMixedEnabled())return false;
  const expected=process.env.JPN_LOCAL_MIXED_ORIGIN;
  const url=new URL(req.url);
  const origin=req.headers.get("origin");
  const referer=req.headers.get("referer");
  let refererOrigin="";
  try{if(referer)refererOrigin=new URL(referer).origin;}catch{}
  // Some browsers omit Origin for same-origin JSON POST. In that case require
  // a same-origin Referer, custom header (CORS preflight) and same-site metadata.
  const site=req.headers.get("sec-fetch-site");
  const host=new URL(expected??"http://127.0.0.1:3000");
  return Boolean(expected&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)
    &&url.port===host.port&&req.headers.get("host")===host.host
    &&(origin===expected||(origin===null&&refererOrigin===expected))
    &&req.headers.get("x-jpn-purlin")==="1"
    &&(site===null||site==="same-origin"));
}
function remoteDenied(req:Request,post=false){
  const denied=remoteMixedAccess(req,post);
  if(!denied)return null;
  return Response.json({error:{code:denied.code,message:denied.message}},
    {status:denied.status,headers:{"Cache-Control":"no-store",...(denied.status===401?{"WWW-Authenticate":'Basic realm="JPN experimental", charset="UTF-8"'}:{})}});
}
export async function GET(req:Request){
  if(!remotePurlinEnabled())return err("LOCAL_ONLY","Calculadora remota indisponível.",403);
  const denied=remoteDenied(req);if(denied)return denied;
  return Response.json({status:"authenticated",message:"Acesso autorizado ao cálculo experimental de terças."},{headers});
}
export async function POST(req:Request){
  const remote=remotePurlinEnabled();
  if(remote){const denied=remoteDenied(req,true);if(denied)return denied;}
  else if(!authorized(req))return err("LOCAL_ONLY","Use o servidor local pnpm dev:structural, sem conexão remota.",403);
  if(req.headers.get("x-jpn-purlin")!=="1")return err("INVALID_INPUT","Cabeçalho de cálculo ausente.",422);
  if(!req.headers.get("content-type")?.startsWith("application/json"))return err("INVALID_INPUT","Informe JSON.",415);
  try{
    const reader=req.body?.getReader();if(!reader)return err("INVALID_INPUT","Corpo ausente.");
    const chunks:Uint8Array[]=[];let bytes=0;
    try{
      while(true){
        const part=await reader.read();if(part.done)break;
        bytes+=part.value.byteLength;
        if(bytes>25000){await reader.cancel();return err("INPUT_LIMIT","Entrada excede 25 kB.",413);}
        chunks.push(part.value);
      }
    }finally{reader.releaseLock();}
    const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
    const output=await (remote?runRemotePurlin(parsed,req.signal):runLocalPurlin(parsed,req.signal));
    return Response.json(output,{headers});
  }catch(e){
    if(e instanceof SolverFailure){
      const status=["UNAVAILABLE","BUSY","TIMEOUT","CLEANUP_FAILURE","SERVICE_FAILURE","CONFIGURATION","REMOTE_DISABLED","CANCELLED"].includes(e.code)?503:e.code==="INPUT_LIMIT"?413:422;
      return err(e.code,e.message,["REMOTE_UNAUTHORIZED","REMOTE_FORBIDDEN"].includes(e.code)?502:status);
    }
    return err("INVALID_INPUT","Dados inválidos, fora do domínio ou rejeitados pelo motor.");
  }
}
