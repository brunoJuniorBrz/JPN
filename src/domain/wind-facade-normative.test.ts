import {afterEach,expect,it,vi} from "vitest";
import {twoWallProject} from "./test-support/m41-two-wall-fixture";
import {buildNormativeFacadeTraction,wallExternalCoefficients,internalPressureCoefficients} from "./wind-facade-normative";
import {distributeDeclaredFacadeTractions} from "./declared-facade-traction";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {auditFacadeSolverLoads} from "./facade-solver-load-audit";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
afterEach(()=>vi.unstubAllEnvs());

const speed={schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:30,heightM:4,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
  reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"5",source:"Dados sintéticos do ensaio",revision:"v1",responsible:"Responsável de referência"}};
const building={longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true};
const input=(cases:unknown[])=>({schema_version:"jpn.nbr6123-wall-wind/1",building,speed,cases});
// Independent q: S2=1*1*(5/10)^0.085 (h<5 m -> 5 m), Vk=30*S2, q=0.613*Vk^2.
const Q=0.613*(30*0.5**0.085)**2;
const two={rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"};

it("Tabela 6: células de barlavento/sotavento conferidas contra o documento (p.20)",()=>{
  const pick=(a:number,h:number)=>{const c=wallExternalCoefficients(a,h);return [c.C,c.D,c.A,c.B];};
  expect(pick(1,.5)).toEqual([.7,-.4,.7,-.4]);
  expect(pick(1.5,.5)).toEqual([.7,-.4,.7,-.4]);
  expect(pick(4,.5)).toEqual([.7,-.3,.7,-.5]);
  expect(pick(1,1)).toEqual([.7,-.5,.7,-.5]);
  expect(pick(2,1.5)).toEqual([.7,-.3,.7,-.6]);
  expect(pick(1.2,2)).toEqual([.8,-.6,.8,-.6]);
  expect(pick(3,6)).toEqual([.8,-.3,.8,-.6]);
  expect(wallExternalCoefficients(1,1.5).row).toBe("H2");
  expect(wallExternalCoefficients(1,1.5000001).row).toBe("H3");
  // Nota 2: linear interpolation between a/b=3/2 and 2 (row H1: D -0.4 -> -0.3, B -0.4 -> -0.5)
  expect(wallExternalCoefficients(1.75,.5).D).toBeCloseTo(-.35,12);
  expect(wallExternalCoefficients(1.75,.5).B).toBeCloseTo(-.45,12);
});
it("rejeita domínio fora da Tabela 6",()=>{
  for(const [a,h] of [[.99,1],[4.01,1],[2,0],[2,6.01]])
    expect(()=>wallExternalCoefficients(a,h)).toThrow("WIND_TABLE6_DOMAIN");
});
it("Cpi 6.3.2.1: a) +0,2 / -0,3 conforme a face perpendicular ao vento; b) -0,3 e 0 como cenários",()=>{
  expect(internalPressureCoefficients("two-opposite-faces-equally-permeable","X","X")).toEqual([.2]);
  expect(internalPressureCoefficients("two-opposite-faces-equally-permeable","X","Y")).toEqual([-.3]);
  expect(internalPressureCoefficients("four-faces-equally-permeable","Y")).toEqual([-.3,0]);
  expect(()=>internalPressureCoefficients("two-opposite-faces-equally-permeable","X")).toThrow("WIND_CPI_INPUT");
});
it("pressão líquida: sucção/pressão, direção do vento e sinais",()=>{
  const p=twoWallProject(["W1"]);
  const r=buildNormativeFacadeTraction(p,input([{id:"W1",windFrom:"+X",internalPressure:two}]));
  expect(r.speed.dynamicPressurePa).toBeCloseTo(Q,8);
  const [c]=r.traction.cases,east=c.zones.find(z=>z.facadeId==="EAST")!,west=c.zones.find(z=>z.facadeId==="WEST")!;
  // a/b=2, h/b=2/3 -> row H2/band 2-4: C=+0.7 windward, D=-0.3 leeward, Cpi=+0.2
  expect(east.netPressurePa).toBeCloseTo(Q*(0.7-0.2),8);
  expect(west.netPressurePa).toBeCloseTo(Q*(-0.3-0.2),8);
  expect(c.incidenceDeg).toBe(0);
  const r2=buildNormativeFacadeTraction(p,input([
    {id:"W1",windFrom:"-X",internalPressure:{rule:"two-opposite-faces-equally-permeable",permeableAxis:"Y"}}]));
  const z2=r2.traction.cases[0].zones;
  expect(z2.find(z=>z.facadeId==="WEST")!.netPressurePa).toBeCloseTo(Q*(0.7+0.3),8);
  expect(z2.find(z=>z.facadeId==="EAST")!.netPressurePa).toBeCloseTo(Q*(-0.3+0.3),8);
  expect(r2.traction.cases[0].incidenceDeg).toBe(180);
  expect(r.computedStructuralApproval).toBe(false);
  expect(r.fabricationRelease).toBe(false);
  expect(r.releaseGate).toBe("NOT_READY_BLOCKED");
});
it("Cpi b) gera dois cenários exclusivos com ids distintos",()=>{
  const p=twoWallProject(["W4-CPIN3","W4-CPIP0"]);
  const r=buildNormativeFacadeTraction(p,input([{id:"W4",windFrom:"+X",internalPressure:{rule:"four-faces-equally-permeable"}}]));
  expect(r.traction.cases.map(c=>c.id)).toEqual(["W4-CPIN3","W4-CPIP0"]);
  expect(r.traction.cases[0].zones[0].netPressurePa).toBeCloseTo(Q*(0.7+0.3),8);
  expect(r.traction.cases[1].zones[0].netPressurePa).toBeCloseTo(Q*0.7,8);
});
it("bloqueia entradas incompletas ou fora do domínio",()=>{
  const p=twoWallProject(["W1"]),ok={id:"W1",windFrom:"+X",internalPressure:{rule:"four-faces-equally-permeable"}};
  const withB=(o:object)=>({...input([ok]),building:{...building,...o}});
  expect(()=>buildNormativeFacadeTraction(p,input([{...ok,windFrom:"+Y"}]))).toThrow("WIND_FACADE_SIDE_ZONES_PENDING");
  expect(()=>buildNormativeFacadeTraction(p,withB({roofImpermeable:false}))).toThrow();
  expect(()=>buildNormativeFacadeTraction(p,{...input([ok]),speed:{...speed,heightM:5}})).toThrow("WIND_SPEED_HEIGHT");
  expect(()=>buildNormativeFacadeTraction(p,withB({heightM:5}))).toThrow("WIND_SPEED_HEIGHT");
  expect(()=>buildNormativeFacadeTraction(p,withB({shortSideM:5}))).toThrow("WIND_GEOMETRY_MISMATCH");
  expect(()=>buildNormativeFacadeTraction(p,withB({shortSideM:13}))).toThrow("WIND_PLAN");
  expect(()=>buildNormativeFacadeTraction(p,withB({longAxis:"Y"}))).toThrow("WIND_GEOMETRY_MISMATCH");
  expect(()=>buildNormativeFacadeTraction(p,withB({longSideM:30}))).toThrow("WIND_TABLE6_DOMAIN");
  expect(()=>buildNormativeFacadeTraction(p,input([ok,ok]))).toThrow("WIND_DUPLICATE_CASE");
  expect(()=>buildNormativeFacadeTraction(p,input([]))).toThrow();
});

it("NBR 6123 -> Cpe/Cpi -> pressão -> fachadas -> pilares -> PyNite real -> equilíbrio e reações",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=twoWallProject(["W1"]);
  const r=buildNormativeFacadeTraction(p,input([{id:"W1",windFrom:"+X",internalPressure:two}]));
  p.workspace.spatialPreparation!.loading={version:1,selfWeight:null,uniform:[],roofArea:[],facadeTraction:r.traction};
  const path=distributeDeclaredFacadeTractions(p,r.traction),c=path.cases[0];
  // Independent hand calculation: each wall 6 m x 4 m = 24 m2 pushes toward -X
  // with 0.5 q; total -24 q in X (windward inward + leeward suction).
  expect(c.forceN[0]).toBeCloseTo(-24*Q,6);
  expect(c.forceN[1]).toBeCloseTo(0,8);
  expect(c.forceN[2]).toBeCloseTo(0,8);
  expect(c.loads.map(l=>l.pieceId).sort()).toEqual(["C0_0","C0_1","C0_2","C8000_0","C8000_1","C8000_2"]);
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.request.member_loads).toHaveLength(6);
  const sum=prepared.request.member_loads.reduce((s,l)=>s+l.force_per_length_n_m[0]*4,0);
  expect(sum).toBeCloseTo(-24*Q,6);
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
    expect(Math.abs(F[i]+c.forceN[i])).toBeLessThan(1e-7*24*Q);
    expect(Math.abs(M[i]+c.momentNm[i])).toBeLessThan(1e-6*24*Q*8);
  }
  expect(F[0]).toBeCloseTo(24*Q,4);
  expect(a.equilibrium.relative_residual).toBeLessThan(1e-8);
},60000);
