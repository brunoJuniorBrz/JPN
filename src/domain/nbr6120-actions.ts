import {z} from "zod";
import {createHash} from "node:crypto";
import data from "../../data/normas/nbr6120-2019-actions.json" with {type:"json"};
import data8681 from "../../data/normas/nbr8681-2025-combinations.json" with {type:"json"};
import type {Project} from "./models";
import {emptyLoading} from "./structural-loading";
import {spatialPreparationSchema} from "./spatial-preparation";
import {resolvePhysicalStructure} from "./physical-structure";
import {declaredRoofDistributionSignature} from "./declared-roof-load-path";

/** M42-P2: NBR 6120:2019 gravity actions for roofs -> existing roofArea / nodal load path -> NBR 8681 actions.
 * Nothing here computes structure weight (the solver self-weight/catalog owns it) and nothing
 * invents densities, thicknesses or materials: every value comes from the versioned data file
 * (Tabelas 1, 5, 8; item 6.4) or from an explicitly declared, sourced input. */
function fail(c:string,m:string):never{throw Error(c+": "+m);}
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/);
const text=z.string().trim().min(10).max(500);
const permanentTypes=Object.keys(data8681.table1.types) as [string,...string[]];
const claddings=Object.keys(data.permanent.table5Telhas.items) as [string,...string[]];
const ceilings=Object.keys(data.permanent.table8Ceilings.items) as [string,...string[]];
export const nbr6120InputSchema=z.object({
  schema_version:z.literal("jpn.nbr6120-roof-actions/1"),
  permanent:z.array(z.discriminatedUnion("kind",[
    z.object({kind:z.literal("roof-cladding"),caseId:id,item:z.enum(claddings),permanentType8681:z.enum(permanentTypes)}).strict(),
    z.object({kind:z.literal("ceiling-or-installation"),caseId:id,item:z.enum(ceilings),permanentType8681:z.enum(permanentTypes)}).strict(),
    z.object({kind:z.literal("declared-area-load"),caseId:id,knM2:z.number().finite().positive().max(50),
      projection:z.enum(["horizontal","roof-surface"]),description:text,source:text,permanentType8681:z.enum(permanentTypes)}).strict(),
  ])).max(6).default([]),
  roofLiveLoad:z.object({caseId:id,
    /** 6.4: 0,25 kN/m² with sufficient drainage and rigidity; Annex D check is declared, not computed. */
    drainageReduction:z.object({annexDVerified:z.literal(true),description:text}).strict().optional(),
  }).strict().optional(),
  concentratedLoad:z.object({caseId:id,nodeId:z.string().min(1).max(100),positionDeclaredMostUnfavorable:z.literal(true)}).strict().optional(),
}).strict();
export type Nbr6120Input=z.infer<typeof nbr6120InputSchema>;

/** Steepest-descent slope of a planar roof face, in % (Newell normal of the ring, mm). */
export function roofSlopePercent(ring:[number,number,number][]){
  const pts=ring.length>1&&ring[0].every((v,i)=>v===ring.at(-1)![i])?ring.slice(0,-1):ring;
  let nx=0,ny=0,nz=0;
  for(let i=0;i<pts.length;i++){
    const [x1,y1,z1]=pts[i],[x2,y2,z2]=pts[(i+1)%pts.length];
    nx+=(y1-y2)*(z1+z2);ny+=(z1-z2)*(x1+x2);nz+=(x1-x2)*(y1+y2);
  }
  if(Math.abs(nz)<1e-9)fail("NBR6120_SLOPE","face vertical ou degenerada não é cobertura");
  return 100*Math.hypot(nx,ny)/Math.abs(nz);
}
/** 6.4 / Figura 2: roof live load per horizontal projection area, kN/m². */
export function roofVariableLoad(slopePercent:number,drainage?:{annexDVerified:true}){
  const r=data.variable.roof;
  if(!Number.isFinite(slopePercent)||slopePercent<r.minSlopePercent-1e-9)
    fail("NBR6120_SLOPE","a norma exige inclinação mínima de 1 % (6.4); recebido "+slopePercent.toFixed(3)+" %");
  const i=slopePercent,alpha=i<=2?1:i<3?2-0.5*i:0.5;
  let q=Math.min(0.5,Math.max(0.25,0.5*alpha)),basis="6.4: q=0,50·α, α="+alpha.toFixed(4)+", i="+i.toFixed(3)+" %";
  if(drainage){
    if(i<5&&!drainage.annexDVerified)fail("NBR6120_ANNEX_D","redução a 0,25 kN/m² com i<5 % exige verificação do Anexo D");
    q=0.25;basis+="; 0,25 kN/m² por drenagem suficiente e rigidez adequada (Anexo D declarado)";
  }
  return {qKnM2:q,alpha,clause:"6.4 e Figura 2 (p.29-30)",basis,projection:"horizontal" as const};
}
/** One roof live load per case: every face must yield the same 6.4 value (the load path applies a single value per case). */
export function roofLoadForFaces(faces:{id:string;outer:[number,number,number][]}[],drainage?:{annexDVerified:true}){
  const loads=faces.map(f=>({id:f.id,slope:roofSlopePercent(f.outer),...roofVariableLoad(roofSlopePercent(f.outer),drainage)}));
  if(!loads.length)fail("NBR6120_MODEL_PENDING","sem faces de cobertura");
  if(loads.some(l=>Math.abs(l.qKnM2-loads[0].qKnM2)>1e-9))
    fail("NBR6120_PER_FACE_LOAD_UNSUPPORTED","faces com inclinações que geram cargas diferentes ("+loads.map(l=>l.id+": "+l.qKnM2.toFixed(3)).join(", ")+"): o caminho de cargas atual aplica um único valor por caso");
  return {qKnM2:loads[0].qKnM2,loads};
}
/** 5.2/Tabela 1: audit (no block) of a declared steel density against the table range. */
export function steelSelfWeightAudit(densityKgM3:number,gravityMS2=9.80665){
  const w=densityKgM3*gravityMS2/1000,s=data.permanent.table1.steel;
  return {weightKnM3:w,withinTable1Range:w>=s.minKnM3-1e-9&&w<=s.maxKnM3+1e-9,table1:s,
    differenceFromMeanPercent:100*(w-s.meanKnM3)/s.meanKnM3,clause:data.permanent.table1.clause};
}
const rev=()=>data.revision;
const src=(c:string)=>"ABNT NBR 6120:2019 "+c+"; data/normas/nbr6120-2019-actions.json";
const LOAD_PATH="Telhas/chapas simplesmente apoiadas entre terças reais (parallel-purlin-strips) -> vínculos físicos declarados";
const uuidFor=(seed:string)=>{
  const h=createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};

export function applyNbr6120Actions(project:Project,raw:unknown){
  const input=nbr6120InputSchema.parse(raw),d=project.workspace.spatialPreparation;
  if(!d||!d.physicalRoofFaces||!project.workspace.physicalStructure)
    fail("NBR6120_MODEL_PENDING","estrutura física e faces de cobertura são obrigatórias");
  const geometry=resolvePhysicalStructure(project).model;
  if(!geometry)fail("NBR6120_MODEL_PENDING","estrutura física não resolvida");
  const caseIds=[...input.permanent.map(p=>p.caseId),...(input.roofLiveLoad?[input.roofLiveLoad.caseId]:[]),...(input.concentratedLoad?[input.concentratedLoad.caseId]:[])];
  if(new Set(caseIds).size!==caseIds.length)fail("NBR6120_DUPLICATE_CASE","cada ação deve ter um caso próprio (evita duplicidade de cargas)");
  const existing=new Set(d.cases.map(c=>c.id));
  for(const c of caseIds)if(existing.has(c))fail("NBR6120_CASE_EXISTS","o caso "+c+" já existe no modelo");
  const trace:Record<string,unknown>[]=[],roofArea:NonNullable<typeof d.loading>["roofArea"]=[],newCases:{id:string;source:string}[]=[],actions:Record<string,unknown>[]=[];
  for(const p of input.permanent){
    let knM2:number,projection:"horizontal"|"roof-surface",clause:string,label:string;
    if(p.kind==="roof-cladding"){
      const it=(data.permanent.table5Telhas.items as Record<string,{label:string;knM2:number}>)[p.item];
      knM2=it.knM2;projection="roof-surface";clause="5.4, Tabela 5 (p.13), "+p.item;label=it.label;
    }else if(p.kind==="ceiling-or-installation"){
      const it=(data.permanent.table8Ceilings.items as Record<string,{label:string;knM2:number}>)[p.item];
      knM2=it.knM2;projection="horizontal";clause="5.4, Tabela 8 (p.14), "+p.item;label=it.label;
    }else{knM2=p.knM2;projection=p.projection;clause="valor declarado: "+p.source;label=p.description;}
    roofArea.push({caseId:p.caseId,knM2,projection,direction:[0,0,-1],source:src(clause),revision:rev(),loadPath:LOAD_PATH});
    newCases.push({id:p.caseId,source:"Ação permanente: "+label});
    actions.push({nature:"permanent",caseId:p.caseId,permanentType:p.permanentType8681});
    trace.push({caseId:p.caseId,nature:"permanent",kind:p.kind,clause,knM2,projection,label,permanentType8681:p.permanentType8681});
  }
  if(input.roofLiveLoad){
    const {qKnM2:q,loads}=roofLoadForFaces(d.physicalRoofFaces.faces as {id:string;outer:[number,number,number][]}[],input.roofLiveLoad.drainageReduction);
    roofArea.push({caseId:input.roofLiveLoad.caseId,knM2:q,projection:"horizontal",direction:[0,0,-1],
      source:src(loads[0].clause),revision:rev(),loadPath:LOAD_PATH});
    newCases.push({id:input.roofLiveLoad.caseId,source:"Sobrecarga de cobertura NBR 6120:2019 6.4 (projeção horizontal)"});
    actions.push({nature:"variable",caseId:input.roofLiveLoad.caseId,variableType:"other-and-equipment-temperature",
      psiRow:data.psiRowFor8681.row,exclusiveGroup:null,isolated:false});
    trace.push({caseId:input.roofLiveLoad.caseId,nature:"variable",clause:loads[0].clause,knM2:q,projection:"horizontal",
      faces:loads.map(l=>({id:l.id,slopePercent:l.slope,alpha:l.alpha,qKnM2:l.qKnM2})),basis:loads[0].basis,psiRowFor8681:data.psiRowFor8681.row});
  }
  const loads=[...d.loads];
  if(input.concentratedLoad){
    const c=input.concentratedLoad;
    if(!geometry.nodes.some(n=>n.id===c.nodeId))fail("NBR6120_NODE","nó "+c.nodeId+" inexistente");
    loads.push({id:uuidFor("nbr6120:"+c.caseId+":"+c.nodeId),caseId:c.caseId,nodeId:c.nodeId,
      fxKn:0,fyKn:0,fzKn:-data.variable.concentrated.valueKn,mxKnm:0,myKnm:0,mzKnm:0});
    newCases.push({id:c.caseId,source:"Carga concentrada de 1 kN NBR 6120:2019 6.4, posição declarada mais desfavorável"});
    actions.push({nature:"variable",caseId:c.caseId,variableType:"other-and-equipment-temperature",
      psiRow:data.psiRowFor8681.row,exclusiveGroup:null,isolated:true});
    trace.push({caseId:c.caseId,nature:"variable",clause:data.variable.concentrated.clause,valueKn:data.variable.concentrated.valueKn,
      nodeId:c.nodeId,isolated:true,limitation:data.variable.concentrated.positionNote});
  }
  const loading={...(d.loading??emptyLoading()),roofArea:[...(d.loading?.roofArea??[]),...roofArea]};
  delete loading.overlapReview;
  if(roofArea.length&&!loading.roofDistribution)
    loading.roofDistribution={version:1,method:"parallel-purlin-strips",geometrySignature:declaredRoofDistributionSignature(project)};
  const next=spatialPreparationSchema.parse({...d,cases:[...d.cases,...newCases],loads,loading});
  return {project:{...project,workspace:{...project.workspace,spatialPreparation:next}} as Project,
    nbr8681Actions:actions,trace,standard:"ABNT NBR 6120:2019",dataRevision:data.revision,
    notApplied:data.blocked,errataVerified:false as const,computedStructuralApproval:false as const,
    fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}
