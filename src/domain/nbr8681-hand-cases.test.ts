import {expect,it} from "vitest";
import {generateNbr8681Combinations} from "./nbr8681-combinations";
import cases from "../../validation/hand-cases/nbr8681-hand-cases.json" with {type:"json"};

/** Hand cases (validation/hand-cases): the generator's combinations, applied to the declared characteristic
 * values, must reproduce the step-by-step values. Draft format until the Codex tests/validation folder exists. */
type Gen=ReturnType<typeof generateNbr8681Combinations>;
const byId=Object.fromEntries(cases.cases.map(c=>[c.id,c]));
const step=(id:string,n:number)=>byId[id].steps.find(s=>s.step===n)!.value as number;
const near=(a:number,b:number)=>expect(Math.abs(a-b)).toBeLessThan(1e-9*Math.max(1,Math.abs(b)));
const apply=(g:Gen,values:Record<string,number>)=>g.engineeringCombinations.combinations.map(c=>({id:c.id,purpose:c.purpose,
  value:c.terms.reduce((s,t)=>s+t.gamma*t.psi*values[t.caseId],0)}));
const decl=(actions:object[])=>({schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
  permanentSets:["unfavorable","favorable"],families:["uls-normal","sls-quasi-permanent","sls-frequent","sls-rare"],actions});
const roofLive={nature:"variable",caseId:"Q",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null};
const wind={nature:"variable",caseId:"W",variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"};

it("HC-A: q = 0,613 VkÂ² e pressÃ£o efetiva com o cpi mais nocivo",()=>{
  const q=0.613*30**2;
  near(q,step("HC-A-wind-suction",1));
  near((-1.0-(-0.3))*q,step("HC-A-wind-suction",2));
  near(Math.min((-1-(-0.3))*q,(-1-0)*q),step("HC-A-wind-suction",4));
  near(1.4*step("HC-A-wind-suction",4),step("HC-A-wind-suction",5));
  near(1.4*0.6*step("HC-A-wind-suction",4),step("HC-A-wind-suction",6));
});

it("HC-B: terÃ§a biapoiada â€” envoltÃ³rias ELU e ELS do gerador NBR 8681 batem com o cÃ¡lculo Ã  mÃ£o",()=>{
  const c=byId["HC-B-purlin-simply-supported"],L=6,env=c.expectedEnvelope!;
  const g=generateNbr8681Combinations(decl([{nature:"permanent",caseId:"G1",permanentType:"steel-and-equipment"},
    {nature:"permanent",caseId:"G2",permanentType:"prefab-wood-industrialized"},roofLive,wind]),["G1","G2","Q","W"]);
  const r=apply(g,c.lineLoadsKnM as Record<string,number>),of=(p:string)=>r.filter(x=>x.purpose===p).map(x=>x.value);
  const uls=of("ULS"),rare=of("SLS-characteristic");
  near(Math.max(...uls),env.ulsMaxKnM);
  near(Math.min(...uls),env.ulsMinKnM);
  near(Math.max(...uls)*L**2/8,step(c.id,3));
  near(Math.min(...uls)*L**2/8,step(c.id,6));
  near(-Math.min(...uls)*L/2,step(c.id,7));
  // the governing suction combination uses favorable permanents (gamma = 1,0)
  const gov=g.engineeringCombinations.combinations[r.findIndex(x=>x.purpose==="ULS"&&x.value===Math.min(...uls))];
  expect(gov.terms.filter(t=>t.caseId.startsWith("G")).map(t=>t.gamma)).toEqual([1,1]);
  near(Math.max(...rare),env.slsRareMaxKnM);
  near(Math.min(...rare),env.slsRareMinKnM);
  near(Math.max(...of("SLS-frequent")),step(c.id,11));
  near(Math.max(...of("SLS-quasi-permanent")),step(c.id,12));
  expect(g.computedStructuralApproval).toBe(false);expect(g.fabricationRelease).toBe(false);expect(g.releaseGate).toBe("NOT_READY_BLOCKED");
});

it("HC-C: arrancamento governado por permanente mÃ­nimo + sucÃ§Ã£o; sÃ³ o conjunto desfavorÃ¡vel subestima",()=>{
  const c=byId["HC-C-support-pullout"],R={G:3.10,Q:2.00,W:-6.40};
  const actions=[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},roofLive,wind];
  const both=apply(generateNbr8681Combinations(decl(actions),["G","Q","W"]),R).filter(x=>x.purpose==="ULS");
  near(Math.min(...both.map(x=>x.value)),step(c.id,1));
  near(-Math.min(...both.map(x=>x.value))/8.0,step(c.id,4));
  const onlyUnfav=apply(generateNbr8681Combinations({...decl(actions),permanentSets:["unfavorable"]},["G","Q","W"]),R).filter(x=>x.purpose==="ULS");
  near(Math.min(...onlyUnfav.map(x=>x.value)),step(c.id,2));
});

it("rastreio: em aÃ§Ãµes conjuntas a temperatura atmosfÃ©rica Ã© rotulada Tabela 4 (nota a da Tabela 5)",()=>{
  const g=generateNbr8681Combinations({...decl([{nature:"permanent",caseId:"G"},
    {nature:"variable",caseId:"T",variableType:"temperature-atmospheric",psiRow:"temperature",exclusiveGroup:null},roofLive]),
  permanentMode:"grouped",variableMode:"joint",families:["uls-normal"]},["G","T","Q"]);
  const t=g.trace.find(x=>x.principal==="T"&&x.terms.some(y=>y.caseId==="Q"&&y.role==="accompanying"))!;
  expect(t.terms.find(x=>x.caseId==="T")).toMatchObject({gamma:1.2,table:"Tabela 4"});
  expect(t.terms.find(x=>x.caseId==="Q")).toMatchObject({gamma:1.5,table:"Tabela 5"});
});
