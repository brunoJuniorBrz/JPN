import type {EngineeringCombinations} from "./engineering-combinations";
import type {DemandForces} from "./member-demands";

/** M44-P1: per-piece x ULS-combination resistance matrix. It only COMBINES what already exists:
 * NBR 8681 combinations (engineering declaration), solver demands per station and the NBR 14762
 * member checks executed by the engine. Anything not executed or BLOCKED stays `unsupported`. */
const COMPONENTS=["nN","vyN","vzN","tNm","myNm","mzNm"] as const;
type Component=typeof COMPONENTS[number];
export type DemandSample={pieceId:string;combinationId:string;segmentId:string;originalPositionM:number;forces:DemandForces};
export type MatrixDemands={pieces:{pieceId:string;samples:DemandSample[]}[]};
export type ExecutedCheck={id:string;status:"PASS"|"FAIL"|"CONDITIONAL"|"BLOCKED";demand?:number;resistance?:number;utilization:number|null;
  clauses?:string[];reason?:string;governing?:{position_m:number;segment_id:string}|null};
/** Resistance standard that produced the checks of a piece: NBR 14762:2010 (cold-formed, default) or NBR 8800:2024 (I/H). */
export type ResistanceStandard="NBR14762"|"NBR8800";
export type DesignExecution={pieceId:string;combinationId:string;checks:ExecutedCheck[]};
function fail(c:string,m:string):never{throw Error(c+": "+m);}

/** Quadratic force field in u in [0,1] from solver stations (5 per frame segment, 2 per axial segment),
 * verified at the stations not used for the fit. Never extrapolates and never invents a component. */
export function fitSegmentForceField(stations:{u:number;forces:DemandForces}[]){
  const out:Record<Component,number[]|null>={nN:null,vyN:null,vzN:null,tNm:null,myNm:null,mzNm:null};
  for(const key of COMPONENTS){
    const v=stations.map(s=>s.forces[key]);
    if(v.every(x=>x===null))continue;
    if(v.some(x=>x===null))fail("DEMAND_FIELD_INCOMPLETE","componente "+key+" ausente em parte das estações");
    const f=v as number[],n=f.length,scale=Math.max(1,...f.map(Math.abs));
    if(n===2){out[key]=[f[0],f[1]-f[0]];continue;}
    if(n!==5)fail("DEMAND_FIELD_STATIONS","esperadas 2 ou 5 estações por segmento");
    const c2=2*f[4]-4*f[2]+2*f[0],c1=f[4]-f[0]-c2;
    for(const i of [1,3]){
      const u=i/4;
      if(Math.abs(f[0]+c1*u+c2*u*u-f[i])>1e-9*scale)fail("DEMAND_FIELD_NOT_QUADRATIC","campo de "+key+" não é quadrático nas estações do solver: sem extrapolação");
    }
    out[key]=[f[0],c1,c2];
  }
  return out;
}

const eps=(values:number[])=>1e-9*Math.max(1,...values.map(Math.abs));
/** Checks that the demand of this piece/combination REQUIRES (check ids as emitted by the engine of each standard). */
export function requiredChecks(forces:DemandForces[],standard:ResistanceStandard="NBR14762"){
  const col=(k:Component)=>forces.map(f=>f[k]).filter((x):x is number=>x!==null);
  const need=new Set<string>(),sign=(k:Component)=>{const v=col(k),e=eps(v);return {pos:v.some(x=>x>e),neg:v.some(x=>x<-e)};};
  const n=sign("nN"),my=sign("myNm"),mz=sign("mzNm"),vz=sign("vzN"),vy=sign("vyN"),t=sign("tNm");
  if(n.neg){need.add("compression");need.add("compression-slenderness");}
  if(n.pos){need.add("tension");need.add("tension-slenderness");}
  if(standard==="NBR8800"){
    if(my.pos||my.neg)need.add("my");
    if(mz.pos||mz.neg)need.add("mz");
  }else{
    if(my.pos)need.add("my_positive");if(my.neg)need.add("my_negative");
    if(mz.pos)need.add("mz_positive");if(mz.neg)need.add("mz_negative");
  }
  if(vz.pos||vz.neg)need.add("shear_z");
  if(vy.pos||vy.neg)need.add("unsupported-vyN");
  if(t.pos||t.neg)need.add("unsupported-tNm");
  if((n.pos||n.neg)&&(my.pos||my.neg||mz.pos||mz.neg))need.add(standard==="NBR8800"?"combined-5.5.1.2":"combined-9.9");
  if(standard==="NBR14762"&&(vz.pos||vz.neg)&&(my.pos||my.neg))need.add("bending-shear-9.8.4");
  return [...need];
}

export function buildMemberCombinationMatrix(input:{engineeringCombinations:EngineeringCombinations|null;demands:MatrixDemands;executions:DesignExecution[];
  pieceStandards?:Record<string,ResistanceStandard>}){
  const declaration=input.engineeringCombinations;
  if(!declaration)fail("COMBINATIONS_PENDING","combinações ELU/ELS ausentes: gere-as pela NBR 8681 antes");
  const uls=declaration.combinations.filter(c=>c.purpose==="ULS");
  if(!uls.length)fail("COMBINATIONS_PENDING","nenhuma combinação ELU declarada");
  const known=new Set(declaration.combinations.map(c=>c.id)),seen=new Set<string>();
  for(const e of input.executions){
    const key=JSON.stringify([e.pieceId,e.combinationId]);
    if(seen.has(key))fail("EXECUTION_DUPLICATE","execução repetida para "+e.pieceId+"/"+e.combinationId);seen.add(key);
    if(!known.has(e.combinationId))fail("EXECUTION_UNKNOWN_COMBINATION","execução para combinação inexistente "+e.combinationId);
    if(!input.demands.pieces.some(p=>p.pieceId===e.pieceId))fail("EXECUTION_UNKNOWN_PIECE","execução para peça sem demanda "+e.pieceId);
  }
  const rows=input.demands.pieces.flatMap(piece=>uls.map(c=>{
    const samples=piece.samples.filter(s=>s.combinationId===c.id);
    if(!samples.length)return {pieceId:piece.pieceId,combinationId:c.id,status:"unsupported" as const,reason:"sem demanda do solver para esta combinação",
      combination:null,demand:null,requiredChecks:[],missingChecks:[],executedChecks:[],maxUtilization:null};
    const envelope=Object.fromEntries(COMPONENTS.map(k=>{
      const v=samples.filter(s=>s.forces[k]!==null);
      if(!v.length)return [k,null];
      const a=v.reduce((x,y)=>Math.abs(y.forces[k]!)>Math.abs(x.forces[k]!)?y:x);
      return [k,{absoluteMax:Math.abs(a.forces[k]!),signedValue:a.forces[k]!,positionM:a.originalPositionM,segmentId:a.segmentId,
        minimum:Math.min(...v.map(s=>s.forces[k]!)),maximum:Math.max(...v.map(s=>s.forces[k]!))}];
    }));
    const standard=input.pieceStandards?.[piece.pieceId]??"NBR14762";
    const required=requiredChecks(samples.map(s=>s.forces),standard);
    if(!required.length)return {pieceId:piece.pieceId,combinationId:c.id,status:"no-demand" as const,
      reason:"nenhum esforço solicitante não nulo nesta combinação: nada a verificar (não é aprovação da peça)",
      combination:{purpose:c.purpose,hypothesis:c.hypothesis,reference:c.reference,
        factors:c.terms.map(t=>({caseId:t.caseId,gamma:t.gamma,psi:t.psi,factor:t.gamma*t.psi}))},
      demand:envelope,requiredChecks:required,missingChecks:[] as string[],executedChecks:input.executions.find(e=>e.pieceId===piece.pieceId&&e.combinationId===c.id)?.checks??[],maxUtilization:null};
    const exec=input.executions.find(e=>e.pieceId===piece.pieceId&&e.combinationId===c.id);
    const executed=exec?.checks??[],ids=new Set(executed.map(k=>k.id));
    const missing=required.filter(id=>!ids.has(id)),blocked=executed.filter(k=>k.status==="BLOCKED"&&k.id!=="no-demand").map(k=>k.id);
    const status=!exec?"unsupported" as const:(missing.length||blocked.length)?"unsupported" as const:
      executed.some(k=>k.status==="FAIL")?"FAIL" as const:executed.some(k=>k.status==="CONDITIONAL")?"CONDITIONAL" as const:"PASS" as const;
    const utilizations=executed.map(k=>k.utilization).filter((u):u is number=>u!==null);
    return {pieceId:piece.pieceId,combinationId:c.id,status,resistanceStandard:standard,
      reason:!exec?"nenhuma verificação NBR 14762 executada para esta peça/combinação":missing.length?"verificações exigidas pela demanda ausentes: "+missing.join(", "):
        blocked.length?"verificações bloqueadas: "+blocked.map(id=>id+": "+(executed.find(c=>c.id===id)?.reason??"procedimento não concluído")).join("; "):null,
      combination:{purpose:c.purpose,hypothesis:c.hypothesis,reference:c.reference,
        factors:c.terms.map(t=>({caseId:t.caseId,gamma:t.gamma,psi:t.psi,factor:t.gamma*t.psi}))},
      demand:envelope,requiredChecks:required,missingChecks:missing,executedChecks:executed,
      maxUtilization:utilizations.length?Math.max(...utilizations):null};
  }));
  return {schema_version:"jpn.member-combination-matrix/1" as const,standardsUsed:["ABNT NBR 8681:2025",...[...new Set(input.demands.pieces.map(p=>input.pieceStandards?.[p.pieceId]??"NBR14762"))].map(x=>x==="NBR8800"?"ABNT NBR 8800:2024 (Errata 1:2025)":"ABNT NBR 14762:2010")],
    scope:"combinações ELU por peça; ELS e deslocamentos fora desta matriz",rows,
    unsupportedRows:rows.filter(r=>r.status==="unsupported").length,failedRows:rows.filter(r=>r.status==="FAIL").length,
    noDemandRows:rows.filter(r=>r.status==="no-demand").length,
    status:rows.some(r=>r.status==="unsupported")?"unsupported" as const:rows.some(r=>r.status==="FAIL")?"FAIL" as const:"CONDITIONAL" as const,
    memberAllLimitStatesVerified:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const};
}
