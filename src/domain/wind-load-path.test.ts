import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { windReferenceProject, syntheticWindReference as ref } from "./examples/wind-project";
import { windDeclarationSchema, type WindDeclaration } from "./wind-contracts";
import { distributeWindActions } from "./wind-load-path";
import { createQuickProject } from "./quick-project";
import { structureSignature } from "./calculations/project-basis";
import { generatedRoofRegions } from "./roof-load-path";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { adaptMixedProject } from "./mixed-adapter";
import { applyEngineeringPackage } from "./engineering-declarations";
import { compileEngineeringCombinations, verifyEngineeringCombinations } from "./engineering-combinations";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { anyMixedRequestSchema, verifyLoadingTrace, selfWeightOverlapReviewBasis } from "./structural-loading";
import { verifyMixedResult } from "./mixed-analysis";
import { emptySnapshot, projectSchema } from "./models";
import { parseBackup, serializeBackup } from "@/infrastructure/persistence/local";

afterEach(()=>vi.unstubAllEnvs());
const close = (a:number[],b:number[],digits=7) => a.forEach((x,i)=>expect(x).toBeCloseTo(b[i],digits));
function rectangle(slope=25) {
  const p=createQuickProject({typology:"mono",widthM:6,lengthM:8,heightM:3,slopePercent:slope});
  p.planning!.purlinSpacingM=2.1;p.roof.fall="width-negative"; return p;
}
function declaration(p:ReturnType<typeof rectangle>,cut=1.3):WindDeclaration {
  const d=structuredClone(windReferenceProject().workspace.spatialPreparation!.loading!.wind!);
  d.geometrySignature=structureSignature(p);
  d.cases=[{id:"W",incidenceDeg:0,dynamicPressurePa:1000,reference:ref,zones:[
    {id:"EDGE",regionId:"roof-1",boundsM:[0,0,cut,8],kind:"edge",externalCoefficient:.8,internalCoefficient:.1,reference:ref},
    {id:"REST",regionId:"roof-1",boundsM:[cut,0,6,8],kind:"interior",externalCoefficient:-.3,internalCoefficient:.1,reference:ref},
  ]}]; return d;
}
function realEnv(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}

it("zonas assimétricas: integral independente de pressão, área inclinada, força e todos os momentos",()=>{
  const p=rectangle(),d=declaration(p),before=JSON.stringify({p,d}),t=distributeWindActions(p,d),c=t.cases[0];
  // Independent integrals in x: S0=8*(700*1.3-400*4.7),
  // Sx=8*(700*1.3²/2-400*(6²-1.3²)/2); z=3+0.25*x.
  const s0=-7760,sx=-50164,sy=4*s0,sz=3*s0+.25*sx;
  close(c.forceN,[.25*s0,0,-s0]); close(c.momentNm,[-sy,.25*sz+sx,-.25*sy]);
  expect(c.zones[0].areaM2).toBeCloseTo(1.3*8*Math.sqrt(1.0625),10);
  expect(c.zones[0].netPressurePa).toBeCloseTo(700,10);expect(c.zones[1].netPressurePa).toBe(-400);
  // Edge-only 0..1.3 in the first 2 m span: Rleft=700*(1.3-1.3²/4).
  const edge=c.zones[0].contributions.filter(x=>x.pieceId==="TE1-V1");
  expect(edge).toHaveLength(1);close(edge[0].forcePerLengthNM,[.25*700*(1.3-1.3**2/4),0,-700*(1.3-1.3**2/4)]);
  for(const z of c.zones){close(z.expectedForceN,z.distributedForceN);close(z.expectedMomentNm,z.distributedMomentNm);expect(z.distributedAreaM2).toBeCloseTo(z.areaM2,10);}
  expect(JSON.stringify({p,d})).toBe(before);
});

for(const fall of ["width-positive","width-negative","length-positive","length-negative"] as const)
  for(const typology of ["mono","gable"] as const) it(`inversão, planos e cumeeira — ${fall}/${typology}`,()=>{
    const p=rectangle();p.roof.fall=fall;p.planning!.typology=typology;p.planning!.overhangStartM=.4;p.planning!.overhangEndM=.8;
    const d=declaration(p),regions=generatedRoofRegions(p).regions;
    d.geometrySignature=structureSignature(p);d.cases[0].zones=regions.map((r,i)=>({id:`Z${i}`,regionId:r.id,boundsM:r.boundsM,kind:"interior",externalCoefficient:.8,internalCoefficient:.1,reference:ref}));
    const pos=distributeWindActions(p,d).cases[0];
    const transverse=fall.startsWith("width")?6:8,longitudinal=fall.startsWith("width")?8:6;
    // Normal pressure: Fz=-p * horizontal area, independent of slope.
    expect(pos.forceN[2]).toBeCloseTo(-700*transverse*(longitudinal+1.2),7);
    for(const z of d.cases[0].zones)z.externalCoefficient=-.6; // cpe-cpi = -0.7
    const neg=distributeWindActions(p,d).cases[0];close(neg.forceN,pos.forceN.map(x=>-x));close(neg.momentNm,pos.momentNm.map(x=>-x));
    expect(new Set(pos.loads.map(l=>l.pieceId)).size).toBe(pos.loads.length);
    if(typology==="gable")expect(Math.hypot(pos.forceN[0],pos.forceN[1])).toBeLessThan(1e-7);
  });

it("zonas longitudinais só em extremos reais de peças; sem média silenciosa",()=>{
  const p=rectangle(),d=declaration(p),base=d.cases[0].zones[0];
  d.cases[0].zones=[{...base,id:"A",boundsM:[0,0,6,4]},{...base,id:"B",boundsM:[0,4,6,8],externalCoefficient:-.8}];
  expect(distributeWindActions(p,d).cases[0].zones).toHaveLength(2);
  d.cases[0].zones[0].boundsM[3]=3;d.cases[0].zones[1].boundsM[1]=3;
  expect(()=>distributeWindActions(p,d)).toThrow(/fronteira longitudinal corta peça/);
});

it("pressão líquida zero explícita preserva áreas e não cria ações artificiais",()=>{
  const p=rectangle(),d=declaration(p);d.cases[0].zones.forEach(z=>z.externalCoefficient=z.internalCoefficient);
  const c=distributeWindActions(p,d).cases[0];close(c.forceN,[0,0,0]);close(c.momentNm,[0,0,0]);
  expect(c.zones.reduce((s,z)=>s+z.areaM2,0)).toBeCloseTo(48*Math.sqrt(1.0625),10);
  c.loads.forEach(l=>close(l.forcePerLengthNM,[0,0,0]));
});

it("bloqueia lacunas, sobreposições, superfícies órfãs, cpi incompatível e dados degenerados",()=>{
  const p=rectangle();
  for(const edit of [
    (d:WindDeclaration)=>{d.cases[0].zones[1].boundsM[0]=1.4;},
    (d:WindDeclaration)=>{d.cases[0].zones[1].boundsM[0]=1.2;},
    (d:WindDeclaration)=>{d.cases[0].zones[0].regionId="missing";},
    (d:WindDeclaration)=>{d.cases[0].zones[0].boundsM[0]=-.1;},
    (d:WindDeclaration)=>{d.cases[0].zones[1].internalCoefficient=.2;},
    (d:WindDeclaration)=>{d.cases[0].zones[1].id="EDGE";},
    (d:WindDeclaration)=>{d.cases.push(d.cases[0]);},
  ]){const d=declaration(p);edit(d);expect(()=>distributeWindActions(p,d)).toThrow(/WIND_LOAD_PATH/);}
  const d=declaration(p);
  for(const value of [NaN,Infinity,0,-100])expect(windDeclarationSchema.safeParse({...d,cases:[{...d.cases[0],dynamicPressurePa:value}]}).success).toBe(false);
  expect(windDeclarationSchema.safeParse({...d,building:{...d.building,location:" "}}).success).toBe(false);
  expect(windDeclarationSchema.safeParse({...d,building:{...d.building,enclosure:"open"}}).success).toBe(false);
  expect(windDeclarationSchema.safeParse({...d,normativeValidation:"approved"}).success).toBe(false);
  expect(windDeclarationSchema.safeParse({...d,cases:[{...d.cases[0],zones:[{...d.cases[0].zones[0],boundsM:[0,0,0,8]}]}]}).success).toBe(false);
  p.roof.widthM=7;expect(()=>distributeWindActions(p,d)).toThrow(/STALE_WIND/);
});

it("combinações: aritmética independente gamma×psi, categorias e exclusões, zeros explícitos",()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!,c=structuredClone(d.engineeringCombinations!);
  c.combinations=[c.combinations[3]];c.combinations[0].purpose="ULS";
  c.combinations[0].terms.find(t=>t.caseId==="AREA")!.gamma=1.37;
  const w=c.combinations[0].terms.find(t=>t.caseId==="WP")!;w.gamma=1.61;w.psi=.63;
  const result=compileEngineeringCombinations(c,d.cases.map(x=>x.id));
  expect(result.combinations[0].factors).toEqual({AREA:1.37,WP:1.0143,WS:0});expect(result.approved).toBe(false);
  for(const edit of [
    (x:typeof c)=>{x.combinations[0].terms.pop();},
    (x:typeof c)=>{x.combinations[0].terms[2].gamma=1;},
    (x:typeof c)=>{x.actions[1].caseId="MISSING";},
    (x:typeof c)=>{x.combinations.push(x.combinations[0]);},
    (x:typeof c)=>{x.combinations[0].terms[0].reference.clause="";},
  ]){const copy=structuredClone(c);edit(copy);expect(()=>compileEngineeringCombinations(copy,d.cases.map(x=>x.id))).toThrow();}
  const actual=structuredClone(d.combinations);actual[0].factors.WP=2;
  expect(()=>verifyEngineeringCombinations(d.engineeringCombinations,d.cases,actual)).toThrow(/STALE_ENGINEERING_COMBINATIONS/);
});

it("importação atômica, persistência e backups; não aprova nem altera materiais/cargas existentes",()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!,before=JSON.stringify(p),pack={schema_version:"jpn.engineering-package/1",wind:d.loading!.wind,combinations:d.engineeringCombinations};
  const next=applyEngineeringPackage(p,pack);expect(JSON.stringify(p)).toBe(before);
  expect(next.workspace.spatialPreparation!.groups).toEqual(d.groups);expect(next.workspace.spatialPreparation!.loads).toEqual(d.loads);expect(next.workspace.spatialPreparation!.loading!.roofArea).toEqual(d.loading!.roofArea);
  expect(next.workspace.spatialPreparation!.loading!.overlapReview).toBeUndefined();
  expect(projectSchema.parse(next)).toEqual(next);
  const restored=parseBackup(serializeBackup({...emptySnapshot(),projects:[next]})).data.projects[0];expect(restored.workspace.spatialPreparation).toEqual(JSON.parse(JSON.stringify(next.workspace.spatialPreparation)));
});

it("vento bloqueia física ausente, axiais transversais, dupla contagem e revisão obsoleta",async()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!;
  await expect(adaptMixedProject(p)).rejects.toThrow(/WIND_LOADED_REQUIRED/);
  const a=await adaptLoadedMixedProject(p),old=a.input_sha256;
  d.loading!.wind!.building.velocityReference.revision="R2";
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  expect((await adaptLoadedMixedProject(p)).input_sha256).not.toBe(old);
  d.loading!.wind!.cases[0].zones[0].externalCoefficient+=.1;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  d.loading!.uniform.push({id:"dup",pieceId:"TE1-V1",caseId:"WP",coordinates:"global",knM:[0,0,-1],source:"declared",revision:"1"});
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/ROOF_DOUBLE_COUNT/);d.loading!.uniform=[];
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  d.groups.purlin.elementKind="axial";d.groups.purlin.connection="axial";
  d.loading!.roofArea=[];d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/WIND_AXIAL_UNSUPPORTED/);
  d.groups.purlin.elementKind="frame";d.groups.purlin.connection="rigid";d.groups.purlin.areaCm2=null;
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  await expect(adaptLoadedMixedProject(p)).rejects.toMatchObject({code:"PREPARATION_INCOMPLETE"});
});

it("cobertura real gerada → vento zonal → PyNite real: reações, momentos, sinais e superposição",async()=>{
  realEnv();const p=windReferenceProject(),a=await adaptLoadedMixedProject(p),out=await runLocalMixed(JSON.stringify(a.request));
  expect(a.request.nodes).toHaveLength(132);expect(a.request.members).toHaveLength(243);
  if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw new Error("Python real não concluiu");
  verifyMixedResult(a.request,out.result,a.input_sha256);verifyLoadingTrace(a.request,out.result);
  const wp=out.result.combinations.WP,ws=out.result.combinations.WS,dbl=out.result.combinations.DOUBLE,sum=out.result.combinations.SUM;
  const f=[0,0,0],m=[0,0,0];
  for(const n of a.request.nodes){const r=wp.nodes[n.id];r.reaction_force_n.forEach((x,i)=>f[i]+=x);
    const [x,y,z]=r.reaction_force_n;const moment=[n.y_m*z-n.z_m*y,n.z_m*x-n.x_m*z,n.x_m*y-n.y_m*x];r.reaction_moment_nm.forEach((x,i)=>m[i]+=x+moment[i]);
    close(ws.nodes[n.id].translation_m,r.translation_m.map(x=>-x),10);close(dbl.nodes[n.id].translation_m,r.translation_m.map(x=>2*x),10);
  }
  close(f,a.wind_load_path!.cases[0].forceN.map(x=>-x),5);close(m,a.wind_load_path!.cases[0].momentNm.map(x=>-x),4);
  expect(f[2]).toBeCloseTo(50000,5);expect(wp.equilibrium.relative_residual).toBeLessThan(1e-8);
  // SUM = downward permanent action (20000 N reaction) + WP.
  expect(Object.values(sum.nodes).reduce((s,n)=>s+n.reaction_force_n[2],0)).toBeCloseTo(70000,5);
  for(const id of Object.keys(wp.members)){const w=wp.members[id],s=ws.members[id],b=dbl.members[id];if(w.kind==="frame"&&s.kind==="frame"&&b.kind==="frame"){close(s.end_actions_local,w.end_actions_local.map(x=>-x),5);close(b.end_actions_local,w.end_actions_local.map(x=>2*x),5);}else if(w.kind==="axial"&&s.kind==="axial"){expect(s.axial_n).toBeCloseTo(-w.axial_n,5);}}
  expect(a.approved_for_fabrication).toBe(false);expect(a.wind_load_path!.approved).toBe(false);expect(a.engineering_combinations!.approved).toBe(false);
},20000);

it("vento em estrutura sem vínculos suficientes continua recusado pelo Python real",async()=>{
  realEnv();const p=windReferenceProject(),d=p.workspace.spatialPreparation!;d.supports.forEach(s=>s.dofs=["free","free","free","free","free","free"]);
  const a=await adaptLoadedMixedProject(p);await expect(runLocalMixed(JSON.stringify(a.request))).rejects.toMatchObject({code:"UNSTABLE"});
},20000);

it("q de zona inclinada → balanço misto real contra solução fechada biaxial independente",()=>{
  const p=rectangle(),d=declaration(p),q=distributeWindActions(p,d).cases[0].loads.find(l=>l.pieceId==="TE1-V1")!.forcePerLengthNM;
  const L=4,E=200e9,I=1e-5,release=[false,false,false,false,false,false];
  const request=anyMixedRequestSchema.parse({schema_version:"jpn.mixed3d/2",units:"SI",theory:"linear-elastic-frame-axial",project:{id:"WIND-CONTROL",revision:"1",source:ref.source},
    nodes:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:0,y_m:L,z_m:0},{id:"C",x_m:0,y_m:L+1,z_m:0}],
    materials:[{id:"M",e_pa:E,g_pa:E/2.6,nu:.3,source:ref.source,revision:"1"}],sections:[{id:"S",area_m2:.01,iy_m4:I,iz_m4:I,j_m4:I,source:ref.source,revision:"1"}],
    members:[{id:"F",kind:"frame",start:"A",end:"B",material:"M",section:"S",rotation_deg:37,release_start:release,release_end:release},{id:"X",kind:"axial",start:"B",end:"C",e_pa:E,area_m2:.001,source:ref.source,revision:"1"}],
    supports:[{node:"A",restrained:[true,true,true,true,true,true]},{node:"C",restrained:[true,true,true,false,false,false]}],cases:[{id:"W",source:ref.source}],combinations:[{id:"W",factors:{W:1}}],nodal_loads:[],self_weight:null,
    member_loads:[{id:"W:F",member:"F",case:"W",coordinate_system:"global",force_per_length_n_m:q,source:ref.source,revision:"1"}]});
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(request),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},maxBuffer:2000000}));
  expect(out.status).toBe("completed");const c=out.result.combinations.W;
  close(c.nodes.B.translation_m,q.map(x=>x*L**4/(8*E*I)),11);
  close(c.nodes.B.rotation_rad,[q[2]*L**3/(6*E*I),0,-q[0]*L**3/(6*E*I)],11);
  close(c.nodes.A.reaction_force_n,q.map(x=>-x*L),7);
  close(c.nodes.A.reaction_moment_nm,[-q[2]*L**2/2,0,q[0]*L**2/2],7);
  const station=c.members.F.stations[2],qm=Math.hypot(q[0],q[2]);
  expect(Math.hypot(station.vy_n,station.vz_n)).toBeCloseTo(qm*L/2,7);expect(Math.hypot(station.my_nm,station.mz_nm)).toBeCloseTo(qm*L**2/8,7);
  expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
},10000);
