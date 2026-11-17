import {afterEach,expect,it,vi} from "vitest";
import {roofProject} from "./test-support/m42-roof-fixture";
import {applyNbr6120Actions,roofSlopePercent,roofVariableLoad,roofLoadForFaces,steelSelfWeightAudit} from "./nbr6120-actions";
import {generateNbr8681Combinations,applyNbr8681Combinations} from "./nbr8681-combinations";
import {auditEngineeringCombinationCoverage} from "./engineering-combination-coverage";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import data from "../../data/normas/nbr6120-2019-actions.json";
afterEach(()=>vi.unstubAllEnvs());

const input=(over:object={})=>({schema_version:"jpn.nbr6120-roof-actions/1",
  permanent:[{kind:"roof-cladding",caseId:"TELHA",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"},
    {kind:"ceiling-or-installation",caseId:"FORRO",item:"ceiling-mineral-fibre",permanentType8681:"steel-and-equipment"}],
  roofLiveLoad:{caseId:"SC"},concentratedLoad:{caseId:"QC",nodeId:"C",positionDeclaredMostUnfavorable:true},...over});

it("Tabelas 1, 5 e 8 da NBR 6120:2019 conferidas contra a leitura das imagens",()=>{
  const t5=data.permanent.table5Telhas.items;
  expect(Object.values(t5).map(x=>x.knM2)).toEqual([.45,.60,.14,.16,.18,.24,.26,.25,.025,.035,.05,.15,.06,.10,.14,.45]);
  expect(Object.keys(t5)).toHaveLength(16);
  const t8=data.permanent.table8Ceilings.items;
  expect(Object.values(t8).map(x=>x.knM2)).toEqual([.10,.25,.15,.10,.10,.20,.30,.10,.15]);
  expect(data.permanent.table1.steel).toEqual({minKnM3:77,maxKnM3:78.5,meanKnM3:77.8});
  expect(data.permanent.table1.aluminium.knM3).toBe(28);
  expect(data.variable.concentrated.valueKn).toBe(1);
  expect(data.variable.roof.tensionedMembraneKnM2).toBe(.25);
  expect(data.psiRowFor8681.row).toBe("libraries-archives-warehouses-workshops-garages-roofs");
});
it("6.4: sobrecarga de cobertura q=0,50·α por inclinação (Figura 2), com tolerâncias definidas antes",()=>{
  // expected values written from the formula in the standard, tolerance 1e-12
  const cases:[number,number][]=[[1,.5],[1.5,.5],[2,.5],[2.25,.4375],[2.5,.375],[2.9,.275],[3,.25],[3.0001,.25],[10,.25],[100,.25]];
  for(const [i,q] of cases)expect(roofVariableLoad(i).qKnM2).toBeCloseTo(q,12);
  expect(roofVariableLoad(2.5).alpha).toBeCloseTo(.75,12);
  expect(roofVariableLoad(5).projection).toBe("horizontal");
  expect(()=>roofVariableLoad(.99)).toThrow("NBR6120_SLOPE");
  expect(()=>roofVariableLoad(0)).toThrow("NBR6120_SLOPE");
  // drainage option: 0,25 kN/m2 only with the declared Annex D verification
  expect(roofVariableLoad(1.5,{annexDVerified:true}).qKnM2).toBe(.25);
  // continuity of the piecewise law at the breakpoints
  expect(Math.abs(roofVariableLoad(2).qKnM2-roofVariableLoad(2.0000001).qKnM2)).toBeLessThan(1e-6);
  expect(Math.abs(roofVariableLoad(3).qKnM2-roofVariableLoad(2.9999999).qKnM2)).toBeLessThan(1e-6);
});
it("inclinação da face: plano z=a+0,1x e planos girados; vertical é rejeitada",()=>{
  const ring=(f:(x:number,y:number)=>number):[number,number,number][]=>[[0,0],[4000,0],[4000,5000],[0,5000],[0,0]].map(([x,y])=>[x,y,f(x,y)]);
  expect(roofSlopePercent(ring(x=>3000+.1*x))).toBeCloseTo(10,9);
  expect(roofSlopePercent(ring((x)=>3800-.1*x))).toBeCloseTo(10,9);
  expect(roofSlopePercent(ring((_x,y)=>.05*y))).toBeCloseTo(5,9);
  expect(roofSlopePercent(ring((x,y)=>.03*x+.04*y))).toBeCloseTo(5,9);        // gradient (0.03,0.04): 5 %
  expect(roofSlopePercent(ring(()=>3000))).toBeCloseTo(0,12);
  expect(()=>roofSlopePercent([[0,0,0],[1000,0,0],[1000,0,1000],[0,0,1000]])).toThrow("NBR6120_SLOPE");
});
it("faces com inclinações que geram cargas diferentes são bloqueadas (não se supõe carga única)",()=>{
  const ring=(s:number):[number,number,number][]=>[[0,0,0],[4000,0,40*s],[4000,5000,40*s],[0,5000,0],[0,0,0]];
  expect(roofLoadForFaces([{id:"F1",outer:ring(10)},{id:"F2",outer:ring(8)}]).qKnM2).toBe(.25);
  expect(()=>roofLoadForFaces([{id:"F1",outer:ring(10)},{id:"F2",outer:ring(1.5)}])).toThrow("NBR6120_PER_FACE_LOAD_UNSUPPORTED");
  expect(()=>roofLoadForFaces([])).toThrow("NBR6120_MODEL_PENDING");
});
it("peso próprio do aço: auditoria da densidade declarada contra a Tabela 1 (sem alterar o catálogo)",()=>{
  const a=steelSelfWeightAudit(7850);
  expect(a.weightKnM3).toBeCloseTo(76.98,2);
  expect(a.withinTable1Range).toBe(false);                    // 7850 kg/m3 x 9,80665 fica abaixo de 77 kN/m3
  const b=steelSelfWeightAudit(77800/9.80665);
  expect(b.withinTable1Range).toBe(true);
  expect(b.differenceFromMeanPercent).toBeCloseTo(0,9);
  expect(steelSelfWeightAudit(8004,9.80665).withinTable1Range).toBe(true);
});
it("aplica as ações ao modelo: casos, cargas de superfície em kN/m2, nó concentrado e rastreabilidade",()=>{
  const p=roofProject(),r=applyNbr6120Actions(p,input()),sp=r.project.workspace.spatialPreparation!;
  expect(sp.cases.map(c=>c.id)).toEqual(["ZERO","TELHA","FORRO","SC","QC"]);
  const ra=sp.loading!.roofArea;
  expect(ra.map(x=>[x.caseId,x.knM2,x.projection])).toEqual([["TELHA",.06,"roof-surface"],["FORRO",.1,"horizontal"],["SC",.25,"horizontal"]]);
  expect(ra.every(x=>x.source.includes("ABNT NBR 6120:2019")&&x.revision===data.revision)).toBe(true);
  const qc=sp.loads.find(l=>l.caseId==="QC")!;
  expect([qc.nodeId,qc.fxKn,qc.fyKn,qc.fzKn]).toEqual(["C",0,0,-1]);
  expect(sp.loading!.roofDistribution?.method).toBe("parallel-purlin-strips");
  expect(sp.loading!.overlapReview).toBeUndefined();
  const sc=r.trace.find(t=>t.caseId==="SC") as {faces:{slopePercent:number;qKnM2:number}[]};
  expect(sc.faces.map(f=>[+f.slopePercent.toFixed(9),f.qKnM2])).toEqual([[10,.25],[10,.25]]);
  expect(r.nbr8681Actions).toHaveLength(4);   // ZERO é do modelo; TELHA, FORRO, SC, QC vêm da NBR 6120
  expect(r.computedStructuralApproval).toBe(false);
  expect(r.fabricationRelease).toBe(false);
  expect(r.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(r.errataVerified).toBe(false);
});
it("rejeita configurações incompletas, duplicadas ou fora do domínio",()=>{
  const p=roofProject(),run=(o:object)=>()=>applyNbr6120Actions(p,input(o));
  expect(run({permanent:[{kind:"roof-cladding",caseId:"X",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"},
    {kind:"roof-cladding",caseId:"X",item:"glass",permanentType8681:"steel-and-equipment"}]})).toThrow("NBR6120_DUPLICATE_CASE");
  expect(run({roofLiveLoad:{caseId:"ZERO"}})).toThrow("NBR6120_CASE_EXISTS");
  expect(run({concentratedLoad:{caseId:"QC",nodeId:"Z9",positionDeclaredMostUnfavorable:true}})).toThrow("NBR6120_NODE");
  expect(run({concentratedLoad:{caseId:"QC",nodeId:"C",positionDeclaredMostUnfavorable:false}})).toThrow();
  expect(run({permanent:[{kind:"roof-cladding",caseId:"T",item:"telha-inexistente",permanentType8681:"steel-and-equipment"}]})).toThrow();
  expect(run({permanent:[{kind:"roof-cladding",caseId:"T",item:"glass"}]})).toThrow();
  expect(run({permanent:[{kind:"declared-area-load",caseId:"T",knM2:.1,projection:"horizontal",description:"curto",source:"curto",permanentType8681:"steel-and-equipment"}]})).toThrow();
  expect(run({extra:true})).toThrow();
  const noFaces=roofProject();noFaces.workspace.spatialPreparation!.physicalRoofFaces=undefined;
  expect(()=>applyNbr6120Actions(noFaces,input())).toThrow("NBR6120_MODEL_PENDING");
  // a Tabela 6 (telhado com estrutura) não é oferecida: duplicaria o peso próprio
  expect(run({permanent:[{kind:"roof-cladding",caseId:"T",item:"table6-aluminium-steel",permanentType8681:"steel-and-equipment"}]})).toThrow();
});
it("carga declarada (ex.: painéis) exige valor, fonte e descrição explícitos e entra como permanente",()=>{
  const r=applyNbr6120Actions(roofProject(),input({permanent:[{kind:"declared-area-load",caseId:"PV",knM2:.15,projection:"roof-surface",
    description:"Painéis fotovoltaicos conforme ficha do fabricante",source:"Ficha técnica do fabricante, revisão 3",permanentType8681:"steel-and-equipment"}],
    concentratedLoad:undefined}));
  const pv=r.project.workspace.spatialPreparation!.loading!.roofArea.find(x=>x.caseId==="PV")!;
  expect([pv.knM2,pv.projection]).toEqual([.15,"roof-surface"]);
  expect((r.trace.find(t=>t.caseId==="PV") as {clause:string}).clause).toContain("valor declarado");
});
it("NBR 8681: carga concentrada isolada é principal sozinha no ELU e não entra no ELS",()=>{
  const A=[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
    {nature:"variable",caseId:"SC",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null},
    {nature:"variable",caseId:"QC",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null,isolated:true}];
  const g=generateNbr8681Combinations({schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets:["unfavorable"],families:["uls-normal","sls-quasi-permanent","sls-frequent","sls-rare"],actions:A},["G","SC","QC"]);
  const f=(id:string)=>Object.fromEntries(g.engineeringCombinations.combinations.find(c=>c.id===id)!.terms.map(t=>[t.caseId,+(t.gamma*t.psi).toFixed(10)]));
  const uls=g.trace.filter(c=>c.purpose==="ULS");
  expect(uls.map(c=>f(c.id))).toEqual([{G:1.25,SC:0,QC:0},{G:1.25,SC:1.5,QC:0},{G:1.25,SC:0,QC:1.5}]);   // QC nunca acompanha SC
  for(const c of g.trace.filter(c=>c.purpose!=="ULS"))expect(f(c.id).QC).toBe(0);
  expect(g.trace.filter(c=>c.purpose==="SLS-characteristic").map(c=>f(c.id))).toEqual([{G:1,SC:1,QC:0}]);
  expect(g.trace.filter(c=>c.purpose==="SLS-frequent").map(c=>f(c.id))).toEqual([{G:1,SC:.7,QC:0}]);
  // 8681 4.3.3.1 no ELS: SC acompanhante pode estar ausente (efeito favorável)
  expect(g.trace.filter(c=>c.purpose==="SLS-quasi-permanent").map(c=>f(c.id))).toEqual([{G:1,SC:0,QC:0},{G:1,SC:.6,QC:0}]);
  const sp={cases:[{id:"G"},{id:"SC"},{id:"QC"}],combos:g.trace.map(c=>({id:c.id,factors:f(c.id)}))};
  const cov=auditEngineeringCombinationCoverage(g.engineeringCombinations,sp.cases,sp.combos);
  expect(cov.missingSLS).toEqual(["QC"]);                                  // limitação registrada, não escondida
});

const Q=Math.sqrt(1.01);   // 1/cos(theta), tan(theta)=0.1
const SQM=40;              // plan area 8 m x 5 m
it("NBR 6120 -> superfície -> terças -> pilares -> NBR 8681 -> PyNite real: reações por combinação conferidas à mão",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const r6=applyNbr6120Actions(roofProject(),input());
  const decl={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable"],
    families:["uls-normal","sls-quasi-permanent","sls-frequent","sls-rare"],
    actions:[{nature:"permanent",caseId:"ZERO",permanentType:"steel-and-equipment"},...r6.nbr8681Actions]};
  const {project,generated}=applyNbr8681Combinations(r6.project,decl);
  expect(generated.trace).toHaveLength(7);                              // 3 ELU + 2 QP (SC ausente/presente, 4.3.3.1) + FQ + RA
  const sp=project.workspace.spatialPreparation!;
  // existing double-count guard: automatic roof loads + nodal loads coexist -> explicit review is required
  await expect(adaptLoadedMixedProject(project)).rejects.toThrow("POSSIBLE_DOUBLE_COUNT");
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio M42-P2: ações independentes",
    revision:"Revisão M42-P2 v1",basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  const prepared=await adaptLoadedMixedProject(project);
  expect(prepared.request.member_loads.length).toBeGreaterThan(0);
  const result=await runLocalMixed(JSON.stringify(prepared.request));
  if(result.status!=="completed")throw Error("PyNite não analisou as ações da NBR 6120");
  const sums=(id:string)=>{
    let fz=0,mx=0,my=0;   // support reactions: force fz [N] and total moments about the origin, couples included [N.m]
    for(const s of prepared.request.supports){
      const n=prepared.request.nodes.find(x=>x.id===s.node)!,a=result.result.combinations[id].nodes[s.node],
        f=a.reaction_force_n,m=a.reaction_moment_nm;
      fz+=f[2];mx+=m[0]+n.y_m*f[2]-n.z_m*f[1];my+=m[1]+n.z_m*f[0]-n.x_m*f[2];
    }
    return {fz,mx,my};
  };
  const near=(a:number,b:number,rel=1e-6)=>expect(Math.abs(a-b)).toBeLessThan(rel*Math.max(1,Math.abs(b)));
  // independent forces (N): TELHA 60 N/m2 on the inclined surface, FORRO 100 N/m2 and SC 250 N/m2 on the plan
  const T=60*SQM*Q,F=100*SQM,S=250*SQM,QC=1000,G=T+F;
  const find=(f:(c:typeof generated.trace[number])=>boolean)=>{const x=generated.trace.filter(f);expect(x).toHaveLength(1);return x[0];};
  // centroids: roof loads at x=4 m, y=2.5 m ; concentrated at node C (x=4 m, y=0)
  // vertical loads F at (x,y): reactions carry Mx=+y.F and My=-x.F about the origin (couples at fixed supports included)
  const check=(id:string,fz:number,my:number,mx:number)=>{const s=sums(id);near(s.fz,fz);near(s.my,-my);near(s.mx,mx);};
  check(find(c=>c.purpose==="ULS"&&c.principal===null).id,1.25*G,4*1.25*G,2.5*1.25*G);
  check(find(c=>c.purpose==="ULS"&&c.principal==="SC").id,1.25*G+1.5*S,4*(1.25*G+1.5*S),2.5*(1.25*G+1.5*S));
  check(find(c=>c.purpose==="ULS"&&c.principal==="QC").id,1.25*G+1.5*QC,4*(1.25*G+1.5*QC),2.5*1.25*G);    // QC at y=0
  check(find(c=>c.purpose==="SLS-quasi-permanent"&&c.terms.some(t=>t.caseId==="SC"&&t.role==="accompanying")).id,G+.6*S,4*(G+.6*S),2.5*(G+.6*S));
  check(find(c=>c.purpose==="SLS-quasi-permanent"&&!c.terms.some(t=>t.caseId==="SC"&&t.role==="accompanying")).id,G,4*G,2.5*G);
  check(find(c=>c.purpose==="SLS-frequent").id,G+.7*S,4*(G+.7*S),2.5*(G+.7*S));
  check(find(c=>c.purpose==="SLS-characteristic").id,G+S,4*(G+S),2.5*(G+S));
  for(const c of generated.trace)expect(result.result.combinations[c.id].equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(prepared.roof_load_path!.actions.map(a=>a.action.caseId)).toEqual(["TELHA","FORRO","SC"]);
  expect(prepared.roof_load_path!.actions[0].distributedForceN[2]).toBeCloseTo(-T,6);
  expect(prepared.roof_load_path!.actions[2].distributedForceN[2]).toBeCloseTo(-S,6);
  // invalidation: changing the structure after the actions were applied makes the roof distribution stale
  const edited=structuredClone(project);
  edited.workspace.physicalStructure!.nodes.find(n=>n.id==="C")!.z+=50;
  await expect(adaptLoadedMixedProject(edited)).rejects.toThrow();
},240000);
