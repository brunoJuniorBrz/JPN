import {afterEach,expect,it,vi} from "vitest";
import {buildingProject} from "./test-support/m41-building-fixture";
import {buildNormativeFacadeTraction} from "./wind-facade-normative";
import {generateNbr8681Combinations,applyNbr8681Combinations} from "./nbr8681-combinations";
import {auditEngineeringCombinationCoverage} from "./engineering-combination-coverage";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import data from "../../data/normas/nbr8681-2025-combinations.json";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
afterEach(()=>vi.unstubAllEnvs());

const perm=(caseId:string,permanentType="steel-and-equipment")=>({nature:"permanent",caseId,permanentType});
const live=(caseId:string,psiRow="buildings-no-predominance",variableType="other-and-equipment-temperature")=>
  ({nature:"variable",caseId,variableType,psiRow,exclusiveGroup:null});
const wind=(caseId:string)=>({nature:"variable",caseId,variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"});
const decl=(over:object={},actions:object[]=[perm("G"),live("Q"),wind("W1"),wind("W2")])=>({
  schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
  permanentSets:["unfavorable","favorable"],families:["uls-normal","sls-quasi-permanent","sls-frequent","sls-rare"],actions,...over});
const vec=(g:ReturnType<typeof generateNbr8681Combinations>,id:string)=>{
  const c=g.engineeringCombinations.combinations.find(x=>x.id===id)!;
  return Object.fromEntries(c.terms.map(t=>[t.caseId,+(t.gamma*t.psi).toFixed(10)]));
};
const find=(g:ReturnType<typeof generateNbr8681Combinations>,f:(c:ReturnType<typeof generateNbr8681Combinations>["trace"][number])=>boolean)=>
  g.trace.filter(f);

it("tabelas 1-6 da NBR 8681:2025 conferidas contra a leitura das imagens",()=>{
  const t1=data.table1.types;
  expect([t1["steel-and-equipment"],t1["prefab-wood-industrialized"],t1["cast-in-place"],t1["industrialized-with-in-situ-additions"],t1["construction-elements-general"]]
    .map(x=>[x.normal[0],x.special[0],x.exceptional[0]])).toEqual([[1.25,1.15,1.10],[1.30,1.20,1.15],[1.35,1.25,1.15],[1.40,1.30,1.20],[1.50,1.40,1.30]]);
  expect(Object.values(t1).every(x=>x.normal[1]===1&&x.special[1]===1&&x.exceptional[1]===1)).toBe(true);
  expect([data.table2.normal,data.table2.special,data.table2.exceptional]).toEqual([[1.35,1],[1.25,1],[1.15,1]]);
  expect(data.table3.prestress.normal).toEqual([1.2,.9]);
  expect(data.table3["settlement-shrinkage"]).toEqual({normal:[1.2,0],special:[1.2,0],exceptional:[0,0]});
  const t4=data.table4.types;
  expect([t4.truncated,t4["temperature-atmospheric"],t4.wind,t4["other-and-equipment-temperature"]].map(x=>[x.normal,x.special,x.exceptional]))
    .toEqual([[1.2,1.1,1],[1.2,1,1],[1.4,1.2,1],[1.5,1.3,1]]);
  expect([data.table5.normal,data.table5.special,data.table5.exceptional]).toEqual([1.5,1.3,1]);
  expect(data.gammaQExceptional).toBe(1);
  const r=data.table6.rows;
  expect([r["buildings-no-predominance"].psi,r["buildings-predominance"].psi,r["libraries-archives-warehouses-workshops-garages-roofs"].psi,r.wind.psi,r.temperature.psi])
    .toEqual([[.5,.4,.3],[.7,.6,.4],[.8,.7,.6],[.6,.3,0],[.6,.5,.3]]);
});
it("ELU normal: vetores calculados à mão, ações favoráveis/desfavoráveis e acompanhantes",()=>{
  const C=["G","Q","W1","W2"],g=generateNbr8681Combinations(decl({permanentSets:["unfavorable"],families:["uls-normal"]}),C);
  expect(g.trace).toHaveLength(8);                    // 1 (só permanentes) + 3 (Q principal) + 2 + 2 (cada vento principal)
  const uls=(principal:string|null,acc:string[])=>find(g,c=>c.principal===principal&&
    JSON.stringify(c.terms.filter(t=>t.role==="accompanying").map(t=>t.caseId))===JSON.stringify(acc));
  const a=uls("W1",["Q"]);
  expect(a).toHaveLength(1);
  expect(vec(g,a[0].id)).toEqual({G:1.25,Q:.75,W1:1.4,W2:0});          // G 1,25; Q 1,5*0,5; vento 1,4
  expect(vec(g,uls("W1",[])[0].id)).toEqual({G:1.25,Q:0,W1:1.4,W2:0}); // ação variável favorável desconsiderada
  expect(vec(g,uls("Q",["W2"])[0].id)).toEqual({G:1.25,Q:1.5,W1:0,W2:.84});   // vento acompanhante 1,4*0,6
  expect(vec(g,uls(null,[])[0].id)).toEqual({G:1.25,Q:0,W1:0,W2:0});
  // permanentes favoráveis (verificação de arrancamento): G = 1,0
  const f=generateNbr8681Combinations(decl({permanentSets:["unfavorable","favorable"],families:["uls-normal"]},[perm("G"),live("Q"),wind("W1")]),["G","Q","W1"]);
  expect(f.trace).toHaveLength(10);
  const fv=find(f,c=>c.hypothesis.includes("permanentes favorable")&&c.principal==="W1"&&c.terms.some(t=>t.caseId==="Q"&&t.role==="accompanying"))[0];
  expect(vec(f,fv.id)).toEqual({G:1,Q:.75,W1:1.4});
  // exclusividade: nunca dois ventos juntos
  for(const c of g.engineeringCombinations.combinations)
    expect(c.terms.filter(t=>["W1","W2"].includes(t.caseId)&&t.gamma*t.psi>0).length).toBeLessThanOrEqual(1);
  expect(g.computedStructuralApproval).toBe(false);
  expect(g.fabricationRelease).toBe(false);
  expect(g.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(g.errataVerified).toBe(false);
});
it("ELS quase permanente, frequente e rara: vetores calculados à mão",()=>{
  const g=generateNbr8681Combinations(decl({permanentSets:["unfavorable"],families:["sls-quasi-permanent","sls-frequent","sls-rare"]}),["G","Q","W1","W2"]);
  const by=(purpose:string)=>g.trace.filter(c=>c.purpose===purpose);
  expect(by("SLS-quasi-permanent")).toHaveLength(1);
  expect(by("SLS-frequent")).toHaveLength(3);
  expect(by("SLS-characteristic")).toHaveLength(4);
  expect(vec(g,by("SLS-quasi-permanent")[0].id)).toEqual({G:1,Q:.3,W1:0,W2:0});             // psi2: Q 0,3; vento 0
  const fq=(p:string)=>vec(g,find(g,c=>c.purpose==="SLS-frequent"&&c.principal===p)[0].id);
  expect(fq("Q")).toEqual({G:1,Q:.4,W1:0,W2:0});                                           // psi1*Q; vento psi2=0
  expect(fq("W1")).toEqual({G:1,Q:.3,W1:.3,W2:0});                                         // psi1 vento 0,3; Q psi2 0,3
  expect(vec(g,find(g,c=>c.purpose==="SLS-characteristic"&&c.principal==="W1")[0].id)).toEqual({G:1,Q:.4,W1:1,W2:0});   // rara
  expect(find(g,c=>c.purpose==="SLS-characteristic"&&c.principal==="Q").map(c=>vec(g,c.id)))
    .toEqual([{G:1,Q:1,W1:.3,W2:0},{G:1,Q:1,W1:0,W2:.3}]);
  expect(find(g,c=>c.purpose==="SLS-characteristic")[0].hypothesis).toContain("SLS-characteristic");
  for(const c of g.engineeringCombinations.combinations)
    expect(c.terms.filter(t=>["W1","W2"].includes(t.caseId)&&t.gamma*t.psi>0).length).toBeLessThanOrEqual(1);
});
it("ações conjuntas (Tabela 5) exigem permanentes agrupadas (Tabela 2); temperatura atmosférica segue a Tabela 4",()=>{
  expect(()=>generateNbr8681Combinations(decl({variableMode:"joint"}),["G","Q","W1","W2"])).toThrow("M42_JOINT_REQUIRES_GROUPED");
  const g=generateNbr8681Combinations(decl({variableMode:"joint",permanentMode:"grouped",permanentSets:["unfavorable"],families:["uls-normal"]}),["G","Q","W1","W2"]);
  const c=find(g,x=>x.principal==="W1"&&x.terms.some(t=>t.caseId==="Q"&&t.role==="accompanying"))[0];
  expect(vec(g,c.id)).toEqual({G:1.35,Q:.75,W1:1.5,W2:0});    // Tabela 2 = 1,35; Tabela 5 = 1,5 (vento também)
  const T=[perm("G"),{nature:"variable",caseId:"T",variableType:"temperature-atmospheric",psiRow:"temperature",exclusiveGroup:null}];
  const gt=generateNbr8681Combinations(decl({variableMode:"joint",permanentMode:"grouped",permanentSets:["unfavorable"],families:["uls-normal"]},T),["G","T"]);
  expect(vec(gt,find(gt,x=>x.principal==="T")[0].id)).toEqual({G:1.35,T:1.2});     // Tabela 4 mantida para temperatura
});
it("combinações especial e excepcional: coeficientes das colunas corretas e psi0,ef",()=>{
  const base={permanentSets:["unfavorable"],families:["uls-special"]};
  const sp=generateNbr8681Combinations(decl({...base,special:{caseId:"Q",veryShortDuration:false}}),["G","Q","W1","W2"]);
  expect(find(sp,c=>c.principal!=="Q")).toHaveLength(0);
  const s1=find(sp,c=>c.terms.some(t=>t.caseId==="W1"&&t.role==="accompanying"))[0];
  expect(vec(sp,s1.id)).toEqual({G:1.15,Q:1.3,W1:.72,W2:0});               // Tab.1 especial 1,15; Tab.4 especial: Q 1,3 / vento 1,2*psi0 0,6
  const sp2=generateNbr8681Combinations(decl({...base,special:{caseId:"Q",veryShortDuration:true}}),["G","Q","W1","W2"]);
  expect(find(sp2,c=>c.terms.some(t=>t.role==="accompanying"&&t.gamma*t.psi>0))).toHaveLength(0);   // psi0,ef = psi2 = 0 para vento
  const ex=generateNbr8681Combinations(decl({permanentSets:["unfavorable"],families:["uls-exceptional"],exceptional:{caseId:"W1",reducedPsi:false}}),["G","Q","W1","W2"]);
  const e1=find(ex,c=>c.terms.some(t=>t.caseId==="Q"&&t.role==="accompanying"))[0];
  expect(vec(ex,e1.id)).toEqual({G:1.10,Q:.5,W1:1,W2:0});                   // Tab.1 excepcional 1,10; gamma_q,exc=1,0; Q 1,0*psi0
  const ex2=generateNbr8681Combinations(decl({permanentSets:["unfavorable"],families:["uls-exceptional"],exceptional:{caseId:"W1",reducedPsi:true}}),["G","Q","W1","W2"]);
  expect(vec(ex2,find(ex2,c=>c.terms.some(t=>t.caseId==="Q"&&t.role==="accompanying"))[0].id).Q).toBeCloseTo(.3,12);
  expect(()=>generateNbr8681Combinations(decl({families:["uls-special"]}),["G","Q","W1","W2"])).toThrow("M42_SPECIAL_DECLARATION");
  expect(()=>generateNbr8681Combinations(decl({families:["uls-exceptional"],exceptional:{caseId:"G",reducedPsi:false}}),["G","Q","W1","W2"])).toThrow("M42_SPECIAL_DECLARATION");
});
it("protensão e recalques (Tabela 3) e tipos permanentes da Tabela 1",()=>{
  const A=[perm("G","cast-in-place"),{nature:"permanent",caseId:"P",permanentType:"prestress"},{nature:"permanent",caseId:"R",permanentType:"settlement-shrinkage"},live("Q")];
  const g=generateNbr8681Combinations(decl({families:["uls-normal"]},A),["G","P","R","Q"]);
  const u=find(g,c=>c.principal===null&&c.hypothesis.includes("unfavorable"))[0],f=find(g,c=>c.principal===null&&c.hypothesis.includes("permanentes favorable"))[0];
  expect(vec(g,u.id)).toEqual({G:1.35,P:1.2,R:1.2,Q:0});
  expect(vec(g,f.id)).toEqual({G:1,P:.9,R:0,Q:0});
});
it("rejeita configurações incompletas, ambíguas ou fora do domínio",()=>{
  const C=["G","Q","W1","W2"],run=(o:object={},a?:object[],c=C)=>()=>generateNbr8681Combinations(decl(o,a),c);
  expect(run({},[perm("G"),perm("G"),live("Q"),wind("W1")],["G","Q","W1"])).toThrow("M42_DUPLICATE_ACTION");        // peso próprio duplicado
  expect(run({},undefined,["G","Q","W1"])).toThrow("M42_CASE_COVERAGE");
  expect(run({},undefined,["G","Q","W1","W2","W3"])).toThrow("M42_CASE_COVERAGE");
  expect(run({},[{nature:"permanent",caseId:"G"},live("Q"),wind("W1"),wind("W2")])).toThrow("M42_PERMANENT_TYPE");
  expect(run({},[perm("G"),live("Q"),{...wind("W1"),psiRow:"temperature"},wind("W2")])).toThrow("M42_WIND_CLASSIFICATION");
  expect(run({},[perm("G"),live("Q"),{...wind("W1"),exclusiveGroup:null},wind("W2")])).toThrow("M42_WIND_CLASSIFICATION");
  expect(run({},[perm("G"),live("Q"),wind("W1"),{...wind("W2"),exclusiveGroup:"OUTRO"}])).toThrow("M42_WIND_GROUPS");
  expect(run({},[perm("G"),{...live("Q","wind"),variableType:"other-and-equipment-temperature"},wind("W1"),wind("W2")])).toThrow("M42_WIND_CLASSIFICATION");
  expect(run({},[perm("G"),{...live("Q","bridges-not-enabled")},wind("W1"),wind("W2")])).toThrow();                   // psiRow não habilitada
  expect(run({permanentSets:[]})).toThrow();
  expect(run({families:["uls-bridge"]})).toThrow();
  expect(run({maxCombinations:5})).toThrow("M42_COMBINATION_LIMIT");
  expect(run({extra:true})).toThrow();
});
it("integra ao motor: combinações físicas, cobertura ELU/ELS e rastreabilidade pelo caminho existente",()=>{
  const A=[perm("G"),live("Q"),wind("W1")],p=buildingProject(["G","Q","W1"]),d=decl({permanentSets:["unfavorable"]},A);
  const {project,generated}=applyNbr8681Combinations(p,d);
  expect(generated.trace).toHaveLength(10);            // 3 ações × 4 famílias = 10 combinações (o contrato não tem mais teto fixo de 10)
  const sp=project.workspace.spatialPreparation!;
  expect(sp.combinations.map(c=>c.id)).toEqual(generated.trace.map(c=>c.id));
  for(const c of generated.trace)expect(sp.combinations.find(x=>x.id===c.id)!.factors).toEqual(Object.fromEntries(
    generated.engineeringCombinations.combinations.find(x=>x.id===c.id)!.terms.map(t=>[t.caseId,t.gamma*t.psi])));
  expect(sp.engineeringCombinations?.combinations.some(c=>c.purpose==="ULS")).toBe(true);
  const cov=auditEngineeringCombinationCoverage(sp.engineeringCombinations,sp.cases,sp.combinations);
  expect(cov.allCasesCoveredForULSAndSLS).toBe(true);
  expect(cov.duplicateVectors).toEqual([]);
  expect(cov.normativeFactorsVerified).toBe(false);
  expect(cov.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(()=>applyNbr8681Combinations(p,{...d,actions:[perm("G")]})).toThrow("M42_CASE_COVERAGE");
  // INT-1c: the contract no longer caps at 10; four wind alternatives generate far more than 10 combinations in one run
  const big=generateNbr8681Combinations(decl({permanentSets:["unfavorable"]}),["G","Q","W1","W2"]);
  expect(big.trace.length).toBeGreaterThan(10);
  expect(big.trace.length).toBeLessThanOrEqual(256);
});

const speed={schema_version:"jpn.wind-speed/1",edition:"2023-corrected-2025",v0Mps:10,heightM:4,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
  reference:{standard:"ABNT NBR 6123",edition:"2023-corrected-2025",clause:"5",source:"Dados sintéticos do ensaio",revision:"v1",responsible:"Responsável de referência"}};
const building={longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true,heightDefinitionConfirmed:true};
const Qdyn=0.613*(10*0.5**0.085)**2;

it("NBR 8681 -> 6123 -> fachadas -> PyNite real: reações por combinação conferidas à mão (ELU e ELS)",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const caseIds=["G","Q","W1","W2"],p=buildingProject(caseIds);
  const w=buildNormativeFacadeTraction(p,{schema_version:"jpn.nbr6123-wall-wind/2",building,speed,cases:[
    {id:"W1",windFrom:"+X"},{id:"W2",windFrom:"+Y"}].map(c=>(
    {...c,internalPressure:{rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"}}))});
  const src="Carga sintética do ensaio M42 conferida manualmente",rev="Revisão M42 v1";
  // G: 0.5 kN/m and Q: 0.75 kN/m downward on the closed ring of eight top beams (ring length 2*(12+6)=36 m)
  const uniform=[0,1,2,3,4,5,6,7].flatMap(i=>[
    {id:"G-TOP"+i,pieceId:"TOP"+i,caseId:"G",coordinates:"global" as const,knM:[0,0,-.5] as [number,number,number],source:src,revision:rev},
    {id:"Q-TOP"+i,pieceId:"TOP"+i,caseId:"Q",coordinates:"global" as const,knM:[0,0,-.75] as [number,number,number],source:src,revision:rev}]);
  p.workspace.spatialPreparation!.loading={version:1,selfWeight:null,uniform,roofArea:[],facadeTraction:w.traction};
  const G=18000,Qk=27000;   // N (0.5 and 0.75 kN/m x 36 m)
  const near=(a:number,b:number)=>expect(Math.abs(a-b)).toBeLessThan(1e-5*Math.max(1,Math.abs(b)));
  const solve=async(families:string[])=>{
    const {project,generated}=applyNbr8681Combinations(p,decl({permanentSets:["unfavorable"],families},
      [perm("G"),live("Q"),wind("W1"),wind("W2")]));
    // The existing double-count guard still applies after the combinations change: automatic wind and other
    // loads coexist, so an explicit review for THIS exact model is required (synthetic confirmation here).
    const sp=project.workspace.spatialPreparation!;
    expect(sp.loading?.overlapReview).toBeUndefined();
    await expect(adaptLoadedMixedProject(project)).rejects.toThrow("POSSIBLE_DOUBLE_COUNT");
    sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio M42: ações independentes",revision:rev,
      basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
    const prepared=await adaptLoadedMixedProject(project);
    expect(prepared.request.combinations).toHaveLength(generated.trace.length);
    const result=await runLocalMixed(JSON.stringify(prepared.request));
    if(result.status!=="completed")throw Error("PyNite não analisou as combinações NBR 8681");
    const reaction=(id:string)=>{
      const F=[0,0,0];
      for(const s of prepared.request.supports){const f=result.result.combinations[id].nodes[s.node].reaction_force_n;for(let i=0;i<3;i++)F[i]+=f[i];}
      return F;
    };
    const one=(f:(c:typeof generated.trace[number])=>boolean)=>{const r=generated.trace.filter(f);expect(r).toHaveLength(1);return r[0];};
    for(const c of generated.trace){
      expect(result.result.combinations[c.id].equilibrium.relative_residual).toBeLessThan(1e-8);
      expect(Object.keys(prepared.request.combinations.find(x=>x.id===c.id)!.factors).sort()).toEqual([...caseIds].sort());
    }
    expect(prepared.engineering_combination_coverage).toBeDefined();
    return {generated,reaction,one,prepared};
  };
  // --- ELU normal (8 combinações)
  const uls=await solve(["uls-normal"]);
  expect(uls.generated.trace).toHaveLength(8);
  // principal W1 (+X) with Q accompanying: 1.25 G + 0.75 Q ; Fx = 1.4 * 24 q (wall force -24 q)
  let r=uls.reaction(uls.one(c=>c.principal==="W1"&&c.terms.some(t=>t.caseId==="Q"&&t.role==="accompanying")).id);
  near(r[2],1.25*G+.75*Qk);near(r[0],1.4*24*Qdyn);near(r[1],0);
  // principal Q with W2 (+Y) accompanying: 1.25 G + 1.5 Q ; Fy = 0.84 * 48 q * 1.3
  r=uls.reaction(uls.one(c=>c.principal==="Q"&&c.terms.some(t=>t.caseId==="W2"&&t.role==="accompanying")).id);
  near(r[2],1.25*G+1.5*Qk);near(r[1],.84*48*Qdyn*1.3);near(r[0],0);
  // permanentes apenas
  r=uls.reaction(uls.one(c=>c.principal===null).id);
  near(r[2],1.25*G);near(r[0],0);near(r[1],0);
  // --- ELS (8 combinações): quase permanente, frequente, rara
  const sls=await solve(["sls-quasi-permanent","sls-frequent","sls-rare"]);
  expect(sls.generated.trace).toHaveLength(8);
  r=sls.reaction(sls.one(c=>c.purpose==="SLS-characteristic"&&c.principal==="W2").id);       // G + 1.0 W2 + 0.4 Q
  near(r[2],G+.4*Qk);near(r[1],48*Qdyn*1.3);near(r[0],0);
  r=sls.reaction(sls.one(c=>c.purpose==="SLS-frequent"&&c.principal==="W1").id);              // G + 0.3 W1 + 0.3 Q
  near(r[2],G+.3*Qk);near(r[0],.3*24*Qdyn);
  r=sls.reaction(sls.one(c=>c.purpose==="SLS-quasi-permanent").id);                           // G + 0.3 Q, vento psi2 = 0
  near(r[2],G+.3*Qk);near(r[0],0);near(r[1],0);
},240000);

it("pós-INT-1: acima de 16 casos/ações o gerador RECUSA com erro explícito (sem corte silencioso, sem alterar o projeto)",()=>{
  const ids=[...Array(17).keys()].map(i=>"C"+i);
  const actions=ids.map(caseId=>({nature:"permanent" as const,caseId,permanentType:"steel-and-equipment" as const}));
  const decl={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable"],families:["uls-normal"],actions};
  expect(()=>generateNbr8681Combinations(decl,ids)).toThrow(/M42_TOO_MANY_ACTIONS.*17.*máximo 16/);
  expect(()=>generateNbr8681Combinations({...decl,actions:actions.slice(0,16)},ids)).toThrow(/M42_TOO_MANY_ACTIONS/);   // 17 project cases, 16 declared: still refused, nothing dropped
  expect(()=>generateNbr8681Combinations({...decl,actions:actions.slice(0,16)},ids.slice(0,16))).not.toThrow();           // exactly 16 is accepted
});
