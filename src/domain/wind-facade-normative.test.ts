import {afterEach,expect,it,vi} from "vitest";
import {buildingProject} from "./test-support/m41-building-fixture";
import type {Side} from "./test-support/m41-building-fixture";
import {buildNormativeFacadeTraction,table6Coefficient,a3b3Coefficient,parallelWallZones,
  wallExternalCoefficients,internalPressureCoefficients} from "./wind-facade-normative";
import {distributeDeclaredFacadeTractions} from "./declared-facade-traction";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {auditFacadeSolverLoads} from "./facade-solver-load-audit";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
afterEach(()=>vi.unstubAllEnvs());

const speed={schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:30,heightM:4,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
  reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"5",source:"Dados sintéticos do ensaio",revision:"v1",responsible:"Responsável de referência"}};
const building={longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true};
// Engineer confirmations for the blurred cells of row H2 (1/2<h/b<=3/2), band 2<=a/b<=4,
// typed independently of the data file.
const CONFIRM=[{cell:"H2/hi/A1B1",value:-0.9},{cell:"H2/hi/D",value:-0.3},{cell:"H2/hi/B",value:-0.6},{cell:"H2/hi/C1D1",value:-0.9}];
const two={rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"};
const input=(cases:unknown[],extra:object={})=>({schema_version:"jpn.nbr6123-wall-wind/2",building,speed,
  coefficientConfirmations:CONFIRM,cases,...extra});
const wc=(id:string,windFrom:string)=>({id,windFrom,internalPressure:two});
// Independent q: S2=1*1*(5/10)^0.085 (h<5 m -> 5 m), Vk=30*S2, q=0.613*Vk^2.
const Q=0.613*(30*0.5**0.085)**2;

it("Tabela 6: todas as células conferidas contra a transcrição da p.20 e marcação de glifos borrados",()=>{
  const v=(c:Parameters<typeof table6Coefficient>[0],a:number,h:number)=>table6Coefficient(c,a,h).value;
  // row H1, bands lo/hi
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,1,.5))).toEqual([-.8,-.5,.7,-.4,.7,-.4,-.8,-.4]);
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,4,.5))).toEqual([-.8,-.4,.7,-.3,.7,-.5,-.9,-.5]);
  // row H2
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,1.5,1))).toEqual([-.9,-.5,.7,-.5,.7,-.5,-.9,-.5]);
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,2,1.5))).toEqual([-.9,-.4,.7,-.3,.7,-.6,-.9,-.5]);
  // row H3
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,1.2,2))).toEqual([-1,-.6,.8,-.6,.8,-.6,-1,-.6]);
  expect(["A1B1","A2B2","C","D","A","B","C1D1","C2D2"].map(c=>v(c as never,3,6))).toEqual([-1,-.5,.8,-.3,.8,-.6,-1,-.6]);
  expect(wallExternalCoefficients(1,1.5).row).toBe("H2");
  expect(wallExternalCoefficients(1,1.5000001).row).toBe("H3");
  expect(wallExternalCoefficients(1,.5).row).toBe("H1");
  // blurred: final digit 3/6/8/9 -> needs confirmation; 4/5/7/0 are legible
  const cellsOf=(c:Parameters<typeof table6Coefficient>[0])=>table6Coefficient(c,2,1).cells[0];
  expect(cellsOf("A2B2").blurred).toBe(false);
  expect(cellsOf("C").blurred).toBe(false);
  expect(cellsOf("D").blurred).toBe(true);
  expect(cellsOf("B").blurred).toBe(true);
  expect(cellsOf("C1D1").blurred).toBe(true);
  expect(cellsOf("C2D2").blurred).toBe(false);
  // Nota 2 interpolation between a/b=3/2 and 2 (row H1: D -0.4 -> -0.3, A2B2 -0.5 -> -0.4)
  expect(table6Coefficient("D",1.75,.5).value).toBeCloseTo(-.35,12);
  expect(table6Coefficient("A2B2",1.75,.5).value).toBeCloseTo(-.45,12);
  expect(table6Coefficient("D",1.75,.5).cells).toHaveLength(2);
});
it("Nota 3: A3/B3 = A2/B2 em a/b=1, -0,2 para a/b>=2, interpolação linear entre eles",()=>{
  expect(a3b3Coefficient(1,1).value).toBeCloseTo(-.5,12);   // H2/lo/A2B2
  expect(a3b3Coefficient(1.5,1).value).toBeCloseTo(-.35,12);
  expect(a3b3Coefficient(2,1).value).toBeCloseTo(-.2,12);
  expect(a3b3Coefficient(4,1).value).toBeCloseTo(-.2,12);
  expect(a3b3Coefficient(1,2).value).toBeCloseTo(-.6,12);   // H3/lo/A2B2
});
it("geometria das zonas (figura da Tabela 6): comprimentos a partir da aresta de barlavento",()=>{
  const z=(alpha:0|90,a:number,b:number,h:number)=>parallelWallZones(alpha,a,b,h).map(x=>[x.zone,x.startM,x.endM]);
  // alpha 0: A1 = min(max(b/3,a/4),2h) ; A2 up to a/2 ; A3 to a
  expect(z(0,12,6,4)).toEqual([["A1B1",0,3],["A2B2",3,6],["A3B3",6,12]]);          // max(2,3)=3 < 8
  expect(z(0,12,6,1)).toEqual([["A1B1",0,2],["A2B2",2,6],["A3B3",6,12]]);          // 2h=2 limits
  expect(z(0,6,6,10)).toEqual([["A1B1",0,2],["A2B2",2,3],["A3B3",3,6]]);           // b/3=2 > a/4=1.5
  // alpha 90: C1 = min(2h, b/2)
  expect(z(90,12,6,4)).toEqual([["C1D1",0,3],["C2D2",3,6]]);
  expect(z(90,12,6,1)).toEqual([["C1D1",0,2],["C2D2",2,6]]);
});
it("rejeita domínio fora da Tabela 6 e Cpi incompleto",()=>{
  for(const [a,h] of [[.99,1],[4.01,1],[2,0],[2,6.01]])
    expect(()=>table6Coefficient("C",a,h)).toThrow("WIND_TABLE6_DOMAIN");
  expect(internalPressureCoefficients("two-opposite-faces-equally-permeable","X","X")).toEqual([.2]);
  expect(internalPressureCoefficients("two-opposite-faces-equally-permeable","X","Y")).toEqual([-.3]);
  expect(internalPressureCoefficients("four-faces-equally-permeable","Y")).toEqual([-.3,0]);
  expect(()=>internalPressureCoefficients("two-opposite-faces-equally-permeable","X")).toThrow("WIND_CPI_INPUT");
});
it("células borradas exigem confirmação do responsável técnico e batem com o transcrito",()=>{
  const p=buildingProject(["W1"]);
  expect(()=>buildNormativeFacadeTraction(p,input([wc("W1","+X")],{coefficientConfirmations:[]}))).toThrow("WIND_COEFFICIENT_UNCONFIRMED");
  const wrong=CONFIRM.map(c=>c.cell==="H2/hi/D"?{...c,value:-0.5}:c);
  expect(()=>buildNormativeFacadeTraction(p,input([wc("W1","+X")],{coefficientConfirmations:wrong}))).toThrow("WIND_COEFFICIENT_CONFIRMATION_MISMATCH");
  const ok=buildNormativeFacadeTraction(p,input([wc("W1","+X")]));
  expect(ok.usedCells).toContain("H2/hi/D");
  expect(ok.usedCells).toContain("H2/hi/A1B1");
});

// windFrom -> [windward, leeward, alpha, windwardCpe, leewardCpe, {parallelFacade: [[start,end,cpe]...]}]
// Profiles are measured from each facade's own u-min end (u: +X=y, -X=-y, +Y=-x, -Y=x).
const A1=-.9,A2=-.4,A3=-.2,C1=-.9,C2=-.5;
const DIRS:[string,Side,Side,number,number,Record<string,number[][]>][]=[
  ["+X","EAST","WEST",0,-.3,{NORTH:[[0,3,A1],[3,6,A2],[6,12,A3]],SOUTH:[[0,6,A3],[6,9,A2],[9,12,A1]]}],
  ["-X","WEST","EAST",0,-.3,{NORTH:[[0,6,A3],[6,9,A2],[9,12,A1]],SOUTH:[[0,3,A1],[3,6,A2],[6,12,A3]]}],
  ["+Y","NORTH","SOUTH",90,-.6,{EAST:[[0,3,C2],[3,6,C1]],WEST:[[0,3,C1],[3,6,C2]]}],
  ["-Y","SOUTH","NORTH",90,-.6,{EAST:[[0,3,C1],[3,6,C2]],WEST:[[0,3,C2],[3,6,C1]]}],
];
for(const [from,wind,lee,alpha,leeCpe,par] of DIRS)it("vento "+from+": barlavento, sotavento e zonas das paredes paralelas",()=>{
  const p=buildingProject(["W1"]),r=buildNormativeFacadeTraction(p,input([wc("W1",from)]));
  const cpi=from.endsWith("X")?.2:-.3,[c]=r.traction.cases,zone=(id:string)=>c.zones.find(z=>z.facadeId===id)!;
  expect(r.speed.dynamicPressurePa).toBeCloseTo(Q,8);
  expect(zone(wind).netPressurePa).toBeCloseTo(Q*(.7-cpi),8);      // pressão positiva (para dentro)
  expect(zone(lee).netPressurePa).toBeCloseTo(Q*(leeCpe-cpi),8);
  expect(zone(wind).profile).toBeUndefined();
  expect(r.trace.filter(t=>(t as {role:string}).role!=="parallel")).toHaveLength(2);
  for(const [id,segs] of Object.entries(par)){
    const prof=zone(id).profile!;
    expect(prof.map(s=>[s.startM,s.endM])).toEqual(segs.map(s=>[s[0],s[1]]));
    prof.forEach((s,i)=>expect(s.netPressurePa).toBeCloseTo(Q*(segs[i][2]-cpi),8));  // sucção (negativa)
    const mean=prof.reduce((t,s)=>t+s.netPressurePa*(s.endM-s.startM),0)/(prof.at(-1)!.endM);
    expect(zone(id).netPressurePa).toBeCloseTo(mean,8);
  }
  expect(c.incidenceDeg).toBe({"+X":0,"+Y":90,"-X":180,"-Y":270}[from as "+X"]);
  expect(alpha).toBe(from.endsWith("X")?0:90);
  expect(r.computedStructuralApproval).toBe(false);
  expect(r.fabricationRelease).toBe(false);
  expect(r.releaseGate).toBe("NOT_READY_BLOCKED");
});
it("Cpi b) gera dois cenários exclusivos com ids distintos",()=>{
  const p=buildingProject(["W4-CPIN3","W4-CPIP0"],["EAST","WEST"]);
  const r=buildNormativeFacadeTraction(p,input([{id:"W4",windFrom:"+X",internalPressure:{rule:"four-faces-equally-permeable"}}]));
  expect(r.traction.cases.map(c=>c.id)).toEqual(["W4-CPIN3","W4-CPIP0"]);
  expect(r.traction.cases[0].zones[0].netPressurePa).toBeCloseTo(Q*(0.7+0.3),8);
  expect(r.traction.cases[1].zones[0].netPressurePa).toBeCloseTo(Q*0.7,8);
});
it("bloqueia entradas incompletas ou fora do domínio",()=>{
  const p=buildingProject(["W1"]),ok=wc("W1","+X"),withB=(o:object)=>input([ok],{building:{...building,...o}});
  expect(()=>buildNormativeFacadeTraction(p,withB({roofImpermeable:false}))).toThrow();
  expect(()=>buildNormativeFacadeTraction(p,input([ok],{speed:{...speed,heightM:5}}))).toThrow("WIND_SPEED_HEIGHT");
  expect(()=>buildNormativeFacadeTraction(p,withB({heightM:5}))).toThrow("WIND_SPEED_HEIGHT");
  expect(()=>buildNormativeFacadeTraction(p,withB({shortSideM:5}))).toThrow("WIND_PLAN_MISMATCH");
  expect(()=>buildNormativeFacadeTraction(p,withB({shortSideM:13}))).toThrow("WIND_PLAN");
  expect(()=>buildNormativeFacadeTraction(p,withB({longAxis:"Y"}))).toThrow("WIND_PLAN_MISMATCH");
  expect(()=>buildNormativeFacadeTraction(p,withB({longSideM:30}))).toThrow("WIND_PLAN_MISMATCH");
  expect(()=>buildNormativeFacadeTraction(buildingProject(["W1"],["EAST"]),withB({longSideM:30}))).toThrow("WIND_TABLE6_DOMAIN");
  expect(()=>buildNormativeFacadeTraction(p,input([ok,ok]))).toThrow("WIND_DUPLICATE_CASE");
  expect(()=>buildNormativeFacadeTraction(p,input([]))).toThrow();
});
it("zonas de transição: reações de apoios simples conservam força e momento; sem duplicação",()=>{
  // wind from -X on the four walls: NORTH has columns at x=0,6,12 m and zone
  // boundary A1|A2 at x=3 m INSIDE the first span (A2|A3 at x=6 on a column).
  const p=buildingProject(["W1"]),r=buildNormativeFacadeTraction(p,input([wc("W1","-X")]));
  const path=distributeDeclaredFacadeTractions(p,r.traction),c=path.cases[0];
  const p1=Q*(A1-.2),p2=Q*(A2-.2),p3=Q*(A3-.2);
  const north=c.zones.find(z=>z.facadeId==="NORTH")!,fy=(id:string)=>north.contributions.find(x=>x.pieceId===id)!.forcePerLengthNM[1];
  // Hand calculation of simple-support reactions (N per metre of column height); force = -lambda (outward normal +Y)
  expect(-fy("C0_6000")).toBeCloseTo(2.25*p1+.75*p2,6);
  expect(-fy("C6000_6000")).toBeCloseTo(.75*p1+2.25*p2+3*p3,6);
  expect(-fy("C12000_6000")).toBeCloseTo(3*p3,6);
  expect(-fy("C0_6000")-fy("C6000_6000")-fy("C12000_6000")).toBeCloseTo(3*p1+3*p2+6*p3,6);
  for(const z of c.zones){
    for(let i=0;i<3;i++){
      expect(Math.abs(z.distributedForceN[i]-z.expectedForceN[i])).toBeLessThan(1e-9*Math.max(1,Math.abs(z.expectedForceN[1])));
      expect(Math.abs(z.distributedMomentNm[i]-z.expectedMomentNm[i])).toBeLessThan(1e-8*Math.max(1,Math.abs(z.expectedForceN[1]))*12);
    }
  }
  // each physical column appears once per case; shared corner columns combine both walls exactly once
  const ids=c.loads.map(l=>l.pieceId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(8);
});
it("contrato do perfil: cobertura e média ponderada obrigatórias",()=>{
  const p=buildingProject(["W1"]),r=buildNormativeFacadeTraction(p,input([wc("W1","-X")]));
  const bad=(fn:(t:typeof r.traction)=>void)=>{const t=structuredClone(r.traction);fn(t);return ()=>distributeDeclaredFacadeTractions(p,t);};
  const north=(t:typeof r.traction)=>t.cases[0].zones.find(z=>z.facadeId==="NORTH")!;
  expect(bad(t=>{north(t).profile![0].startM=.5;})).toThrow("FACADE_PROFILE_COVERAGE");
  expect(bad(t=>{north(t).profile!.pop();})).toThrow("FACADE_PROFILE_COVERAGE");
  expect(bad(t=>{north(t).netPressurePa*=1.01;})).toThrow("FACADE_PROFILE_MEAN");
});

it("NBR 6123 -> Cpe/Cpi -> pressão -> 4 fachadas -> pilares -> PyNite real -> equilíbrio e reações (vento +Y)",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=buildingProject(["W1"]);
  const r=buildNormativeFacadeTraction(p,input([wc("W1","+Y")]));
  p.workspace.spatialPreparation!.loading={version:1,selfWeight:null,uniform:[],roofArea:[],facadeTraction:r.traction};
  const c=distributeDeclaredFacadeTractions(p,r.traction).cases[0];
  // Independent hand totals (a/b=2, h/b=2/3, alpha=90: A=+0.7 windward, B=-0.6 leeward; each 12x4=48 m2;
  // Cpi cancels; EAST/WEST zone forces are equal and opposite at the same height and elevation in y).
  expect(c.forceN[0]).toBeCloseTo(0,5);
  expect(c.forceN[1]).toBeCloseTo(-48*Q*1.3,5);
  expect(c.forceN[2]).toBeCloseTo(0,8);
  expect(c.momentNm[0]).toBeCloseTo(2*48*Q*1.3,4);   // Mx = -z*Fy at z=2 m
  expect(c.momentNm[1]).toBeCloseTo(0,4);
  expect(c.momentNm[2]).toBeCloseTo(6*(-48*Q*1.3),4); // Mz = x*Fy at x=6 m
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.facade_solver_audit?.verified).toBe(true);
  expect(prepared.facade_traction_path?.windNormativeReady).toBe(false);
  const dup=structuredClone(prepared.request);
  dup.member_loads.push({...dup.member_loads[0],id:"EXTRA-LOAD"});
  expect(()=>auditFacadeSolverLoads(p,prepared.facade_traction_path!,dup,prepared.mapping)).toThrow("FACADE_AUDIT_UNTRACED_LOAD");
  const result=await runLocalMixed(JSON.stringify(prepared.request));
  if(result.status!=="completed")throw Error("PyNite não analisou o caso de vento normativo");
  const a=result.result.combinations["ELASTIC-WIND"];
  const F=[0,0,0],M=[0,0,0];
  for(const s of prepared.request.supports){
    const n=prepared.request.nodes.find(x=>x.id===s.node)!,ans=a.nodes[s.node],f=ans.reaction_force_n,m=ans.reaction_moment_nm;
    for(let i=0;i<3;i++)F[i]+=f[i];
    M[0]+=m[0]+n.y_m*f[2]-n.z_m*f[1];
    M[1]+=m[1]+n.z_m*f[0]-n.x_m*f[2];
    M[2]+=m[2]+n.x_m*f[1]-n.y_m*f[0];
  }
  for(let i=0;i<3;i++){
    expect(Math.abs(F[i]+c.forceN[i])).toBeLessThan(1e-7*48*Q);
    expect(Math.abs(M[i]+c.momentNm[i])).toBeLessThan(1e-6*48*Q*8);
  }
  expect(a.equilibrium.relative_residual).toBeLessThan(1e-8);
},90000);
