import physicalFixture from "./test-support/m34ab-declared.json" with {type:"json"};
import historical from "../../validation/m35/browser-375.json" with {type:"json"};
import tomSource from "../../validation/tom-2026/tom-commercial-source.json" with {type:"json"};
import {newProject,projectSchema,type Project,type Settings} from "./models";
import {applyTomCommercial} from "./tom-commercial";
import {emptyLoading,anyMixedRequestSchema,anyMixedResultSchema,verifyLoadingTrace} from "./structural-loading";
import {mixedInputHash,verifyMixedResult} from "./mixed-analysis";
import {DEMO_SOURCE_COMMIT,technicalDataLabels,type TechnicalDataKey} from "./demonstration-schema";

export {tomSource};
export const historicalSource={commit:DEMO_SOURCE_COMMIT,path:"validation/m35/browser-375.json",url:`https://github.com/brunoJuniorBrz/JPN/blob/${DEMO_SOURCE_COMMIT}/validation/m35/browser-375.json`};
export function createTomDemonstration(settings?:Settings){
  const p=newProject(settings);p.name="Cobertura Tom — demonstração comercial";p.client="Tom";
  p.description="Referência comercial auditada. Geometria real e dados físicos ainda pendentes; não é projeto executivo.";
  p.workspace.demonstration={version:1,kind:"tom-commercial",technicalData:Object.fromEntries(Object.keys(technicalDataLabels).map(key=>[key,{information:"",source:""}]))};
  return applyTomCommercial(p);
}
export function createMathematicalDemonstration(parentProjectId?:string):Project{
  // Reuse the existing M34 geometry and the actual M35 UDL execution record.
  // Only the saved project identity changes; no member/support/property is inferred.
  const p=projectSchema.parse(structuredClone(physicalFixture)),d=p.workspace.spatialPreparation!,now=new Date().toISOString();
  p.id=crypto.randomUUID();p.name="Validação matemática M35 — balanço misto";p.client="Demonstração matemática independente";p.isExample=false;p.createdAt=now;p.updatedAt=now;
  p.description="Fixture sintética M35 já validada, com pórticos, axial e carga uniforme. Não representa a obra Tom.";
  p.workspace.demonstration={version:1,kind:"mathematical-validation",...(parentProjectId?{parentProjectId}:{})};
  d.loads=[];d.loading=emptyLoading();
  const reference=anyMixedRequestSchema.parse(historical.request);
  if(reference.schema_version!=="jpn.mixed3d/2")throw Error("Referência M35 incompatível.");
  d.loading.uniform=reference.member_loads.map(l=>({id:l.id.slice(0,l.id.lastIndexOf(":")),pieceId:l.member,caseId:l.case,coordinates:l.coordinate_system,knM:l.force_per_length_n_m.map(v=>v/1000) as [number,number,number],source:l.source,revision:l.revision}));
  return projectSchema.parse(p);
}

const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,"en")).map(([k,v])=>[k,canonical(v)])):value;
export function compareMathematicalReference(request:unknown,result:unknown){
  const input=anyMixedRequestSchema.parse(request),output=anyMixedResultSchema.parse(result),baseline=anyMixedRequestSchema.parse(historical.request);
  // Project identity/source are provenance; all remaining numerical input must match.
  const withoutProject=(r:typeof input)=>{const {project:_,...rest}=r;void _;return canonical(rest);};
  if(JSON.stringify(withoutProject(input))!==JSON.stringify(withoutProject(baseline)))return null;
  const tip=output.combinations.Q1.nodes.B2.translation_m[2],reaction=output.combinations.Q1.nodes.B0.reaction_force_n[2];
  return {tipM:tip,expectedTipM:-0.00096875,tipDifferenceM:tip-(-0.00096875),reactionN:reaction,expectedReactionN:200};
}
export async function verifiedHistoricalDemonstration(){
  const request=anyMixedRequestSchema.parse(historical.request),result=anyMixedResultSchema.parse(historical.result),hash=await mixedInputHash(request);
  verifyMixedResult(request,result,hash);verifyLoadingTrace(request,result);
  return {request,result,inputHash:hash,source:historicalSource,comparison:compareMathematicalReference(request,result),historical:true as const,computedStructuralApproval:false as const,fabricationRelease:false as const};
}
export function technicalDataRows(project:Project){
  return (Object.entries(technicalDataLabels) as [TechnicalDataKey,string][]).map(([key,label])=>{
    const row=project.workspace.demonstration?.technicalData?.[key];
    return {key,label,information:row?.information??"",source:row?.source??"",status:row?.information.trim()?"Informado — confirmar com responsável técnico":"Pendente"};
  });
}
