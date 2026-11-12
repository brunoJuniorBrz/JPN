import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {m49GarageProject,refreshM49Garage} from "./test-support/m49-garage-project";
import {garageClosedForm} from "../../validation/m49/analytical-reference";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {mixedPreparationReview} from "./mixed-adapter";
import {adaptSpatialProject} from "./geometric-physical-adapter";
import {mixedReferenceProject} from "./examples/mixed-project";
import {newSpatialPreparation} from "./spatial-preparation";
import {projectSchema} from "./models";
import {runLocalMixed,localMixedLimits} from "@/infrastructure/analysis/local-mixed-runner";
import {toGlobal} from "./member-end-actions";
import {buildConnectionReport} from "./connection-report";
import {buildResistanceReport} from "./resistance-report";
import {verifyMixedResult} from "./mixed-analysis";

async function solve(p=m49GarageProject()){
  const prepared=await adaptLoadedMixedProject(p);
  const output=await runLocalMixed(JSON.stringify(prepared.request),"connections");
  if(output.status!=="completed"||output.result.schema_version!=="jpn.mixed3d-result/2"||!output.joint_actions)
    throw Error("M49 requires real capped Python analysis and actual joint actions");
  return {project:p,prepared,result:output.result,trace:output.joint_actions};
}
let baseline:Awaited<ReturnType<typeof solve>>;
beforeAll(async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  baseline=await solve();
},25000);
afterAll(()=>vi.unstubAllEnvs());

it("declares real beams without trusses/columns or invented supports and keeps beam cuts continuous",()=>{
  const {project:p,prepared:a}=baseline;
  expect(p.planning).toBeNull();
  expect(p.workspace.physicalStructure!.pieces.map(m=>m.role)).toEqual(["beam","beam","purlin","purlin","purlin"]);
  expect(a.request.nodes).toHaveLength(6);expect(a.request.members).toHaveLength(7);
  expect(a.request.supports.map(s=>s.node)).toEqual(["A0","A4","B0","B4"]);
  expect(a.request.nodal_loads).toEqual([]);expect(a.request.member_loads).toHaveLength(6);
  expect(a.request.member_loads.every(l=>["PA","PC","PB"].includes(l.member))).toBe(true);
  for(const s of a.mapping.members){
    const m=a.request.members.find(m=>m.id===s.id)!;
    if(m.kind!=="frame")throw Error("Every garage member must have flexural stiffness");
    expect(m.release_start).toEqual([false,false,false,false,s.originalStart,s.originalStart]);
    expect(m.release_end).toEqual([false,false,false,false,s.originalEnd,s.originalEnd]);
  }
  expect(localMixedLimits).toMatchObject({milliseconds:20000,memoryBytes:805306368,concurrency:1});
});

for(const [id,pressure] of [["G_ONLY",600],["W_ONLY",-900],["NET",-300],["ULS_G",600],["ULS_W",-900],["ULS_NET",-300]] as const)
  it(`${id}: independently matches sheet->purlin->flexible beam->support forces, moments and ABSOLUTE deflections`,()=>{
    const {prepared:a,result,trace}=baseline,c=result.combinations[id],r=garageClosedForm(pressure);
    for(const nodeId of ["A0","A4","B0","B4"]){
      expect(c.nodes[nodeId].reaction_force_n[2]).toBeCloseTo(r.cornerReactionN,6);
      expect(c.nodes[nodeId].reaction_moment_nm.every(m=>Math.abs(m)<1e-7)).toBe(true);
    }
    for(const nodeId of ["C0","C4"]){
      expect(c.nodes[nodeId].translation_m[2]).toBeCloseTo(r.beamMidspanM,10);
      expect(c.nodes[nodeId].reaction_force_n.every(f=>Math.abs(f)<1e-7)).toBe(true);
    }
    const pc=c.members.PC;if(pc.kind!=="frame")throw Error("PC must be a physical frame");
    const station=pc.stations[2];
    expect(toGlobal(trace.members.PC.global_to_local,station.translation_local_m!)[2]).toBeCloseTo(r.purlinAbsoluteMidspanM,10);
    expect(Math.hypot(station.my_nm,station.mz_nm)).toBeCloseTo(Math.abs(r.purlinMomentNm),6);
    expect(Math.hypot(...pc.end_actions_local.slice(1,3))).toBeCloseTo(Math.abs(r.purlinShearN),6);
    for(const end of [0,6])expect(Math.hypot(...pc.end_actions_local.slice(end+3,end+6))).toBeLessThan(1e-7);
    for(const id of ["PA","PB"]){
      const m=c.members[id];if(m.kind!=="frame")throw Error("Edge purlin must be a frame");
      expect(toGlobal(trace.members[id].global_to_local,m.stations[2].translation_local_m!)[2]).toBeCloseTo(r.edgeMidspanM,10);
    }
    for(const piece of ["V0","V4"]){
      const segments=a.mapping.members.filter(m=>m.originalId===piece);
      expect(segments).toHaveLength(2);
      for(const s of segments){const m=c.members[s.id];if(m.kind!=="frame")throw Error("Beam must be a frame");
        const middle=m.stations[s.originalStart?4:0];
        expect(Math.hypot(middle.my_nm,middle.mz_nm)).toBeCloseTo(Math.abs(r.beamMomentNm),6);
        expect(Math.hypot(middle.vy_n,middle.vz_n)).toBeCloseTo(Math.abs(r.beamShearN),6);
      }
    }
    expect(Object.values(c.nodes).reduce((sum,n)=>sum+n.reaction_force_n[2],0)).toBeCloseTo(r.totalDownwardN,6);
    expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
  });

it("traces the central purlin reaction into both beam segments without treating their junction as a ground support",async()=>{
  const {project:p,prepared:a,result,trace}=baseline;
  const joints=await buildConnectionReport(p,a,result,trace);
  for(const combo of joints.combinations){
    const pressure=combo.combinationId.includes("NET")?-300:combo.combinationId.includes("W")?-900:600;
    const r=garageClosedForm(pressure);
    for(const nodeId of ["C0","C4"]){
      const joint=combo.joints.find(n=>n.nodeId===nodeId)!;
      expect(joint.support).toBeNull();expect(joint.ends).toHaveLength(3);
      expect(joint.ends.find(m=>m.pieceId==="PC")!.memberOnNodeGlobal.forceN[2]).toBeCloseTo(-r.beamPointLoad,6);
      for(const end of joint.ends.filter(e=>e.role==="beam"))expect(end.memberOnNodeGlobal.forceN[2]).toBeCloseTo(r.beamPointLoad/2,6);
      expect(joint.balance.withinTolerance).toBe(true);
    }
    expect(combo.globalBalance.withinTolerance).toBe(true);
  }
  const report=await buildResistanceReport(p,a,result);
  expect(report.supportAudits).toHaveLength(24);
  expect(report.supportAudits.every(s=>s.kind==="existing-concrete"&&s.status==="capacity-pending"&&s.normativeApproval===false)).toBe(true);
  const roof=report.physicalRoofReactionAudit!;
  expect(roof.computedStructuralApproval).toBe(false);expect(roof.fabricationRelease).toBe(false);
  expect(roof.releaseGate).toBe("NOT_READY_BLOCKED");expect(report.releaseGate.status).toBe("NOT_READY_BLOCKED");
  expect(report.approvedForFabrication).toBe(false);
  expect(a.engineering_combination_coverage!.allCasesCoveredForULSAndSLS).toBe(true);
  expect(a.engineering_combination_coverage!.normativeFactorsVerified).toBe(false);
  mkdirSync(".tools/m49-runtime",{recursive:true});
  writeFileSync(".tools/m49-runtime/garage.json",JSON.stringify({project:p,prepared:a,result,trace,manual:[600,-900,-300].map(v=>garageClosedForm(v)),joints,report},null,2));
});

it("doubling only beam stiffness halves support settlement, retains purlin curvature and changes the result hash",async()=>{
  const p=m49GarageProject();p.workspace.spatialPreparation!.physicalCatalog!.sections[0].iyCm4=8000;
  refreshM49Garage(p);
  const changed=await solve(p),r=garageClosedForm(600,8e-5);
  const m=changed.result.combinations.G_ONLY.members.PC;if(m.kind!=="frame")throw Error("PC must be a frame");
  expect(changed.result.combinations.G_ONLY.nodes.C0.translation_m[2]).toBeCloseTo(r.beamMidspanM,10);
  expect(toGlobal(changed.trace.members.PC.global_to_local,m.stations[2].translation_local_m!)[2]).toBeCloseTo(r.purlinAbsoluteMidspanM,10);
  expect(changed.prepared.input_sha256).not.toBe(baseline.prepared.input_sha256);
  expect(()=>verifyMixedResult(changed.prepared.request,baseline.result,changed.prepared.input_sha256)).toThrow(/hash|revisão/);
},25000);

it("reversing original member endpoints preserves physical deflections/reactions and retains hinge positions",async()=>{
  const p=m49GarageProject();for(const m of p.workspace.physicalStructure!.pieces)[m.start,m.end]=[m.end,m.start];
  refreshM49Garage(p);const changed=await solve(p);
  for(const combo of Object.keys(baseline.result.combinations))for(const node of Object.keys(baseline.result.combinations[combo].nodes)){
    const a=baseline.result.combinations[combo].nodes[node],b=changed.result.combinations[combo].nodes[node];
    a.translation_m.forEach((v,i)=>expect(b.translation_m[i]).toBeCloseTo(v,10));
    a.reaction_force_n.forEach((v,i)=>expect(b.reaction_force_n[i]).toBeCloseTo(v,6));
  }
},25000);

it("refuses an unrestrained rotational mechanism instead of silently adding restraints to the existing building",async()=>{
  const p=m49GarageProject();
  for(const s of p.workspace.spatialPreparation!.supports)s.dofs[5]="free";
  for(const s of p.workspace.spatialPreparation!.supportInterfaces!)s.dofs[5]="free";
  refreshM49Garage(p);
  const prepared=await adaptLoadedMixedProject(p);
  await expect(runLocalMixed(JSON.stringify(prepared.request))).rejects.toMatchObject({code:"UNSTABLE"});
},25000);

it("refuses missing properties/supports, stale roof declarations and double spherical hinges without manufacturing data",async()=>{
  const p=m49GarageProject(),d=p.workspace.spatialPreparation!;
  delete d.physicalCatalog;
  expect(mixedPreparationReview(p,d,true).issues.some(i=>i.code==="PROPERTIES")).toBe(true);
  expect(newSpatialPreparation(p).groups.beam).toBeUndefined();
  const unsupported=m49GarageProject();unsupported.workspace.spatialPreparation!.memberConnections[0]={pieceId:"V0",start:"pinned",end:"pinned"};
  refreshM49Garage(unsupported);await expect(adaptLoadedMixedProject(unsupported)).rejects.toThrow(/UNSUPPORTED_RELEASE/);
  const missing=m49GarageProject();missing.workspace.spatialPreparation!.supports=[];refreshM49Garage(missing);
  await expect(adaptLoadedMixedProject(missing)).rejects.toThrow(/SUPPORTS/);
  const stale=m49GarageProject();stale.workspace.spatialPreparation!.physicalRoofFaces!.faces[0].revision="Changed survey";
  await expect(adaptLoadedMixedProject(stale)).rejects.toThrow(/STALE_DISTRIBUTION/);
  const old=mixedReferenceProject();old.workspace.spatialPreparation!.memberConnections[0]={pieceId:"P",start:"bending-pinned",end:"rigid"};
  await expect(adaptSpatialProject(old)).rejects.toThrow(/BENDING_RELEASE_MIXED_REQUIRED/);
  expect(projectSchema.parse(m49GarageProject()).workspace.spatialPreparation!.groups.beam).toBeUndefined();
});
