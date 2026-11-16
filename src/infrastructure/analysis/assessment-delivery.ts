import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { SolverFailure } from "./runner";

const zip=promisify(gzip);
export const assessmentCompressedInputBytes=16_000_000;

export function acceptsAssessmentGzip(header:string|null){
  let gzipQuality:number|undefined,wildcard:number|undefined;
  for(const entry of (header??"").split(",")){
    const [coding,...params]=entry.toLowerCase().split(";").map(part=>part.trim());
    if(coding!=="gzip"&&coding!=="*")continue;
    const q=params.find(param=>param.startsWith("q="));
    const quality=q===undefined?1:/^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q)?Number(q.slice(2)):0;
    if(coding==="gzip")gzipQuality=Math.min(gzipQuality??1,quality);
    else wildcard=Math.min(wildcard??1,quality);
  }
  return (gzipQuality??wildcard??0)>0;
}

export async function sendAssessment(value:unknown,allowGzip:boolean,requestHash:string,wireLimit:number){
  const json=JSON.stringify(value);
  const rawBytes=Buffer.byteLength(json);
  const headers={"Content-Type":"application/json","Cache-Control":"no-store",Vary:"Accept-Encoding",
    "X-JPN-Request-Sha256":requestHash};
  if(rawBytes<=wireLimit)return new Response(json,{headers});
  if(!allowGzip||rawBytes>assessmentCompressedInputBytes)
    throw new SolverFailure("OUTPUT_LIMIT","Relatório excede o limite de entrega.");
  const compressed=await zip(json);
  if(compressed.length>wireLimit)
    throw new SolverFailure("OUTPUT_LIMIT","Relatório comprimido excede o limite de entrega.");
  return new Response(new Uint8Array(compressed),{headers:{...headers,"Content-Encoding":"gzip"}});
}
