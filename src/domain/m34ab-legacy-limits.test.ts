import { afterEach,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { structureSignature } from "./calculations/project-basis";
import { adaptMixedProject } from "./mixed-adapter";
import { mixedReferenceProject } from "./examples/mixed-project";
import { parseBackup,serializeBackup,LocalRepositories,type StorageAdapter } from "@/infrastructure/persistence/local";
import { migrateSnapshot } from "./models";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { m34abProject,reviewM34Fixture } from "./test-support/m34ab-fixtures";
import { resolvePhysicalStructure } from "./physical-structure";
import { CONNECTIVITY_LIMITS } from "./spatial-connectivity";
import { resolveMemberPhysical } from "./member-physical";

afterEach(()=>vi.unstubAllEnvs());
const frozen=JSON.parse(readFileSync("validation/m34ab/legacy-golden.json","utf8"));
const backupText=readFileSync("validation/m34ab/legacy-backup.json","utf8");
it("keeps exact base signature/hash/full request and numerical legacy outputs captured BEFORE implementation",async()=>{
  const p=parseBackup(backupText).data.projects[0],a=await adaptMixedProject(p);
  expect(structureSignature(p)).toBe(frozen.structureSignature);expect(a.input_sha256).toBe(frozen.inputSha256);expect(a.request).toEqual(frozen.request);
  expect(resolvePhysicalStructure(p).source).toBe("generated");
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const out=await runLocalMixed(JSON.stringify(a.request));if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/1")throw Error("Legacy native solver did not complete");
  expect(out.result.input_sha256).toBe(frozen.result.input_sha256);
  for(const [id,c] of Object.entries(out.result.combinations)){
    const expected=frozen.result.combinations[id];
    for(const [node,n] of Object.entries(c.nodes))for(const key of ["translation_m","rotation_rad","reaction_force_n","reaction_moment_nm"] as const)n[key].forEach((v,i)=>expect(v).toBeCloseTo(expected.nodes[node][key][i],key.endsWith("_m")||key.endsWith("_rad")?10:6));
    for(const [member,m] of Object.entries(c.members)){
      const e=expected.members[member];expect(m.kind).toBe(e.kind);
      if(m.kind==="frame")m.end_actions_local.forEach((v,i)=>expect(v).toBeCloseTo(e.end_actions_local[i],6));
      else {expect(m.axial_n).toBeCloseTo(e.axial_n,6);expect(m.extension_m).toBeCloseTo(e.extension_m,10);}
    }
  }
},20000);

it("restores base backups and v3 snapshots without adding new keys, defaults, or changing the v4 stored version",()=>{
  const base=JSON.parse(backupText),parsed=parseBackup(backupText);
  expect(parsed).toEqual(base);expect(JSON.parse(serializeBackup(parsed.data)).data).toEqual(base.data);
  expect(migrateSnapshot({...base.data,version:3})).toEqual(base.data);
  const values=new Map<string,string>(),storage:StorageAdapter={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}};
  const repository=new LocalRepositories(storage);repository.load();repository.importBackup(parsed);
  const restored=new LocalRepositories(storage).load();expect(restored.version).toBe(4);
  expect(restored.projects[0].workspace).toEqual(base.data.projects[0].workspace);
  expect(restored.projects[0].workspace).not.toHaveProperty("physicalStructure");expect(restored.projects[0].workspace.spatialPreparation).not.toHaveProperty("physicalCatalog");
});

it("supports individual physical references on generated pieces without requiring their now-unused group properties",async()=>{
  const p=mixedReferenceProject(),d=p.workspace.spatialPreparation!,columns=resolvePhysicalStructure(p).model!.pieces.filter(p=>p.role==="column"),from=m34abProject().workspace.spatialPreparation!.physicalCatalog!;
  d.physicalCatalog={...structuredClone(from),assignments:columns.map((p,i)=>({pieceId:p.id,materialId:"STEEL",sectionId:i%2?"S1":"S2",rotationDeg:0}))};
  d.groups.column.eGpa=null;d.groups.column.areaCm2=null;d.groups.column.jCm4=null;
  const a=await adaptMixedProject(p);expect(a.request.sections.some(s=>s.id==="SEC-column")).toBe(false);
  for(const piece of columns)expect(a.request.members.find(m=>m.id===piece.id)).toHaveProperty("material","MAT-REF-STEEL");
});

it.each(["connectivity-nodes","connectivity-members","solver-nodes","solver-segments"])("retains resource limits and rejects oversized declared model: %s",async kind=>{
  const p=m34abProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  expect(CONNECTIVITY_LIMITS).toEqual({nodes:250,members:600});
  if(kind==="connectivity-nodes")g.nodes=Array.from({length:251},(_,i)=>({id:`N${i}`,x:i,y:0,z:0}));
  if(kind==="connectivity-members")g.pieces=Array.from({length:601},(_,i)=>({id:`P${i}`,role:"web",start:"B0",end:"B1"}));
  if(kind.startsWith("connectivity")){await expect(adaptMixedProject(p)).rejects.toThrow(/250|600/);return;}
  const count=kind==="solver-nodes"?151:44;
  g.nodes=Array.from({length:count},(_,i)=>({id:`N${i}`,x:i*10,y:i*i,z:kind==="solver-nodes"?0:i*i*i}));
  g.pieces=[];
  if(kind==="solver-nodes")for(let i=0;i<count-1;i++)g.pieces.push({id:`P${i}`,role:"web",start:`N${i}`,end:`N${i+1}`});
  else for(let i=0;i<count&&g.pieces.length<321;i++)for(let j=i+1;j<count&&g.pieces.length<321;j++)g.pieces.push({id:`P${g.pieces.length}`,role:"web",start:`N${i}`,end:`N${j}`});
  d.physicalCatalog!.assignments=g.pieces.map(p=>({pieceId:p.id,materialId:"STEEL",sectionId:"S1",rotationDeg:0}));
  d.memberKinds=g.pieces.map((p,i)=>({pieceId:p.id,kind:i===0?"frame":"axial"}));
  d.memberConnections=g.pieces.map((p,i)=>({pieceId:p.id,start:i===0?"rigid":"axial",end:i===0?"rigid":"axial"}));
  d.supports=[{nodeId:"N0",dofs:["fixed","fixed","fixed","fixed","fixed","fixed"]}];
  d.loads=d.loads.slice(0,1).map(l=>({...l,nodeId:`N${count-1}`}));reviewM34Fixture(p);
  await expect(adaptMixedProject(p)).rejects.toThrow(/150 nós ou 320 segmentos/);
});

it("does not substitute visual roof dimensions or profiles for physical properties",async()=>{
  const p=m34abProject(),d=p.workspace.spatialPreparation!,piece=resolvePhysicalStructure(p).model!.pieces[0];
  const physical=resolveMemberPhysical(piece,d).properties;
  p.roof.widthM=20;p.roof.profileDescription="a visually large section is not stiffness";
  expect(resolveMemberPhysical(piece,d).properties).toEqual(physical);
  d.physicalCatalog!.sections[0].areaCm2=null;await expect(adaptMixedProject(p)).rejects.toThrow(/PROPERTIES/);
});
