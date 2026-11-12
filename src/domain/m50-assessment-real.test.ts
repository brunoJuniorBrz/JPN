import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {m50Project,declareM50Studies} from "./test-support/m50-project";
import {runLocalStructuralAssessment} from "@/infrastructure/analysis/local-structural-assessment-runner";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {physicalRestraintsSchema} from "./physical-restraint-contracts";
import {reviewPhysicalRestraints} from "./physical-restraints";
import {memberDesignBasis} from "./coldformed-design";
import {projectSchema} from "./models";
import {POST} from "@/app/api/experimental/structural-assessment/route";

const payload=(project:ReturnType<typeof m50Project>)=>JSON.stringify({schema_version:"jpn.structural-assessment/1",project});
let project:ReturnType<typeof m50Project>,result:Awaited<ReturnType<typeof runLocalStructuralAssessment>>;
beforeAll(async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=m50Project(),initial=await runLocalStructuralAssessment(payload(p));
  project=declareM50Studies(p,initial.studyBases);
  result=initial;
},25000);
afterAll(()=>vi.unstubAllEnvs());

it("uses the declared finite brace stiffness, conserves forces/moments and never replaces it with a rigid support",()=>{
  const d=project.workspace.spatialPreparation!,section=d.physicalCatalog!.sections.find(s=>s.id==="UE")!,e=200e9;
  const kBeam=48*e*section.izCm4!*1e-8/6**3,kBrace=e*.1e-4/1;
  // The central purlin ALSO transfers Y force axially to the second flexible
  // beam. Its axial stiffness and V4's flexural stiffness act in series.
  const kPurlin=e*.002/4,kOtherBeam=48*e*4e-5/6**3,kRoof=kPurlin*kOtherBeam/(kPurlin+kOtherBeam);
  const displacement=10/(kBeam+kBrace+kRoof),braceForce=kBrace*displacement;
  const point=result.report.continuousDemands!.pieces.find(p=>p.pieceId==="V0")!.fields.find(f=>f.combinationId==="ULS_G")!;
  expect(point.globalToLocal).toEqual([[1,0,0],[0,1,0],[0,0,1]]);
  const brace=result.restraints.items.find(i=>i.declaration.id==="C0-BRACE")!;
  expect(brace.stiffnessRepresentation).toBe("existing-finite-axial-stiffness");
  expect(brace.combinations.find(c=>c.combinationId==="ULS_G")!.demand).toBeCloseTo(braceForce,7);
  expect(brace.combinations.every(c=>c.status==="exceeds-declared-capacity"&&c.capacityVerified===false)).toBe(true);
  const request=result.report.physicalInput;
  expect(request.supports.some(s=>s.node==="C0")).toBe(false);
  expect(request.members.find(m=>m.id==="BRACE")!.kind).toBe("axial");
  const fields=result.report.continuousDemands!.pieces.find(p=>p.pieceId==="V0")!.fields;
  const last=fields.find(f=>f.combinationId==="ULS_G"&&f.rows[0].originalPositionM>0)!;
  expect(last.rows[0].translationLocalM![1]).toBeCloseTo(displacement,10);
  for(const c of result.transfers.combinations)for(const joint of c.joints)expect(joint.balance.withinTolerance).toBe(true);
  const refs=result.restraints.idealFlexuralReferences;
  expect(refs).toHaveLength(2);
  for(const r of refs){expect(r.positionsM).toEqual([0,6]);expect(r.maximumSpanM).toBe(6);expect(r.elasticBracesCountedAsRigid).toBe(false);expect(r.normativeResistance).toBe(false);}
  expect(refs.find(r=>r.deflectionAxis==="local-y")!.eulerIdealN).toBeCloseTo(Math.PI**2*e*section.izCm4!*1e-8/36,7);
});

it("recovers physical torsional restraint moments and compares Nm only with declared Nm capacity",()=>{
  for(const id of ["A0-T","B0-T"]){
    const item=result.restraints.items.find(r=>r.declaration.id===id)!;
    expect(item.combinations).toHaveLength(6);
    for(const c of item.combinations){expect(c.demand).toBeCloseTo(.005,10);expect(c.units).toBe("Nm");expect(c.status).toBe("exceeds-declared-capacity");}
  }
  expect(result.restraints.items.filter(r=>r.declaration.id.endsWith("-Z")).every(r=>r.combinations.every(c=>c.status==="capacity-pending"))).toBe(true);
});

it("executes existing Ue compression, flexure, shear and concurrent interaction on continuous REAL solver demands",async()=>{
  const result=await runLocalStructuralAssessment(payload(project));
  expect(result.resistanceAttempts).toHaveLength(3);expect(result.resistanceAttempts.every(a=>a.status==="executed")).toBe(true);
  expect(result.report.executionRecords).toHaveLength(3);
  expect(result.resistanceBatch).toEqual({geometryEvaluations:1,geometryReuses:2});
  for(const [combo,moment,shear] of [["ULS_G",180,60],["ULS_W",270,90],["ULS_NET",90,30]] as const){
    const record=result.report.executionRecords.find(r=>r.result.combination_id===combo)!,checks=record.result.checks;
    const compression=checks.find(c=>c.id==="compression")!,bending=checks.find(c=>c.id.startsWith("my_"))!,vz=checks.find(c=>c.id==="shear_z")!;
    if(compression.status==="BLOCKED"||bending.status==="BLOCKED"||vz.status==="BLOCKED")throw Error("Supported partial checks were not executed");
    expect(compression.demand).toBeCloseTo(100,6);expect(bending.demand).toBeCloseTo(moment,6);expect(vz.demand).toBeCloseTo(shear,6);
    const properties=record.result.geometry_audit!.computed_properties,fy=250e6;
    // Independent published low-slenderness branches, using the independently
    // recalculated physical gross section, not values inferred from the drawing.
    expect(compression.resistance).toBeCloseTo(.658**(properties.area_m2*fy/1e8)*properties.area_m2*fy/1.2,6);
    expect(bending.resistance).toBeCloseTo(properties.wy_m3*fy/1.1,6);
    expect(vz.resistance).toBeCloseTo(.6*fy*.09*.002/1.1,6);
    expect(compression.status).toBe("CONDITIONAL");expect(bending.status).toBe("CONDITIONAL");
    expect(checks.find(c=>c.id==="bending-shear-9.8.4")!.status).toBe("BLOCKED");
    expect(checks.find(c=>c.id==="unsupported-tNm")!.status).toBe("BLOCKED");
    expect(checks.find(c=>c.id==="combined-9.9")!.status).toBe("CONDITIONAL");
    expect(checks.find(c=>c.id==="compression-slenderness")!.status).toBe("FAIL");
    expect(record.result.member_all_limit_states_verified).toBe(false);
  }
  for(const c of result.checks){expect(c.profile).toContain("Ue 100");expect(c.steel).toBeTruthy();expect(c.standard).toBe("ABNT NBR 14762:2010");expect(c.allMemberLimitStatesVerified).toBe(false);}
  expect(result.checks.find(c=>c.failureMode==="shear_z")!.formula).toContain("0.6 fy h t");
  mkdirSync(".tools/m50-runtime",{recursive:true});writeFileSync(".tools/m50-runtime/resistance-assessment.json",JSON.stringify({project,result},null,2));
},25000);

it("keeps participant load demands distinct from zero joint balance and separates uplift demand from anchor capacity",()=>{
  const c=result.transfers.combinations.find(c=>c.combinationId==="ULS_W")!,center=c.joints.find(n=>n.nodeId==="C0")!;
  expect(center.participants.find(p=>p.pieceId==="PC")!.memberOnConnection.forceN[2]).toBeCloseTo(180,6);
  expect(center.participants.find(p=>p.pieceId==="V0")!.memberOnConnection.forceN[2]).toBeCloseTo(-180,6);
  const support=c.supports.find(s=>s.nodeId==="A0")!;
  expect(support.reactionOnSteel.forceN[2]).toBeCloseTo(-180,6);
  expect(support.requiredUpliftConnectionN).toBeCloseTo(180,6);
  expect(support.loadOnExistingStructure.forceN[2]).toBeCloseTo(180,6);
  expect(support.verifiedConnectionCapacity).toBeNull();expect(support.capacityStatus).toBe("not-verified");
  expect(center.participants.every(p=>p.fastenerAllocation===null&&p.verifiedCapacity===null)).toBe(true);
});

it("persists physical bindings but keeps every approval gate blocked and records reproducible evidence",()=>{
  expect(projectSchema.parse(JSON.parse(JSON.stringify(project))).workspace.spatialPreparation!.physicalRestraints).toEqual(project.workspace.spatialPreparation!.physicalRestraints);
  expect(result.computedStructuralApproval).toBe(false);expect(result.fabricationRelease).toBe(false);expect(result.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(result.report.releaseGate.status).toBe("NOT_READY_BLOCKED");expect(result.restraints.normativeStabilityVerified).toBe(false);
  mkdirSync(".tools/m50-runtime",{recursive:true});writeFileSync(".tools/m50-runtime/assessment.json",JSON.stringify({project,result},null,2));
});

it.each(["stale","position","dof","direction","brace-kind","torsional-brace","released-torsion","duplicate"])("refuses %s physical restraint data without fabricating a binding",async(kind)=>{
  const p=m50Project(),d=p.workspace.spatialPreparation!,items=d.physicalRestraints!.items;
  if(kind==="stale")d.physicalRestraints!.geometrySignature="stale";
  if(kind==="position")items[0].positionM=.5;
  if(kind==="dof")items[0].directionGlobal=[1,0,0];
  if(kind==="direction")items[0].directionGlobal=[0,Math.SQRT1_2,Math.SQRT1_2];
  if(kind==="brace-kind")items.at(-1)!.binding={kind:"axial-member",pieceId:"PC"};
  if(kind==="torsional-brace"){items.at(-1)!.kind="torsional";items.at(-1)!.capacity.units="Nm";items.at(-1)!.directionGlobal=[1,0,0];}
  if(kind==="released-torsion")d.memberConnections.find(m=>m.pieceId==="V0")!.start="pinned";
  if(kind==="duplicate")items.push({...items[0],id:"DUPLICATE",directionGlobal:[0,-1,0]});
  expect(reviewPhysicalRestraints(p,d).length).toBeGreaterThan(0);
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/PHYSICAL_RESTRAINT/);
});

it("refuses dimensional mistakes and never lets declared capacities or brace changes reuse a critical study",async()=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!;
  d.physicalRestraints!.items[0].capacity.units="Nm";expect(()=>physicalRestraintsSchema.parse(d.physicalRestraints)).toThrow();
  d.physicalRestraints!.items[0].capacity.units="N";d.physicalRestraints!.items[0].capacity.positive=1000;
  const old=project.workspace.spatialPreparation!.memberDesign![0].study.basis_sha256;
  expect(await memberDesignBasis(p,result.report,"V0")).not.toBe(old);
  const next=await runLocalStructuralAssessment(payload(p));
  expect(next.resistanceAttempts.every(a=>a.status==="blocked"&&a.reason!.includes("obsoleto"))).toBe(true);
  expect(next.checks).toEqual([]);expect(next.releaseGate).toBe("NOT_READY_BLOCKED");
},25000);

it("blocks automatic unbraced cFSM when a physical intermediate brace is present",async()=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!;d.memberDesign=[d.memberDesign![0]];d.memberDesign[0].study.minimum_search="computed-cfsm-ss";
  const next=await runLocalStructuralAssessment(payload(p));
  expect(next.resistanceAttempts[0].status).toBe("blocked");expect(next.resistanceAttempts[0].reason).toContain("UNSUPPORTED_BUCKLING_MODEL");
  expect(next.checks).toEqual([]);
},25000);

it("HTTP blocks production, foreign origins, unknown inputs, oversized requests and unbounded batches",async()=>{
  const request=(body=payload(m50Project()),origin="http://127.0.0.1:3000")=>new Request("http://127.0.0.1:3000/api/experimental/structural-assessment",{method:"POST",headers:{host:"127.0.0.1:3000",origin,"content-type":"application/json"},body});
  vi.stubEnv("NODE_ENV","production");expect((await POST(request())).status).toBe(403);vi.stubEnv("NODE_ENV","development");
  expect((await POST(request(undefined,"https://foreign.invalid"))).status).toBe(403);
  expect((await POST(request('{"schema_version":"jpn.structural-assessment/1","approved":true}'))).status).toBe(422);
  expect((await POST(request(" ".repeat(500001)))).status).toBe(413);
  const p=structuredClone(project);p.workspace.spatialPreparation!.memberDesign!.push(...structuredClone(p.workspace.spatialPreparation!.memberDesign!));
  await expect(runLocalStructuralAssessment(payload(p))).rejects.toThrow();
});
