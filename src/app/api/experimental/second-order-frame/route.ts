import {localMixedEnabled} from "@/infrastructure/analysis/local-mixed-runner";
import {runLocalSecondOrderFrame,secondOrderFrameEnabled} from "@/infrastructure/analysis/local-second-order-frame-runner";
import {SolverFailure} from "@/infrastructure/analysis/runner";
import {runLocalCorotationalFrame} from "@/infrastructure/analysis/local-corotational-frame-runner";

export const runtime="nodejs";
export const maxDuration=35;
const headers={"Cache-Control":"no-store"};
function permitted(request:Request){
  if(!localMixedEnabled()||!secondOrderFrameEnabled())return false;
  try{
    const expected=new URL(process.env.JPN_LOCAL_MIXED_ORIGIN!),url=new URL(request.url),site=request.headers.get("sec-fetch-site");
    return url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)&&url.port===expected.port&&
      request.headers.get("host")===expected.host&&request.headers.get("origin")===expected.origin&&
      request.headers.get("x-jpn-second-order")==="1"&&(!site||site==="same-origin");
  }catch{return false;}
}
async function readInput(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new SolverFailure("INVALID_INPUT","Corpo ausente.");
  let timer:ReturnType<typeof setTimeout>|undefined;
  const reading=(async()=>{let size=0;const chunks:Uint8Array[]=[];
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>500000){await reader.cancel();throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");}chunks.push(part.value);}
    return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));})();
  try{return await Promise.race([reading,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
    void reader.cancel().catch(()=>{});reject(new SolverFailure("TIMEOUT","Prazo de recebimento excedido."));},5000);})]);}
  finally{clearTimeout(timer);reader.releaseLock();}
}
export async function POST(request:Request){
  if(!permitted(request))return Response.json({error:{code:"LOCAL_ONLY",message:"Protótipo local desabilitado; requer opção experimental explícita e origem local."}},{status:403,headers});
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({error:{code:"INVALID_INPUT",message:"Envie JSON em SI."}},{status:415,headers});
  try{
    const raw=await readInput(request),selector=JSON.parse(raw);
    // Select only an explicit version. Preserve raw JSON so the protected
    // Python worker still refuses duplicate keys before numerical execution.
    const diagnostic=selector?.schema_version==="jpn.second-order-frame/2"
      ?await runLocalCorotationalFrame(raw,request.signal):await runLocalSecondOrderFrame(raw,request.signal);
    return Response.json({status:"diagnostic",diagnostic,
      error:{code:"PDELTA_NOT_VERIFIED",message:"Domínio produtivo de segunda ordem não validado; diagnóstico recusado para uso estrutural."}},
      {status:422,headers});
  }catch(value){
    const error=value instanceof SolverFailure?value:new SolverFailure("INVALID_INPUT","Entrada experimental inválida.");
    const unavailable=["UNAVAILABLE","BUSY","TIMEOUT","CANCELLED","MEMORY_LIMIT","MEMORY_LIMIT_UNAVAILABLE","CLEANUP_FAILURE"].includes(error.code);
    return Response.json({error:{code:error.code,message:error.message}},{status:unavailable?503:error.code==="INPUT_LIMIT"?413:422,headers});
  }
}
