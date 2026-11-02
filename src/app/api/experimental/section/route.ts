import { localMixedEnabled,localMixedLimits } from "@/infrastructure/analysis/local-mixed-runner";
import { runLocalSection } from "@/infrastructure/analysis/local-section-runner";
import { SolverFailure } from "@/infrastructure/analysis/runner";
export const runtime="nodejs";
export async function POST(request:Request){
  try{
    const expected=process.env.JPN_LOCAL_MIXED_ORIGIN,url=new URL(request.url),origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
    if(!localMixedEnabled()||!expected||url.protocol!=="http:"||!["localhost","127.0.0.1"].includes(url.hostname)||url.port!==new URL(expected).port||request.headers.get("host")!==new URL(expected).host||origin!==expected||site&&!["same-origin","none"].includes(site))return Response.json({error:{code:"LOCAL_ONLY",message:"Origem local configurada exigida."}},{status:403});
    if(!request.headers.get("content-type")?.startsWith("application/json"))throw new SolverFailure("INVALID_INPUT","JSON exigido.");
    const reader=request.body?.getReader();if(!reader)throw new SolverFailure("INVALID_INPUT","Corpo ausente.");
    let timer:ReturnType<typeof setTimeout>|undefined;const chunks:Uint8Array[]=[];let size=0;
    const read=async()=>{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>localMixedLimits.inputBytes){await reader.cancel();throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");}chunks.push(p.value);}return new TextDecoder("utf8",{fatal:true}).decode(Buffer.concat(chunks));};
    let text:string;try{text=await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new SolverFailure("TIMEOUT","Recebimento excedeu 5 segundos."));},5000);})]);}finally{clearTimeout(timer);reader.releaseLock();}
    return Response.json(await runLocalSection(text,request.signal),{headers:{"Cache-Control":"no-store"}});
  }catch(e){const error=e instanceof SolverFailure?e:new SolverFailure("INVALID_INPUT","Seção física inválida.");return Response.json({error:{code:error.code,message:error.message}},{status:error.code==="INPUT_LIMIT"?413:["BUSY","TIMEOUT","MEMORY_LIMIT","UNAVAILABLE"].includes(error.code)?503:422,headers:{"Cache-Control":"no-store"}});}
}
