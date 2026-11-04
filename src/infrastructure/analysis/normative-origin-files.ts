import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateNormativeOrigin } from "@/domain/normative-origin";
import type { Project } from "@/domain/models";

/** Fixed repository paths only. No PDF, caller path or test fixture loader. */
export async function loadNormativeOriginFiles(){
  const loadErrors:string[]=[];
  const read=async(name:string)=>{
    try{return JSON.parse(await readFile(path.join(process.cwd(),"data/normas",name),"utf8")) as unknown;}
    catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")loadErrors.push(`NORMATIVE_FILE_INVALID: ${name}: ${e instanceof Error?e.message:String(e)}`);return undefined;}
  };
  const [wind,factors]=await Promise.all([read("nbr6123-2023-cpe.json"),read("nbr8681-2025-fatores.json")]);
  return {wind,factors,loadErrors};
}
export async function generateNormativeOriginFromRepository(project:Project,input:unknown){
  return generateNormativeOrigin(project,input,await loadNormativeOriginFiles());
}
