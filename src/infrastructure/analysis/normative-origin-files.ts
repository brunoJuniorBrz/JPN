import { readFile,realpath } from "node:fs/promises";
import path from "node:path";
import { generateNormativeOrigin } from "@/domain/normative-origin";
import type { Project } from "@/domain/models";

/** Fixed names; optional administrator-owned private directory, outside Git.
 * No PDF reader, request-controlled path or fallback on invalid private data. */
export async function loadNormativeOriginFiles(){
  const loadErrors:string[]=[];
  const configured=process.env.JPN_NORMATIVE_DATA_DIR;
  let directory=path.join(process.cwd(),"data/normas");
  if(configured){
    try{
      if(!path.isAbsolute(configured))throw Error("absolute private directory required");
      directory=await realpath(configured);
      const relative=path.relative(await realpath(process.cwd()),directory);
      if(!relative||!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative))throw Error("private directory must be outside repository");
    }catch{ return {loadErrors:["NORMATIVE_PRIVATE_DIRECTORY_INVALID: absolute existing directory outside repository required"]}; }
  }
  const read=async(name:string)=>{
    try{return JSON.parse(await readFile(path.join(directory,name),"utf8")) as unknown;}
    catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")loadErrors.push(`NORMATIVE_FILE_INVALID: ${name}: ${e instanceof Error?e.message:String(e)}`);return undefined;}
  };
  if(configured){
    const reviewedExtract=await read("m33a-reviewed-extract.json");
    if(reviewedExtract===undefined)loadErrors.push("NORMATIVE_PRIVATE_EXTRACT_MISSING_OR_INVALID");
    return {reviewedExtract,loadErrors};
  }
  const [wind,factors]=await Promise.all([read("nbr6123-2023-cpe.json"),read("nbr8681-2025-fatores.json")]);
  return {wind,factors,loadErrors};
}
export async function generateNormativeOriginFromRepository(project:Project,input:unknown){
  return generateNormativeOrigin(project,input,await loadNormativeOriginFiles());
}
