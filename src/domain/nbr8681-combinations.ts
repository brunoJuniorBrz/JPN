import {z} from "zod";
import {MAX_COMBINATIONS} from "./analysis-limits";
import {NBR8681_SOURCE_LABEL} from "./nbr8681-source";
import {clearProvenance} from "./normative-provenance-apply";
import data from "../../data/normas/nbr8681-2025-combinations.json" with {type:"json"};
import type {Project} from "./models";
import {applyEngineeringCombinations} from "./apply-engineering-combinations";
import {engineeringCombinationsSchema} from "./engineering-combinations";
/** Generator limit (every analysis case must be classified exactly once). The analysis itself accepts more cases (MAX_CASES); above this the generator REFUSES, never truncates. */
export const MAX_DECLARED_ACTIONS=16;

/** M42-P1: NBR 8681:2025 combinations generated from the versioned data file and fed to the
 * EXISTING engineering-combinations pipeline (compile -> adapter -> PyNite). gamma_n, I and
 * non-linearity partial factors are NOT applied (the standard fixes no general values). */
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/);
const permTypes=Object.keys(data.table1.types) as [keyof typeof data.table1.types,...(keyof typeof data.table1.types)[]];
const psiRows=Object.keys(data.table6.rows) as [keyof typeof data.table6.rows,...(keyof typeof data.table6.rows)[]];
const varTypes=Object.keys(data.table4.types) as [keyof typeof data.table4.types,...(keyof typeof data.table4.types)[]];
const family=z.enum(["uls-normal","uls-special","uls-exceptional","sls-quasi-permanent","sls-frequent","sls-rare"]);
export const nbr8681DeclarationSchema=z.object({
  schema_version:z.literal("jpn.nbr8681-declaration/1"),
  permanentMode:z.enum(["separate","grouped"]),
  variableMode:z.enum(["separate","joint"]),
  /** 5.1.3.1: "em casos específicos" two sets; declared, never presumed. */
  permanentSets:z.array(z.enum(["unfavorable","favorable"])).min(1).max(2),
  families:z.array(family).min(1).max(6),
  special:z.object({caseId:id,veryShortDuration:z.boolean()}).strict().optional(),
  exceptional:z.object({caseId:id,reducedPsi:z.boolean()}).strict().optional(),
  /** Upper bound of generated combinations. The analysis contract derives its own limit from the 2 MB single-envelope result budget (analysis-limits). */
  maxCombinations:z.number().int().min(1).max(MAX_COMBINATIONS).default(MAX_COMBINATIONS),
  actions:z.array(z.discriminatedUnion("nature",[
    z.object({nature:z.literal("permanent"),caseId:id,permanentType:z.enum([...permTypes,"prestress","settlement-shrinkage"]).optional()}).strict(),
    z.object({nature:z.literal("variable"),caseId:id,variableType:z.enum(varTypes),psiRow:z.enum(psiRows),exclusiveGroup:id.nullable(),
      /** NBR 6120:2019 6.4: concentrated 1 kN acts isolated from every other variable action (ULS only, as sole variable). */
      isolated:z.boolean().default(false)}).strict(),
  ])).min(1).max(MAX_DECLARED_ACTIONS),
}).strict();
export type Nbr8681Declaration=z.infer<typeof nbr8681DeclarationSchema>;

function fail(c:string,m:string):never{throw Error(c+": "+m);}
type Kind="normal"|"special"|"exceptional";
const kindOf:Record<string,Kind>={"uls-normal":"normal","uls-special":"special","uls-exceptional":"exceptional"};
const ref=(clause:string)=>({standard:"ABNT NBR 8681",edition:"2025",clause,
  source:"data/normas/nbr8681-2025-combinations.json — "+NBR8681_SOURCE_LABEL,revision:data.revision,
  responsible:"Revisão profissional pendente; o JPN não substitui o responsável técnico"});
const psiOf=(row:string)=>(data.table6.rows as Record<string,{psi:number[]}>)[row].psi;

type Perm={caseId:string;gu:number;gf:number;table:string};
function permanentFactors(d:Nbr8681Declaration,kind:Kind):Perm[]{
  return d.actions.flatMap(a=>{
    if(a.nature!=="permanent")return [];
    if(a.permanentType==="prestress"||a.permanentType==="settlement-shrinkage"){
      const [gu,gf]=data.table3[a.permanentType][kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 3"}];
    }
    if(d.permanentMode==="grouped"){const [gu,gf]=data.table2[kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 2"}];}
    if(!a.permanentType)return fail("M42_PERMANENT_TYPE","tipo da Tabela 1 é obrigatório para "+a.caseId+" em permanentMode=separate");
    const [gu,gf]=data.table1.types[a.permanentType][kind];return [{caseId:a.caseId,gu,gf,table:"Tabela 1"}];
  });
}
const gammaQ=(d:Nbr8681Declaration,type:keyof typeof data.table4.types,kind:Kind)=>
  d.variableMode==="joint"&&type!=="temperature-atmospheric"?data.table5[kind]:data.table4.types[type][kind];

type Slot={group:string|null;alts:string[]};
function slotsOf(d:Nbr8681Declaration):Slot[]{
  const out:Slot[]=[],byGroup=new Map<string,Slot>();
  for(const a of d.actions){
    if(a.nature!=="variable"||a.isolated)continue;
    if(a.exclusiveGroup===null){out.push({group:null,alts:[a.caseId]});continue;}
    const s=byGroup.get(a.exclusiveGroup)??{group:a.exclusiveGroup,alts:[]};
    if(!byGroup.has(a.exclusiveGroup)){byGroup.set(a.exclusiveGroup,s);out.push(s);}
    s.alts.push(a.caseId);
  }
  return out;
}
/** Active-variable selections for one principal (null = no principal, permanents only). */
function selections(slots:Slot[],principal:string|null,subsets:boolean){
  const result:Map<string,"principal"|"accompanying">[]=[];
  if(principal===null&&subsets)return [new Map<string,"principal"|"accompanying">()];   // permanents only
  const rest=slots.filter(s=>principal===null||!s.alts.includes(principal));
  const opts=rest.map(s=>subsets?[null,...s.alts]:s.alts);
  const total=opts.reduce((n,o)=>n*o.length,1);
  if(total>5000)fail("M42_COMBINATION_LIMIT","enumeração excede 5000 seleções");
  const walk=(i:number,cur:Map<string,"principal"|"accompanying">)=>{
    if(i===opts.length){result.push(new Map(cur));return;}
    for(const o of opts[i]){const next=new Map(cur);if(o)next.set(o,"accompanying");walk(i+1,next);}
  };
  const start=new Map<string,"principal"|"accompanying">();
  if(principal)start.set(principal,"principal");
  walk(0,start);
  return result;
}

export function generateNbr8681Combinations(raw:unknown,existingCaseIds:string[]){
  const n=Math.max(existingCaseIds.length,Array.isArray((raw as {actions?:unknown})?.actions)?(raw as {actions:unknown[]}).actions.length:0);
  if(n>MAX_DECLARED_ACTIONS)fail("M42_TOO_MANY_ACTIONS",n+" casos/ações: o gerador NBR 8681 aceita no máximo "+MAX_DECLARED_ACTIONS+" (cada caso é classificado uma única vez). Nenhuma combinação foi gerada nem cortada; reduza ou agrupe os casos de carga.");
  const d=nbr8681DeclarationSchema.parse(raw);
  const ids=d.actions.map(a=>a.caseId);
  if(new Set(ids).size!==ids.length)fail("M42_DUPLICATE_ACTION","cada caso deve ser classificado uma única vez (evita peso próprio/cargas duplicados)");
  if(ids.length!==existingCaseIds.length||!existingCaseIds.every(c=>ids.includes(c)))
    fail("M42_CASE_COVERAGE","classifique exatamente os casos existentes: "+existingCaseIds.join(", "));
  if(d.variableMode==="joint"&&d.permanentMode!=="grouped")
    fail("M42_JOINT_REQUIRES_GROUPED","Tabela 5 exige ações permanentes diretas também agrupadas (Tabela 2)");
  for(const a of d.actions)if(a.nature==="variable"){
    if(a.variableType==="wind"&&(a.psiRow!=="wind"||a.exclusiveGroup===null))
      fail("M42_WIND_CLASSIFICATION","vento exige psiRow=wind e grupo exclusivo comum entre direções e alternativas de Cpi: "+a.caseId);
    if(a.variableType==="temperature-atmospheric"&&a.psiRow!=="temperature")fail("M42_TEMPERATURE_CLASSIFICATION","temperatura exige psiRow=temperature: "+a.caseId);
    if(a.psiRow==="wind"&&a.variableType!=="wind")fail("M42_WIND_CLASSIFICATION","psiRow=wind só para variableType=wind: "+a.caseId);
  }
  const windGroups=new Set(d.actions.filter(a=>a.nature==="variable"&&a.variableType==="wind").map(a=>(a as {exclusiveGroup:string}).exclusiveGroup));
  if(windGroups.size>1)fail("M42_WIND_GROUPS","todas as hipóteses de vento devem pertencer a um único grupo exclusivo");
  const variables=d.actions.filter((a):a is Extract<typeof a,{nature:"variable"}>=>a.nature==="variable");
  const varById=new Map(variables.map(v=>[v.caseId,v]));
  const slots=slotsOf(d),seen=new Set<string>(),combos:{id:string;purpose:"ULS"|"SLS-quasi-permanent"|"SLS-frequent"|"SLS-characteristic";
    hypothesis:string;clause:string;family:string;principal:string|null;terms:{caseId:string;role:string;gamma:number;psi:number;effect?:string;table:string}[]}[]=[];
  const counters:Record<string,number>={};
  const push=(fam:string,prefix:string,purpose:typeof combos[number]["purpose"],clause:string,hyp:string,principal:string|null,
    terms:typeof combos[number]["terms"])=>{
    const key=purpose+"|"+JSON.stringify(terms.map(t=>[t.caseId,t.gamma*t.psi]));
    if(seen.has(key))return;
    seen.add(key);
    counters[prefix]=(counters[prefix]??0)+1;
    combos.push({id:prefix+String(counters[prefix]).padStart(2,"0"),purpose,hypothesis:hyp,clause,family:fam,principal,terms});
  };
  type Term=typeof combos[number]["terms"][number];
  const permTerms=(kind:Kind,set:"unfavorable"|"favorable"):Term[]=>permanentFactors(d,kind).map(p=>(
    {caseId:p.caseId,role:"permanent",gamma:set==="unfavorable"?p.gu:p.gf,psi:1,effect:set,table:p.table}));
  for(const fam of d.families){
    if(fam.startsWith("uls")){
      const kind=kindOf[fam];
      const specialId=kind==="special"?d.special?.caseId:kind==="exceptional"?d.exceptional?.caseId:undefined;
      if(kind!=="normal"){
        if(!specialId)fail("M42_SPECIAL_DECLARATION","família "+fam+" exige a declaração da ação "+(kind==="special"?"especial":"excepcional"));
        if(!varById.has(specialId))fail("M42_SPECIAL_DECLARATION","ação "+specialId+" deve ser variável classificada");
      }
      const veryShort=kind==="special"?!!d.special?.veryShortDuration:kind==="exceptional"?!!d.exceptional?.reducedPsi:false;
      const principals=kind==="normal"?[null,...variables.map(v=>v.caseId)]:[specialId!];
      const isolated=new Set(variables.filter(v=>v.isolated).map(v=>v.caseId));
      for(const set of d.permanentSets)for(const pr of principals)for(const sel of (pr&&isolated.has(pr)?[new Map<string,"principal"|"accompanying">([[pr,"principal"]])]:selections(slots,pr,true))){
        const terms:Term[]=[...permTerms(kind,set)];
        for(const v of variables){
          const role=sel.get(v.caseId),psi=psiOf(v.psiRow);
          if(!role){terms.push({caseId:v.caseId,role:"absent",gamma:0,psi:0,table:"-"});continue;}
          const exc=kind==="exceptional";
          const gamma=role==="principal"&&exc?data.gammaQExceptional:gammaQ(d,v.variableType,kind);
          const factor=role==="principal"?1:(kind==="normal"?psi[0]:(veryShort?psi[2]:psi[0]));
          terms.push({caseId:v.caseId,role,gamma,psi:factor,table:d.variableMode==="joint"?"Tabela 5":"Tabela 4"});
        }
        const cl=kind==="normal"?"5.1.3.1":kind==="special"?"5.1.3.2":"5.1.3.3";
        push(fam,"U-"+(kind==="normal"?"N":kind==="special"?"S":"X"),"ULS",cl,
          "ELU "+kind+"; permanentes "+set+"; principal "+(pr??"nenhuma")+"; acompanhantes "+[...sel].filter(([,r])=>r==="accompanying").map(([c])=>c).join(",")+" (psi0"+(kind==="normal"?"":"ef")+")",pr,terms);
      }
    }else{
      const principals=fam==="sls-quasi-permanent"?[null]:variables.filter(v=>!v.isolated).map(v=>v.caseId);
      for(const pr of principals)for(const sel of selections(slots,pr,false)){
        const terms:Term[]=permanentFactors(d,"normal").map(p=>({caseId:p.caseId,role:"permanent",gamma:1,psi:1,table:"5.1.5 (gamma=1,0)"}));
        for(const v of variables){
          const role=sel.get(v.caseId),psi=psiOf(v.psiRow);
          if(!role&&fam!=="sls-quasi-permanent"){terms.push({caseId:v.caseId,role:"absent",gamma:0,psi:0,table:"-"});continue;}
          if(fam==="sls-quasi-permanent"){
            // exclusive alternatives are enumerated one at a time by selections(); QP selects each slot alt
            terms.push({caseId:v.caseId,role:sel.has(v.caseId)?"accompanying":"absent",gamma:1,psi:sel.has(v.caseId)?psi[2]:0,table:"Tabela 6 (psi2)"});
            continue;
          }
          const f=role==="principal"?(fam==="sls-rare"?1:psi[1]):(fam==="sls-rare"?psi[1]:psi[2]);
          terms.push({caseId:v.caseId,role:role!,gamma:1,psi:f,table:"Tabela 6 ("+(role==="principal"?(fam==="sls-rare"?"valor característico":"psi1"):(fam==="sls-rare"?"psi1":"psi2"))+")"});
        }
        const purpose=fam==="sls-quasi-permanent"?"SLS-quasi-permanent":fam==="sls-frequent"?"SLS-frequent":"SLS-characteristic";
        push(fam,fam==="sls-quasi-permanent"?"S-QP":fam==="sls-frequent"?"S-FQ":"S-RA",purpose,
          fam==="sls-quasi-permanent"?"5.1.5.2":fam==="sls-frequent"?"5.1.5.3":"5.1.5.4",
          "ELS "+fam.replace("sls-","")+"; principal "+(pr??"nenhuma")+(fam==="sls-rare"?" (norma: combinação rara; rótulo do motor SLS-characteristic)":""),pr,terms);
      }
    }
  }
  if(combos.length>d.maxCombinations)fail("M42_COMBINATION_LIMIT",combos.length+" combinações excedem o limite "+d.maxCombinations+"; reduza famílias, conjuntos ou alternativas");
  const exclusiveOf=(a:Nbr8681Declaration["actions"][number])=>a.nature==="variable"?a.exclusiveGroup:null;
  const engineering=engineeringCombinationsSchema.parse({
    schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:d.actions.map(a=>({caseId:a.caseId,category:a.nature==="permanent"?"permanent":a.nature==="variable"&&a.variableType==="wind"?"wind":"variable",
      exclusiveGroup:exclusiveOf(a),reference:ref("4.2.1; 5.1.4")})),
    combinations:combos.map(c=>({id:c.id,purpose:c.purpose,hypothesis:c.hypothesis.slice(0,990),reference:ref(c.clause),
      terms:d.actions.map(a=>{const t=c.terms.find(x=>x.caseId===a.caseId)!;return {caseId:a.caseId,gamma:t.gamma,psi:t.psi,reference:ref(c.clause)};})})),
  });
  return {schema_version:"jpn.nbr8681-generation/1" as const,normativeStatus:"SINGLE_SOURCE_CHECKED" as const,documentSha256:data.documentSha256,standard:"ABNT NBR 8681:2025",dataRevision:data.revision,
    engineeringCombinations:engineering,trace:combos,notApplied:data.notApplied,errataVerified:false as const,
    normativeValidation:"pending-engineer-review" as const,computedStructuralApproval:false as const,
    fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}

/** Replace the project's combinations with the generated ones through the existing validated path. */
export function applyNbr8681Combinations(project:Project,raw:unknown){
  const draft=project.workspace.spatialPreparation;
  if(!draft)fail("M42_MODEL_PENDING","declare o modelo físico antes das combinações");
  const generated=generateNbr8681Combinations(raw,draft.cases.map(c=>c.id));
  // N3: single checked source -> no PROVISIONAL mark for 8681; an old mark persisted in the project is removed.
  return {project:clearProvenance(applyEngineeringCombinations(project,generated.engineeringCombinations),"combinations-nbr8681"),generated};
}
