import { afterAll,afterEach,beforeEach,expect,it,vi } from "vitest";
import { readFileSync,writeFileSync } from "node:fs";
import * as generator from "./calculations/structure";
import { structureSignature,captureRevision } from "./calculations/project-basis";
import { adaptMixedProject } from "./mixed-adapter";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { projectSchema,emptySnapshot,migrateSnapshot } from "./models";
import { parseBackup,serializeBackup,LocalRepositories,type StorageAdapter } from "@/infrastructure/persistence/local";
import { resolvePhysicalStructure } from "./physical-structure";
import { generatedRoofRegions,distributeRoofActions } from "./roof-load-path";
import { distributeWindActions } from "./wind-load-path";
import { emptyLoading } from "./structural-loading";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { verifyMixedResult } from "./mixed-analysis";
import { buildResistanceReport } from "./resistance-report";
import { m34abProject,reviewM34Fixture } from "./test-support/m34ab-fixtures";
import { resolveMemberPhysical } from "./member-physical";
import { adaptSpatialProject } from "./geometric-physical-adapter";
import { trussGeometry } from "./analysis";

const oracle=JSON.parse(readFileSync("validation/m34ab/analytic-reference.json","utf8"));
const records:unknown[]=[];
beforeEach(()=>{vi.spyOn(generator,"generateStructure").mockImplementation(()=>{throw Error("FORBIDDEN_GENERATOR_CALL: declared structure must be independent");});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function enabled(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}
const near=(actual:number,expected:number,absolute:number)=>{
  expect(Math.abs(actual-expected)).toBeLessThanOrEqual(absolute+oracle.tolerance.relative*Math.abs(expected));
  return {expected,calculated:actual,absoluteDifference:Math.abs(actual-expected),relativeDifference:expected===0?null:Math.abs((actual-expected)/expected)};
};
it("persists independent mm geometry, explicit supports and distinct references for two columns",async()=>{
  const p=m34abProject(),a=await adaptMixedProject(p),g=p.workspace.physicalStructure!;
  expect(p.planning).toBeNull();expect(p.roof.widthM).toBeNull();expect(resolvePhysicalStructure(p).source).toBe("declared");
  expect(a.request.nodes).toEqual(g.nodes.map(n=>({id:n.id,x_m:n.x/1000,y_m:n.y/1000,z_m:n.z/1000})));
  expect(a.request.members.map(m=>[m.id,m.start,m.end])).toEqual(g.pieces.map(p=>[p.id,p.start,p.end]));
  expect(a.request.supports).toEqual([{node:"B0",restrained:[true,true,true,true,true,true]},{node:"A1",restrained:[true,false,true,false,false,false]}]);
  const frames=a.request.members.filter(m=>m.kind==="frame");expect(frames.map(m=>m.section)).toEqual(["SEC-REF-S1","SEC-REF-S2"]);
  expect(a.request.materials).toHaveLength(1);expect(a.request.sections).toHaveLength(2);
  expect(a.request.members.find(m=>m.id==="AX1")).toMatchObject({kind:"axial",e_pa:200e9,area_m2:.0004});
  expect(JSON.stringify(a.request)).not.toContain("MAT-column");expect(a.approved_for_fabrication).toBe(false);
  expect(generator.generateStructure).not.toHaveBeenCalled();
});

it("real mixed3d: stepped cantilever and axial closed forms, changed physical section, stale-result rejection and release gate",async()=>{
  enabled();const p=m34abProject(),first=await adaptMixedProject(p);
  let baselineResult:Parameters<typeof verifyMixedResult>[1]|undefined;
  for(const changed of [false,true]){
    if(changed){const s=p.workspace.spatialPreparation!.physicalCatalog!.sections[0];s.areaCm2=20;s.iyCm4=200;s.sectionRevision="2";s.sectionSource="Independent mathematical variant: A=0.002m2, Iy=2e-6m4; Iz and J explicitly retained";}
    const a=await adaptMixedProject(p),out=await runLocalMixed(JSON.stringify(a.request));
    if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/1")throw Error("Native mixed3d did not complete");
    const c=out.result.combinations.Q1,expected=changed?oracle.changedFirstSection:oracle.baseline;
    const comparison={tipX:near(c.nodes.B2.translation_m[0],expected.tip_x_m,1e-12),tipZ:near(c.nodes.B2.translation_m[2],expected.tip_z_m,1e-12),tipRY:near(c.nodes.B2.rotation_rad[1],expected.tip_ry_rad,1e-12),axialY:near(c.nodes.A1.translation_m[1],expected.axial_y_m,1e-12),
      reactions:c.nodes.B0.reaction_force_n.map((v,i)=>near(v,expected.reaction_force_n[i],1e-6)),moments:c.nodes.B0.reaction_moment_nm.map((v,i)=>near(v,expected.reaction_moment_nm[i],1e-6))};
    expect(c.members.AX1.kind).toBe("axial");if(c.members.AX1.kind==="axial")near(c.members.AX1.axial_n,500,1e-6);
    for(const id of ["F1","F2"]){const member=c.members[id];expect(member.kind).toBe("frame");if(member.kind==="frame"){
      near(Math.abs(member.end_actions_local[0]),1000,1e-6);near(Math.abs(member.end_actions_local[2]),1000,1e-6);
      // Determinate moment diagram P*(2-x), independent of the section change.
      near(Math.abs(member.end_actions_local[4]),id==="F1"?2000:1000,1e-6);near(Math.abs(member.end_actions_local[10]),id==="F1"?1000:0,1e-6);
    }}
    expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
    const report=await buildResistanceReport(p,a,out.result);expect(report.releaseGate.status).toBe("NOT_READY_BLOCKED");expect(report.releaseGate.computedStructuralApproval).toBe(false);expect(report.releaseGate.fabricationRelease).toBe(false);
    records.push({changedFirstSection:changed,inputSha256:a.input_sha256,comparison,equilibriumResidual:c.equilibrium.relative_residual,computedStructuralApproval:false,fabricationRelease:false});
    if(changed){expect(a.input_sha256).not.toBe(first.input_sha256);expect(()=>verifyMixedResult(a.request,baselineResult!,a.input_sha256)).toThrow(/hash|revisão/);}
    else {baselineResult=out.result;p.workspace.spatialPreparation!.physicalCatalog!.sections[0].areaCm2=11;await expect(buildResistanceReport(p,a,out.result)).rejects.toThrow(/STALE/);p.workspace.spatialPreparation!.physicalCatalog!.sections[0].areaCm2=10;}
  }
  expect(generator.generateStructure).not.toHaveBeenCalled();
},20000);

it("rejects an actual transverse mechanism in the native solver without adding supports",async()=>{
  enabled();const p=m34abProject();p.workspace.spatialPreparation!.supports[1].dofs[0]="free";
  const a=await adaptMixedProject(p);await expect(runLocalMixed(JSON.stringify(a.request))).rejects.toThrow(/instab|singular|mecani|rigidez|DOF/i);
},20000);

it("preserves per-member material/section and endpoint releases after explicit interior-joint segmentation",async()=>{
  const p=m34abProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  g.nodes.push({id:"MID",x:500,y:0,z:0},{id:"TIP",x:500,y:500,z:1000});g.pieces.push({id:"AX2",role:"web",start:"MID",end:"TIP"});
  d.physicalCatalog!.assignments.push({pieceId:"AX2",materialId:"AXIAL",sectionId:"SAX",rotationDeg:null});d.memberKinds!.push({pieceId:"AX2",kind:"axial"});d.memberConnections.push({pieceId:"AX2",start:"axial",end:"axial"});
  d.memberConnections[0].end="pinned";reviewM34Fixture(p);
  const a=await adaptMixedProject(p),segments=a.request.members.filter(m=>m.id.startsWith("F1:")).filter(m=>m.kind==="frame");
  expect(segments.map(m=>m.id)).toEqual(["F1:S1","F1:S2"]);
  for(const m of segments)expect(m).toMatchObject({material:"MAT-REF-STEEL",section:"SEC-REF-S1",rotation_deg:0});
  expect(segments[0].release_end).toEqual([false,false,false,false,false,false]);expect(segments[1].release_end).toEqual([false,false,false,true,true,true]);
});

it("explicit assignment precedes group inheritance; missing inherited data blocks",async()=>{
  const p=m34abProject(),d=p.workspace.spatialPreparation!,cat=d.physicalCatalog!;
  d.groups.column=resolveMemberPhysical(resolvePhysicalStructure(p).model!.pieces[1],d).properties;
  cat.assignments=cat.assignments.filter(a=>a.pieceId!=="F2");reviewM34Fixture(p);
  const a=await adaptMixedProject(p);expect(a.request.members.find(m=>m.id==="F1")).toHaveProperty("section","SEC-REF-S1");expect(a.request.members.find(m=>m.id==="F2")).toHaveProperty("section","SEC-column");
  d.groups.column.areaCm2=null;await expect(adaptMixedProject(p)).rejects.toThrow(/PROPERTIES/);
});

it("geometry and assignment changes invalidate signatures; section/material changes invalidate input hashes; presentation does not",async()=>{
  const p=m34abProject(),a=await adaptMixedProject(p),s=structureSignature(p);
  p.name+=" presentation";p.technicalNotes+=" display only";p.roof.profileDescription="unused display roof";
  p.workspace.physicalStructure!.pieces[0].role="purlin";
  expect(structureSignature(p)).toBe(s);expect((await adaptMixedProject(p)).input_sha256).toBe(a.input_sha256);
  const d=p.workspace.spatialPreparation!,cat=d.physicalCatalog!;cat.materials[0].eGpa=100;cat.materials[0].gGpa=100/2.6;
  expect((await adaptMixedProject(p)).input_sha256).not.toBe(a.input_sha256);
  cat.assignments[0].sectionId="S2";expect(structureSignature(p)).not.toBe(s);await expect(adaptMixedProject(p)).rejects.toThrow(/STALE_GEOMETRY/);
  reviewM34Fixture(p);p.workspace.physicalStructure!.nodes[2].x=2100;await expect(adaptMixedProject(p)).rejects.toThrow(/STALE_GEOMETRY/);
});

it("roundtrips declared geometry, catalog and independent revision snapshots without a persisted version change",()=>{
  const p=m34abProject(),saved=captureRevision(p,"M34 before change","Verification"),snapshot={...emptySnapshot(),projects:[saved]};
  const restored=parseBackup(serializeBackup(snapshot)).data;expect(restored.version).toBe(4);expect(restored.projects[0]).toEqual(saved);
  saved.workspace.spatialPreparation!.physicalCatalog!.sections[0].areaCm2=99;
  expect(saved.revisions[0].workspace.spatialPreparation!.physicalCatalog!.sections[0].areaCm2).toBe(10);
  const revision=saved.revisions[0],again=projectSchema.parse({...saved,roof:revision.roof,planning:revision.planning,workspace:revision.workspace});
  expect(again.workspace.physicalStructure).toEqual(p.workspace.physicalStructure);expect(migrateSnapshot({...restored,version:3}).version).toBe(4);
});

it("persists and restores the declared physical model through the existing repository, without losing local reference IDs",async()=>{
  const p=m34abProject(),values=new Map<string,string>();
  const storage:StorageAdapter={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}};
  const repo=new LocalRepositories(storage);repo.load();repo.importBackup(parseBackup(serializeBackup({...emptySnapshot(),projects:[p]})));
  const reloaded=new LocalRepositories(storage).load().projects[0];expect(reloaded.workspace).toEqual(p.workspace);
  const a=await adaptMixedProject(reloaded);expect(a.request.members.filter(m=>m.kind==="frame").map(m=>m.section)).toEqual(["SEC-REF-S1","SEC-REF-S2"]);
});

it("blocks legacy frame/truss entry points that would ignore individual properties",async()=>{
  const p=m34abProject();await expect(adaptSpatialProject(p)).rejects.toThrow(/MIXED_REQUIRED/);expect(()=>trussGeometry(p)).toThrow(/MIXED_REQUIRED/);
  expect(generator.generateStructure).not.toHaveBeenCalled();
});

it.each(["duplicate-node","duplicate-member","missing-node","zero-length","orphan","coincident","overlap","crossing","section","material","material-trace","isotropy","frame-property","support","no-support","connection","orphan-assignment","duplicate-assignment","connectivity","cases","combinations"])("rejects adversarial declared model: %s",async kind=>{
  const p=m34abProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!,cat=d.physicalCatalog!;
  if(kind==="duplicate-node")g.nodes.push({...g.nodes[0]});
  if(kind==="duplicate-member")g.pieces.push({...g.pieces[0]});
  if(kind==="missing-node")g.pieces[0].end="MISSING";
  if(kind==="zero-length")g.pieces[0].end=g.pieces[0].start;
  if(kind==="orphan")g.nodes.push({id:"ORPHAN",x:9,y:9,z:9});
  if(kind==="coincident")Object.assign(g.nodes[2],{x:1000,y:0,z:0});
  if(kind==="overlap")g.pieces[1].start="B0";
  if(kind==="crossing"){g.nodes.push({id:"X",x:500,y:-100,z:0},{id:"Y",x:500,y:100,z:0});g.pieces.push({id:"CROSS",start:"X",end:"Y",role:"web"});}
  if(kind==="section")cat.assignments[0].sectionId="MISSING";
  if(kind==="material")cat.assignments[0].materialId="MISSING";
  if(kind==="material-trace")cat.materials[0].materialSource="";
  if(kind==="isotropy")cat.materials[0].gGpa=1;
  if(kind==="frame-property")cat.sections[0].jCm4=null;
  if(kind==="support")d.supports[0].dofs[0]="pending";
  if(kind==="no-support")d.supports=[];
  if(kind==="connection")d.memberConnections[0].start="axial";
  if(kind==="orphan-assignment")cat.assignments.push({...cat.assignments[0],pieceId:"MISSING"});
  if(kind==="duplicate-assignment")cat.assignments.push({...cat.assignments[0]});
  if(kind==="connectivity")d.connectivity!.junctions=[];
  if(kind==="cases")d.cases=Array.from({length:11},(_,i)=>({id:`Q${i}`,source:"Explicit test"}));
  if(kind==="combinations")d.combinations=Array.from({length:11},(_,i)=>({id:`C${i}`,factors:{Q:1}}));
  // Explicitly rebind edited geometry so geometric adversaries reach connectivity validation.
  d.geometrySignature=structureSignature(p);d.connectivity!.geometrySignature=d.geometrySignature;
  await expect(adaptMixedProject(p)).rejects.toThrow();expect(generator.generateStructure).not.toHaveBeenCalled();
});

it.each(["wind","roof","distribution"])("blocks unsupported declared loading before any generator call: %s",async kind=>{
  const p=m34abProject(),l=emptyLoading();p.workspace.spatialPreparation!.loading=l;
  if(kind==="wind")(l as unknown as {wind:object}).wind={};
  if(kind==="roof")l.roofArea.push({caseId:"Q",knM2:1,projection:"horizontal",direction:[0,0,-1],source:"Explicit test",revision:"1",loadPath:"Declared test"});
  if(kind==="distribution")l.roofDistribution={version:1,method:"parallel-purlin-strips",geometrySignature:structureSignature(p)};
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);
  await expect(adaptMixedProject(p)).rejects.toThrow();
  expect(()=>generatedRoofRegions(p)).toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);
  expect(()=>distributeWindActions(p,{})).toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);expect(()=>distributeRoofActions(p,[],{})).toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);
  expect(generator.generateStructure).not.toHaveBeenCalled();
});

afterAll(()=>{if(records.length)writeFileSync("validation/m34ab/analytic-results.json",JSON.stringify({schema_version:"jpn.m34ab-results/1",tolerance:oracle.tolerance,records},null,2)+"\n");});
