import { z } from "zod";
import type { Project } from "./models";
import { structureSignature } from "./calculations/project-basis";
import { generateStructure } from "./calculations/structure";
import { generatedRoofRegions } from "./roof-load-path";
import { calculateWindSpeed,windSpeedInputSchema } from "./wind-speed";
import { windDeclarationSchema } from "./wind-contracts";
import { compileEngineeringCombinations,engineeringId,type EngineeringCombinations } from "./engineering-combinations";
import { distributeWindActions } from "./wind-load-path";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { normativeWindDataSchema,normativeFactorsDataSchema,normativeActionSchema,openingsSchema,
  type NormativeSource,type NormativeAction,type NormativeFactorsData,type ProcedureState } from "./normative-origin-contracts";
import recovered from "../../data/normas/nbr6123-2023-speed.json";

export const normativeOriginVersion="jpn.normative-origin/1";
export const normativeOriginInputSchema=z.object({speed:windSpeedInputSchema,openings:openingsSchema,
  incidencesDeg:z.array(z.number().finite().min(0).lt(360)).min(1).max(4),
  purposes:z.array(z.enum(["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"])).min(1).max(4),
  use:z.string().trim().min(1),windFactorClass:engineeringId,actions:z.array(normativeActionSchema).max(6),
}).strict();
export type NormativeOriginInput=z.infer<typeof normativeOriginInputSchema>;
export interface NormativeFiles {wind?:unknown;factors?:unknown;loadErrors?:string[]}
type Audit={procedure:string;state:ProcedureState;source:unknown;inputs:unknown;selectionRule:string;coefficient:unknown;calculationVersion:string};
const fail=(message:string):never=>{throw Error(message);};
const declared="DECLARED_UNVERIFIED" as const;
const issued=new WeakMap<object,string>();
function canonical(v:unknown):string {
  if(v===undefined)return "null";
  if(v===null||typeof v!=="object")return JSON.stringify(v);
  if(Array.isArray(v))return `[${v.map(canonical).join(",")}]`;
  return `{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
}
async function digest(value:unknown){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(value))))].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function basis(project:Project,input:unknown,files:NormativeFiles){return digest({version:normativeOriginVersion,geometry:structureSignature(project),physical:project.workspace.spatialPreparation,input,files,recovered});}
function reference(s:NormativeSource,revision:string){return {standard:s.standard,edition:s.edition==="2023-original"?"2023":s.edition,
  clause:s.item,source:`${s.documentSha256}: ${s.domain}`,revision,responsible:s.transcriber};}
function audit(procedure:string,source:unknown,inputs:unknown,coefficient:unknown,selectionRule:string,state:ProcedureState=declared):Audit{
  return {procedure,state,source,inputs,coefficient,selectionRule,calculationVersion:normativeOriginVersion};
}
function checkOrigin(data:{origin:string},testOnly:boolean){
  if(!testOnly&&canonical(data).includes("TEST_ONLY_NOT_NORMATIVE"))fail("TEST_ONLY_NOT_NORMATIVE: fixture recusada no fluxo real");
}

function wind(project:Project,input:NormativeOriginInput,raw:unknown,testOnly:boolean,trace:Audit[]){
  if(raw===undefined)fail("CPE_CPI_DATA_MISSING: documento 6123:2023 inventariado e S1/S2/Vk/q disponíveis; faltam valores e domínios transcritos de Cpe/Cpi/zonas");
  const data=normativeWindDataSchema.parse(raw);checkOrigin(data,testOnly);
  const regions=generatedRoofRegions(project),speed=calculateWindSpeed(input.speed),height=Math.max(...generateStructure(project).model!.nodes.map(n=>n.z))/1000;
  if(project.planning?.typology!=="mono"&&project.planning?.typology!=="gable")fail("ROOF_TYPOLOGY_UNSUPPORTED");
  if(Math.abs(height-input.speed.heightM)>1e-10)fail("STALE_WIND_HEIGHT: altura difere da geometria");
  if(new Set(input.incidencesDeg).size!==input.incidencesDeg.length)fail("DUPLICATE_INCIDENCE");
  const slope=Math.atan(Math.abs(regions.regions[0].plane.dzDx||regions.regions[0].plane.dzDy))*180/Math.PI;
  const cases=input.incidencesDeg.flatMap(incidenceDeg=>{
    const openingValues=Object.fromEntries(Object.entries(input.openings).filter(([k])=>k!=="source"&&k!=="revision"));
    const matches=data.rows.filter(r=>{
      const d=r.domain,inside=(x:number|null,range:number[])=>x!==null&&x>=range[0]&&x<=range[1];
      return d.typology===project.planning!.typology&&d.fall===project.roof.fall&&d.incidenceDeg===incidenceDeg&&
        Math.abs(d.slopeDeg-slope)<=64*Number.EPSILON*Math.max(1,slope)&&inside(project.roof.widthM,d.widthM)&&inside(project.roof.lengthM,d.lengthM)&&inside(height,d.heightM)&&
        canonical(d.openings)===canonical(openingValues);
    });
    if(matches.length!==1)fail(`WIND_DOMAIN: incidence ${incidenceDeg}: ${matches.length} linhas aplicáveis; requer seleção única exata, aberturas e domínio completos`);
    const row=matches[0];
    if(new Set(row.cpiCases.map(c=>c.id)).size!==row.cpiCases.length)fail("DUPLICATE_CPI");
    return row.cpiCases.map((internal,j)=>{
      const id=`W${input.incidencesDeg.indexOf(incidenceDeg)}_${j}`;
      const zones=row.zones.map(z=>{
        const r=regions.regions[z.region-1]??fail("ZONE_REGION_UNSUPPORTED"),b=r.boundsM,f=z.boundsFraction;
        const boundsM:[number,number,number,number]=[b[0]+f[0]*(b[2]-b[0]),b[1]+f[1]*(b[3]-b[1]),b[0]+f[2]*(b[2]-b[0]),b[1]+f[3]*(b[3]-b[1])];
        trace.push(audit(`Cpe:${id}:${z.id}`,z.cpe.source,{row:row.id,domain:row.domain,boundsM},z.cpe.value,"exact-row-no-interpolation"));
        return {id:z.id,regionId:r.id,boundsM,kind:z.kind,externalCoefficient:z.cpe.value,internalCoefficient:internal.coefficient.value,reference:reference(z.cpe.source,data.revision)};
      });
      trace.push(audit(`Cpi:${id}`,internal.coefficient.source,{openings:input.openings,row:row.id},internal.coefficient.value,`all internal scenarios; ${internal.id}`));
      return {id,incidenceDeg,dynamicPressurePa:speed.dynamicPressurePa,speedCalculation:input.speed,zones,reference:reference(row.source,data.revision)};
    });
  });
  const first=cases[0].reference;
  const declaration=windDeclarationSchema.parse({schema_version:"jpn.wind-roof/1",normativeValidation:"pending-engineer-review",geometrySignature:structureSignature(project),
    scope:"global-roof-only",transmission:"simply-supported-sheeting-to-parallel-purlins",cases,
    building:{location:input.speed.reference.source,basicVelocityMS:input.speed.v0Mps,velocityReference:input.speed.reference,
      terrain:input.speed.topography,roughness:input.speed.category,topography:input.speed.topography,factorsDescription:"Existing original-edition speed calculation; declared V0/S3/classification",
      enclosure:"enclosed",openingsDescription:canonical(input.openings),internalPressureDescription:"All catalog scenarios retained",staticApplicability:"Only the exact declared catalog domain",
      loadPath:"Simply-supported sheeting to existing physical parallel purlins",reference:first}});
  // Existing distributor is the authority for coverage, geometry and partial-load support.
  return {declaration,distribution:distributeWindActions(project,declaration)};
}

function combinations(actions:NormativeAction[],raw:unknown,use:string,purposes:NormativeOriginInput["purposes"],testOnly:boolean,trace:Audit[]){
  if(raw===undefined)fail("FACTORS_2025_MISSING: captura NBR8681:2025 inventariada; fatores e domínios não transcritos no Git; não usar 2003");
  const data=normativeFactorsDataSchema.parse(raw);checkOrigin(data,testOnly);
  if(data.use!==use)fail("COMBINATION_USE_OUTSIDE_DOMAIN");
  if(new Set(purposes).size!==purposes.length||purposes.some(p=>!data.recipes.some(r=>r.purpose===p)))fail("COMBINATION_PURPOSE_DATA_MISSING");
  if(actions.length>10||new Set(actions.map(a=>a.caseId)).size!==actions.length)fail("ACTION_CONTRACT_LIMIT_OR_DUPLICATE");
  if(new Set(data.recipes.map(r=>r.id)).size!==data.recipes.length)fail("DUPLICATE_RECIPE");
  if(new Set(data.factors.map(f=>canonical([f.factorClass,f.category,f.role,f.effect,f.purpose]))).size!==data.factors.length)fail("DUPLICATE_FACTOR_DOMAIN");
  const result:EngineeringCombinations["combinations"]=[];
  const provenance=new WeakMap<object,NormativeFactorsData["factors"][number]>();
  for(const recipe of data.recipes.filter(r=>purposes.includes(r.purpose))){
    const variables=actions.filter(a=>a.category!=="permanent");
    const leaders:(string|null)[]=recipe.leading==="none"?[null]:variables.map(a=>a.caseId);
    if(recipe.leading!=="none"&&recipe.includePermanentOnly)leaders.push(null);
    if(!leaders.length)fail("NO_APPLICABLE_LEADING_ACTION");
    for(const leader of leaders){
      const walk=(i:number,terms:EngineeringCombinations["combinations"][number]["terms"],groups:Set<string>)=>{
        if(i===actions.length){
          if(!terms.some(t=>t.gamma*t.psi>0))return;
          if(result.length>=256)fail("COMBINATION_LIMIT_256: no truncation");
          const id=`C${result.length+1}`;
          result.push({id,purpose:recipe.purpose,hypothesis:`${recipe.id}; leading=${leader??"none"}; catalog=${data.revision}`,reference:reference(recipe.source,data.revision),terms});
          for(const t of terms)trace.push(audit(`factor:${id}:${t.caseId}`,provenance.get(t),{recipe:recipe.id,leader,action:actions.find(a=>a.caseId===t.caseId)},
            {gamma:t.gamma,psi:t.psi,factor:t.gamma*t.psi},"exact factor row; exclusive actions inactive"));
          return;
        }
        const action=actions[i],primary=action.caseId===leader,leaderAction=actions.find(a=>a.caseId===leader);
        const exclusive=action.exclusiveGroup!==null&&(groups.has(action.exclusiveGroup)||(!primary&&leaderAction?.exclusiveGroup===action.exclusiveGroup));
        const roles=action.category==="permanent"?["permanent"]:primary?["leading"]:exclusive||leader===null&&recipe.leading==="each-variable"?["absent"]:["absent","accompanying"];
        for(const role of roles)for(const effect of role==="leading"||role==="absent"?["unfavorable"]:["favorable","unfavorable"]){
          const found=data.factors.filter(f=>f.factorClass===action.factorClass&&f.category===action.category&&f.purpose===recipe.purpose&&f.role===role&&f.effect===effect);
          if(found.length!==1)fail(`FACTOR_DOMAIN: ${action.caseId}/${recipe.purpose}/${role}/${effect}: expected one factor row`);
          const f=found[0],value=f.gamma.value*f.psi.value;
          if(role==="absent"&&value!==0)fail("ABSENT_ACTION_FACTOR_MUST_BE_ZERO");
          if(role==="leading"&&value<=0)fail("LEADING_ACTION_MUST_BE_ACTIVE");
          const next=new Set(groups);if(value>0&&action.exclusiveGroup!==null){if(next.has(action.exclusiveGroup))continue;next.add(action.exclusiveGroup);}
          const ref=reference(f.gamma.source,data.revision);
          ref.source=`gamma=${f.gamma.source.documentSha256}/${f.gamma.source.item}; psi=${f.psi.source.documentSha256}/${f.psi.source.item}; ${effect}; ${action.factorClass}`;
          const term={caseId:action.caseId,gamma:f.gamma.value,psi:f.psi.value,reference:ref};provenance.set(term,f);
          walk(i+1,[...terms,term],next);
        }
      };walk(0,[],new Set());
    }
  }
  if(!result.length)fail("NO_COMBINATIONS");
  // Keep existing ten-combination request cap; never silently drop a scenario.
  return Array.from({length:Math.ceil(result.length/10)},(_,i)=>{
    const declaration:EngineeringCombinations={schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
      actions:actions.map(a=>({caseId:a.caseId,category:a.category,exclusiveGroup:a.exclusiveGroup,reference:reference(data.source,data.revision)})),combinations:result.slice(i*10,i*10+10)};
    return compileEngineeringCombinations(declaration,actions.map(a=>a.caseId));
  });
}

async function generate(project:Project,value:unknown,files:NormativeFiles,testOnly:boolean){
  const trace:Audit[]=[],blockers:string[]=[...(files.loadErrors??[])];
  const signature=await basis(project,value,files);
  const input=normativeOriginInputSchema.safeParse(value);
  let generatedWind:ReturnType<typeof wind>|null=null,batches:ReturnType<typeof combinations>=[];
  if(!input.success){const reason=`INPUT_DOMAIN: ${input.error.issues[0].message}`;blockers.push(reason);trace.push(audit("input-domain",null,value,null,reason,"BLOCKED_UNSUPPORTED"));}
  else {
    try{const speed=calculateWindSpeed(input.data.speed);
      trace.push(audit("S1/S2/Vk/q-original-2023",recovered,{speed:input.data.speed},speed,"existing wind-speed/1", "SUPPORTED_VERIFIED"));
      trace.push(audit("V0/S3/classification",input.data.speed.reference,input.data.speed,null,"declared dependencies; errata 2025 not verified"));
    }catch(e){blockers.push(String(e));trace.push(audit("S1/S2/Vk/q-original-2023",recovered,input.data.speed,null,String(e),"BLOCKED_UNSUPPORTED"));}
    try{generatedWind=wind(project,input.data,files.wind,testOnly,trace);}catch(e){blockers.push(String(e));trace.push(audit("Cpe/Cpi/zones",files.wind??null,input.data,null,String(e),"BLOCKED_UNSUPPORTED"));}
    if(generatedWind){
      const actions=[...input.data.actions,...generatedWind.declaration.cases.map(c=>({caseId:c.id,category:"wind" as const,exclusiveGroup:"M33W",factorClass:input.data.windFactorClass}))];
      try{batches=combinations(actions,files.factors,input.data.use,input.data.purposes,testOnly,trace);}catch(e){blockers.push(String(e));trace.push(audit("NBR8681:2025-combinations",files.factors??null,input.data.actions,null,String(e),"BLOCKED_UNSUPPORTED"));}
    }else {
      const reason=files.factors===undefined?"FACTORS_2025_MISSING: supplied capture recorded; numerical factors/domain unavailable in Git":"WIND_PRECONDITION_BLOCKED: cannot assemble physical action set";
      blockers.push(reason);trace.push(audit("NBR8681:2025-combinations",files.factors??null,input.data.actions,null,reason,"BLOCKED_UNSUPPORTED"));
    }
  }
  const result={schema_version:normativeOriginVersion,signature,state:blockers.length?"BLOCKED_UNSUPPORTED" as const:declared,
    blockers,procedures:trace,wind:generatedWind,batches,testOnly,
    currentEditionCorrectionsVerified:false,normative_second_order_verified:false,approved_for_fabrication:false,computedStructuralApproval:false,fabricationRelease:false};
  issued.set(result,await digest(result));return result;
}
export type NormativeOriginRun=Awaited<ReturnType<typeof generate>>;
export function generateNormativeOrigin(project:Project,input:unknown,files:NormativeFiles={}){return generate(project,input,files,false);}
/** Test fixtures cannot be admitted through the production entry point. */
export function generateNormativeOriginTestStudy(project:Project,input:unknown,files:NormativeFiles){
  if(process.env.NODE_ENV!=="test")throw Error("TEST_ONLY_NOT_NORMATIVE: test harness unavailable outside tests");
  return generate(project,input,files,true);
}
export async function assertNormativeOriginFresh(project:Project,input:unknown,files:NormativeFiles,run:NormativeOriginRun){
  if(!issued.has(run)||issued.get(run)!==await digest(run))throw Error("IMPORTED_OR_EDITED_NORMATIVE_RUN: imported JSON cannot grant verified execution");
  if(run.signature!==await basis(project,input,files))throw Error("STALE_NORMATIVE_ORIGIN: geometry/actions/parameters/provider changed");
  if(run.testOnly&&process.env.NODE_ENV!=="test")throw Error("TEST_ONLY_NOT_NORMATIVE");
}
export async function materializeNormativeOriginStudy(project:Project,input:unknown,files:NormativeFiles,run:NormativeOriginRun){
  await assertNormativeOriginFresh(project,input,files,run);
  if(run.state==="BLOCKED_UNSUPPORTED"||!run.wind)throw Error(`BLOCKED_UNSUPPORTED: ${run.blockers.join("; ")}`);
  const p=structuredClone(project),d=p.workspace.spatialPreparation??fail("PHYSICAL_PREPARATION_MISSING");
  const args=normativeOriginInputSchema.parse(input);
  if(d.loading?.wind)fail("EXISTING_WIND: remove/replace explicitly before generating a new origin");
  if(canonical([...d.cases.map(c=>c.id)].sort())!==canonical(args.actions.map(a=>a.caseId).sort()))fail("PHYSICAL_ACTIONS_MISMATCH");
  const loading=d.loading??fail("PHYSICAL_LOADING_MISSING");
  loading.wind=run.wind.declaration;
  d.cases.push(...run.wind.declaration.cases.map(c=>({id:c.id,source:`Normative-origin study ${run.signature}`})));
  const projects:Project[]=[];
  for(const batch of run.batches){
    d.engineeringCombinations=batch.declaration;d.combinations=batch.combinations;
    projects.push(structuredClone(p));
  }
  return {state:run.state,signature:run.signature,projects,computedStructuralApproval:false,fabricationRelease:false};
}
export async function adaptNormativeOriginStudy(project:Project,input:unknown,files:NormativeFiles,run:NormativeOriginRun){
  const studies=await materializeNormativeOriginStudy(project,input,files,run),prepared=[];
  // Existing physical reviews (including possible double count) must pass.
  for(const p of studies.projects)prepared.push(await adaptLoadedMixedProject(p));
  return {state:run.state,signature:run.signature,prepared,computedStructuralApproval:false,fabricationRelease:false};
}
export async function normativeEnvelope(run:NormativeOriginRun,purpose:NormativeOriginInput["purposes"][number],values:{combinationId:string;value:number}[]){
  if(!issued.has(run)||issued.get(run)!==await digest(run)||run.state==="BLOCKED_UNSUPPORTED")throw Error("IMPORTED_OR_EDITED_NORMATIVE_RUN");
  const ids=run.batches.flatMap(b=>b.declaration.combinations.filter(c=>c.purpose===purpose).map(c=>c.id));
  if(!ids.length)throw Error("ENVELOPE_PURPOSE_UNAVAILABLE");
  if(values.length!==ids.length||new Set(values.map(v=>v.combinationId)).size!==ids.length||values.some(v=>!ids.includes(v.combinationId)||!Number.isFinite(v.value)))throw Error("ENVELOPE_COMBINATION_COVERAGE");
  const sorted=[...values].sort((a,b)=>a.value-b.value);
  return {signature:run.signature,purpose,state:run.state,computedStructuralApproval:false,fabricationRelease:false,
    minimum:sorted[0],maximum:sorted.at(-1)!,maximumAbsolute:values.reduce((a,b)=>Math.abs(a.value)>=Math.abs(b.value)?a:b)};
}
