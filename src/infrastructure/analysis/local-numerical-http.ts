import { createHash } from "node:crypto";
import { localMixedEnabled,localMixedLimits } from "./local-mixed-runner";
import { runLocalSection } from "./local-section-runner";
import { SolverFailure } from "./runner";
import { runLocalStructuralAssessment, runRemoteStructuralAssessment } from "./local-structural-assessment-runner";
import { remoteMixedAccess, remoteMixedEnabled } from "./remote-mixed-runner";
import { runRemoteSection } from "./remote-section-runner";
import { acceptsAssessmentGzip, sendAssessment } from "./assessment-delivery";
import { enqueueAnalysis, prefersAsync } from "./analysis-jobs-http";
export async function serveLocalNumerical(request:Request,kind:"section"|"design"|"structural-assessment"|"steel-design"){
  try{
    const remote=kind!=="steel-design"&&remoteMixedEnabled();
    if(remote){
      const denied=remoteMixedAccess(request,true);
      if(denied)return Response.json({error:{code:denied.code,message:denied.message}},{status:denied.status,
        headers:{"Cache-Control":"no-store",...(denied.status===401?{"WWW-Authenticate":'Basic realm="JPN experimental", charset="UTF-8"'}:{})}});
    }else{
      const expected=process.env.JPN_LOCAL_MIXED_ORIGIN,url=new URL(request.url),origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
      if(!localMixedEnabled()||!expected||url.protocol!=="http:"||!["localhost","127.0.0.1"].includes(url.hostname)||url.port!==new URL(expected).port||request.headers.get("host")!==new URL(expected).host||origin!==expected||site&&!["same-origin","none"].includes(site))return Response.json({error:{code:"LOCAL_ONLY",message:"Origem local configurada exigida."}},{status:403});
    }
    if(!request.headers.get("content-type")?.startsWith("application/json"))throw new SolverFailure("INVALID_INPUT","JSON exigido.");
    const reader=request.body?.getReader();if(!reader)throw new SolverFailure("INVALID_INPUT","Corpo ausente.");
    let timer:ReturnType<typeof setTimeout>|undefined;const chunks:Uint8Array[]=[];let size=0;
    const read=async()=>{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>localMixedLimits.inputBytes){await reader.cancel();throw new SolverFailure("INPUT_LIMIT","Entrada excede 500 kB.");}chunks.push(p.value);}return new TextDecoder("utf8",{fatal:true}).decode(Buffer.concat(chunks));};
    let text:string;try{text=await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new SolverFailure("TIMEOUT","Recebimento excedeu 5 segundos."));},5000);})]);}finally{clearTimeout(timer);reader.releaseLock();}
    const hash=createHash("sha256").update(text).digest("hex");
    if(remote&&prefersAsync(request))return await enqueueAnalysis(kind,text,hash);
    if(kind==="structural-assessment"){
      const allowGzip=acceptsAssessmentGzip(request.headers.get("accept-encoding"));
      const result=await (remote?runRemoteStructuralAssessment(text,request.signal,allowGzip)
        :runLocalStructuralAssessment(text,request.signal,allowGzip));
      return await sendAssessment(result,allowGzip,hash,localMixedLimits.outputBytes);
    }
    const value=await (remote ? runRemoteSection(text,request.signal,kind)
      : kind==="steel-design" ? runLocalSection(text,request.signal,"steel-design")
      : kind==="design" ? runLocalSection(text,request.signal,"design") : runLocalSection(text,request.signal));
    return Response.json(value,{headers:{"Cache-Control":"no-store","X-JPN-Request-Sha256":hash}});
  }catch(e){const error=e instanceof SolverFailure?e:new SolverFailure("INVALID_INPUT","Seção física inválida.");return Response.json({error:{code:error.code,message:error.message}},{status:error.code==="INPUT_LIMIT"?413:["REMOTE_UNAUTHORIZED","REMOTE_FORBIDDEN"].includes(error.code)?502:["BUSY","TIMEOUT","MEMORY_LIMIT","UNAVAILABLE","CONFIGURATION","CANCELLED","SECTIONS_EXTRA_MISSING"].includes(error.code)?503:422,headers:{"Cache-Control":"no-store"}});}
}
