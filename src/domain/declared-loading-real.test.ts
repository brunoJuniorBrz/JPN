import { expect,it } from "vitest";
import { execFileSync,spawnSync } from "node:child_process";
import path from "node:path";
import { mkdirSync,writeFileSync } from "node:fs";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { adaptMixedProject } from "./mixed-adapter";
import { mixedInputHash,verifyMixedResult } from "./mixed-analysis";
import { anyMixedResultSchema,verifyLoadingTrace } from "./structural-loading";
import { declaredUniformFixture } from "./test-support/m35-fixtures";
import { reviewM34Fixture } from "./test-support/m34ab-fixtures";

const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
const records:unknown[]=[];
async function solve(p:ReturnType<typeof declaredUniformFixture>){
  const prepared=await adaptLoadedMixedProject(p),out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(prepared.request),encoding:"utf8",windowsHide:true,timeout:25000,maxBuffer:4000000,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}}));
  const result=anyMixedResultSchema.parse(out.result);verifyMixedResult(prepared.request,result,prepared.input_sha256);verifyLoadingTrace(prepared.request,result);
  expect(out.execution.memory_limit_bytes).toBe(805306368);expect(out.execution.local_only).toBe(true);
  records.push({input:prepared.request,inputSha256:prepared.input_sha256,mapping:prepared.mapping,result});
  mkdirSync("validation/m35",{recursive:true});writeFileSync("validation/m35/declared-loaded-real.json",JSON.stringify({schema_version:"jpn.m35-numerical-evidence/1",records},null,2));
  return {prepared,result,c:result.combinations.Q1};
}
const close=(actual:number,expected:number)=>expect(actual).toBeCloseTo(expected,10);
it("real mixed stepped cantilever: independent virtual-work deflection, rotation, reactions and trace",async()=>{
  const p=declaredUniformFixture(),before=JSON.stringify(p),{c,prepared}=await solve(p);
  const q=-100,L=2,a=1,E=200e9,I1=1e-6,I2=2e-6;
  close(c.nodes.B2.translation_m[2],q/(8*E)*((L**4-(L-a)**4)/I1+(L-a)**4/I2));
  close(c.nodes.B2.rotation_rad[1],-q/(6*E)*((L**3-(L-a)**3)/I1+(L-a)**3/I2));
  close(c.nodes.B0.reaction_force_n[2],-q*L);close(c.nodes.B0.reaction_moment_nm[1],q*L**2/2);
  expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);expect(prepared.request.member_loads).toHaveLength(2);expect(JSON.stringify(p)).toBe(before);
},25000);
it("simply supported beam: independent midspan deflection, shear, moment and support reactions",async()=>{
  const p=declaredUniformFixture(),d=p.workspace.spatialPreparation!;d.physicalCatalog!.sections[1].iyCm4=100;
  d.supports=[{nodeId:"B0",dofs:["fixed","fixed","fixed","fixed","free","fixed"]},{nodeId:"B2",dofs:["free","fixed","fixed","fixed","free","fixed"]},d.supports[1]];
  const {c}=await solve(p),q=-100,L=2,E=200e9,I=1e-6;
  close(c.nodes.B1.translation_m[2],5*q*L**4/(384*E*I));close(c.nodes.B0.reaction_force_n[2],-q*L/2);close(c.nodes.B2.reaction_force_n[2],-q*L/2);
  close(c.nodes.B0.reaction_moment_nm[1],0);const m=c.members.F1;expect(m.kind).toBe("frame");
  if(m.kind==="frame"&&"stations"in m){const s=m.stations as {my_nm:number;vz_n:number}[];close(s[s.length-1].my_nm,q*L**2/8);close(s[s.length-1].vz_n,0);}
},25000);
it("one original beam segmented at an interior axial junction preserves native intensity and continuity",async()=>{
  const p=declaredUniformFixture(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!;
  g.pieces=g.pieces.filter(v=>v.id!=="F2");g.pieces[0].end="B2";g.pieces[1].start="B1";g.nodes.find(n=>n.id==="A1")!.x=1000;
  d.physicalCatalog!.assignments=d.physicalCatalog!.assignments.filter(v=>v.pieceId!=="F2");d.memberKinds=d.memberKinds!.filter(v=>v.pieceId!=="F2");d.memberConnections=d.memberConnections.filter(v=>v.pieceId!=="F2");d.loading!.uniform=d.loading!.uniform.filter(v=>v.pieceId==="F1");reviewM34Fixture(p);
  const {c,prepared}=await solve(p);expect(prepared.mapping.members.filter(m=>m.originalId==="F1")).toHaveLength(2);
  expect(prepared.request.member_loads).toHaveLength(2);for(const l of prepared.request.member_loads)expect(l.force_per_length_n_m).toEqual([0,0,-100]);
  close(c.nodes.B2.translation_m[2],-100*2**4/(8*200e9*1e-6));close(c.nodes.B0.reaction_force_n[2],200);close(c.nodes.B0.reaction_moment_nm[1],-200);
},25000);
it("L-frame with unequal sections and a loaded axial branch matches independent virtual-work/axial references",async()=>{
  const p=declaredUniformFixture(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  Object.assign(g.nodes.find(n=>n.id==="B1")!,{x:0,y:0,z:1000});Object.assign(g.nodes.find(n=>n.id==="B2")!,{x:1000,y:0,z:1000});
  d.loading!.uniform=d.loading!.uniform.filter(l=>l.pieceId==="F2");d.loads=[{id:crypto.randomUUID(),nodeId:"A1",caseId:"Q",fxKn:0,fyKn:.5,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0}];reviewM34Fixture(p);
  const {c}=await solve(p),q=-100,E=200e9,L=1,H=1,Icolumn=1e-6,Ibeam=2e-6,Acolumn=.001;
  const vertical=q*L**4/(8*E*Ibeam)+q*L**3*H/(2*E*Icolumn)+q*L*H/(E*Acolumn);
  close(c.nodes.B2.translation_m[2],vertical);close(c.nodes.B2.translation_m[0],-q*L**2*H**2/(4*E*Icolumn));
  close(c.nodes.B2.rotation_rad[1],-q*L**2*H/(2*E*Icolumn)-q*L**3/(6*E*Ibeam));
  close(c.nodes.A1.translation_m[1],500/(E*.0004));close(c.nodes.B0.reaction_force_n[1],-500);close(c.nodes.B0.reaction_force_n[2],100);close(c.nodes.B0.reaction_moment_nm[1],-50);
  expect(c.members.AX1.kind).toBe("axial");if(c.members.AX1.kind==="axial")close(c.members.AX1.axial_n,500);
},25000);
it("inclined members and global vectors transform consistently with the independent physical rotation",async()=>{
  const p=declaredUniformFixture(),original=await solve(p),r=Math.SQRT1_2;
  for(const n of p.workspace.physicalStructure!.nodes){const x=n.x,z=n.z;n.x=r*x+r*z;n.z=-r*x+r*z;}
  for(const l of p.workspace.spatialPreparation!.loading!.uniform)l.knM=[-.1*r,0,-.1*r];reviewM34Fixture(p);
  const {c}=await solve(p);close(c.nodes.B2.translation_m[0],r*original.c.nodes.B2.translation_m[2]);close(c.nodes.B2.translation_m[2],r*original.c.nodes.B2.translation_m[2]);close(c.nodes.B0.reaction_force_n[0],r*200);close(c.nodes.B0.reaction_force_n[2],r*200);
},25000);
it("local/global UDL with physical roll and unequal inertias gives the same response",async()=>{
  const p=declaredUniformFixture(),d=p.workspace.spatialPreparation!;for(const a of d.physicalCatalog!.assignments)if(a.pieceId!=="AX1")a.rotationDeg=90;
  for(const s of d.physicalCatalog!.sections)if(s.izCm4!==null)s.izCm4=s.iyCm4!*2;reviewM34Fixture(p);
  const a=await solve(p);for(const l of d.loading!.uniform){l.coordinates="local";l.knM=[0,-.1,0];}
  const b=await solve(p);for(let i=0;i<3;i++)close(a.c.nodes.B2.translation_m[i],b.c.nodes.B2.translation_m[i]);
  close(a.c.nodes.B2.translation_m[2],-100/(8*200e9)*(15/2e-6+1/4e-6));
},25000);
it("combinations superpose native distributed actions; changing direction, intensity or original bar changes hash",async()=>{
  const p=declaredUniformFixture(),first=await solve(p),d=p.workspace.spatialPreparation!;
  d.combinations=[{id:"Q1",factors:{Q:2}},{id:"REVERSE",factors:{Q:-1}}];const second=await solve(p);
  close(second.c.nodes.B2.translation_m[2],2*first.c.nodes.B2.translation_m[2]);close(second.result.combinations.REVERSE.nodes.B2.translation_m[2],-first.c.nodes.B2.translation_m[2]);
  const prior=await adaptLoadedMixedProject(p);
  for(const change of [()=>{d.loading!.uniform[0].knM=[0,0,-.2];},()=>{d.loading!.uniform[0].coordinates="local";},()=>{d.loading!.uniform[0].pieceId="F2";}]){change();expect((await adaptLoadedMixedProject(p)).input_sha256).not.toBe(prior.input_sha256);}
},25000);
it("axial UDL, absent bars, missing supports, unstable mechanisms and silent v1 dropping are refused",async()=>{
  const p=declaredUniformFixture(),d=p.workspace.spatialPreparation!;
  await expect(adaptMixedProject(p)).rejects.toThrow(/DISTRIBUTED_LOADED_REQUIRED/);
  d.loading!.uniform[0].pieceId="AX1";await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/UNIFORM_AXIAL_UNSUPPORTED/);
  d.loading!.uniform[0].pieceId="MISSING";await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/inexistente/);
  const valid=declaredUniformFixture();valid.workspace.spatialPreparation!.supports=[];await expect(adaptLoadedMixedProject(valid)).rejects.toThrow(/SUPPORTS/);
  const prepared=await adaptLoadedMixedProject(declaredUniformFixture());prepared.request.supports=prepared.request.supports.filter(s=>s.node!=="B0");
  const out=spawnSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(prepared.request),encoding:"utf8",windowsHide:true,timeout:25000,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}});
  expect(out.status).not.toBe(0);expect(JSON.parse(out.stdout).error.code).toMatch(/UNSTABLE|MECHANISM/);
  expect(await mixedInputHash(prepared.request)).not.toBe(prepared.input_sha256);
},25000);
it("explicit self weight follows each declared physical area/density; no default density or axial flexure",async()=>{
  const p=declaredUniformFixture(),d=p.workspace.spatialPreparation!;d.cases.push({id:"SW",source:"Synthetic independent density/gravity check"});
  d.combinations=[{id:"Q1",factors:{Q:0,SW:1}}];d.loading!.selfWeight={caseId:"SW",gravity:[0,0,-10],axialLumping:"half-to-end-nodes"};
  for(const m of d.physicalCatalog!.materials)m.density={kgM3:1000,source:"Synthetic density, never default steel",revision:"1"};
  const {c,result}=await solve(p);expect(result.schema_version).toBe("jpn.mixed3d-result/2");
  if(result.schema_version==="jpn.mixed3d-result/2"){close(result.loading.self_weight!.total_mass_kg,3.4);expect(result.loading.self_weight!.members.find(m=>m.member==="AX1")!.representation).toBe("half-to-end-nodes");}
  close(Object.values(c.nodes).reduce((s,n)=>s+n.reaction_force_n[2],0),34);expect("stations"in c.members.AX1).toBe(false);
  delete d.physicalCatalog!.materials[0].density;await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/densidade/);
},25000);
