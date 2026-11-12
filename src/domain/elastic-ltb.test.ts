import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {uniformMomentElasticCritical,prepareElasticLtb,evaluateElasticLtb} from "./elastic-ltb";
import {elasticLtbStudiesSchema} from "./elastic-ltb-contracts";
import {m51Project,m51SectionRequest} from "./test-support/m51-project";
import {reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {structureSignature} from "./calculations/project-basis";
import {applyCalculatedSection} from "./apply-calculated-section";
import {projectSchema} from "./models";
import {mixedInputHash} from "./mixed-analysis";
import {adaptMixedProject} from "./mixed-adapter";
import {buildResistanceReport} from "./resistance-report";
import {runLocalSection} from "@/infrastructure/analysis/local-section-runner";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {runLocalStructuralAssessment} from "@/infrastructure/analysis/local-structural-assessment-runner";

it("recovers a hand-solved coupled energy determinant, not a design strength",()=>{
  // k=1, EIweak=6, GJ=35, EIw=21: det=6*56-M^2 => sqrt(336).
  const m=uniformMomentElasticCritical({lengthM:Math.PI,ePa:3,gPa:5,iWeakM4:2,jM4:7,iwM6:7});
  expect(m).toBeCloseTo(Math.sqrt(336),12);
  expect(6*56-m*m).toBeCloseTo(0,11);
});

it("preserves physical scaling and the free-warping stiffness contribution",()=>{
  const p={lengthM:6,ePa:200e9,gPa:200e9/2.6,iWeakM4:1e-6,jM4:7e-8,iwM6:1e-8},m=uniformMomentElasticCritical(p);
  expect(uniformMomentElasticCritical({...p,ePa:p.ePa*3,gPa:p.gPa*3})/m).toBeCloseTo(3,12);
  expect(uniformMomentElasticCritical({...p,iWeakM4:p.iWeakM4*4})/m).toBeCloseTo(2,12);
  expect(uniformMomentElasticCritical({...p,lengthM:12})).toBeLessThan(m/2);
  expect(uniformMomentElasticCritical({...p,iwM6:1e-20})).toBeLessThan(m);
});
it.each([0,-1,NaN,Infinity])("rejects nonphysical critical inputs %s",v=>{
  expect(()=>uniformMomentElasticCritical({lengthM:v,ePa:1,gPa:1,iWeakM4:1,jM4:1,iwM6:1})).toThrow("LTB_BLOCKED");
});

describe("real declared member and native Python integration",()=>{
let project:ReturnType<typeof m51Project>,result:Awaited<ReturnType<typeof runLocalStructuralAssessment>>;
const computeSection=()=>runLocalSection(JSON.stringify(m51SectionRequest));
let geometric:Awaited<ReturnType<typeof computeSection>>;
let base:Awaited<ReturnType<typeof buildResistanceReport>>;
const payload=(p:typeof project)=>JSON.stringify({schema_version:"jpn.structural-assessment/1",project:p});
beforeAll(async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  geometric=await computeSection();
  project=projectSchema.parse(await applyCalculatedSection(m51Project(),"V",m51SectionRequest,geometric.result));
  const prepared=await adaptMixedProject(project),analysis=await runLocalMixed(JSON.stringify(prepared.request),"connections");
  if(analysis.status!=="completed"||!analysis.joint_actions)throw Error("Actual Python trace required");
  base=await buildResistanceReport(project,prepared,analysis.result,analysis.joint_actions);
  result=await runLocalStructuralAssessment(payload(project));
  mkdirSync(".tools/m51-runtime",{recursive:true});
  writeFileSync(".tools/m51-runtime/assessment.json",JSON.stringify({project,geometric,analysis,result},null,2));
},60000);
afterAll(()=>vi.unstubAllEnvs());

it("binds actual I geometry and constant native moment to elastic buckling; HIGH is unstable while the linear solver solves",()=>{
  expect(result.lateralTorsional.map(a=>a.status)).toEqual(["CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","BLOCKED"]);
  const calculated=result.lateralTorsional.flatMap(a=>a.status==="CALCULATED_ELASTIC_REFERENCE"?[a.result]:[]);
  expect(calculated.map(r=>r.status)).toEqual(["BELOW_ELASTIC_CRITICAL_CONDITIONAL","ELASTIC_INSTABILITY_INDICATED","BELOW_ELASTIC_CRITICAL_CONDITIONAL"]);
  const [low,high,reverse]=calculated;
  expect(Math.abs(low.momentNm)).toBeCloseTo(10000,7);expect(Math.abs(high.momentNm)).toBeCloseTo(30000,7);
  expect(reverse.momentNm).toBeCloseTo(-low.momentNm,7);expect(reverse.criticalMomentNm).toBe(low.criticalMomentNm);
  // Independent classical squared form with k^2 factors expanded separately.
  const p=geometric.result.properties,E=200e9,G=200e9/2.6,L=6;
  const m2=Math.PI**2/L**2*E*p.izMm4*1e-12*G*p.jMm4*1e-12+Math.PI**4/L**4*E**2*p.izMm4*1e-12*p.warpingMm6*1e-18;
  expect(low.criticalMomentNm/Math.sqrt(m2)).toBeCloseTo(1,6);
  expect(low.elasticRange).toBe(true);expect(high.elasticCriticalRatio).toBeGreaterThan(1);
  expect(high.binding.analysisInputSha256).toBe(result.analysisInputSha256);
  expect(high.governing.coverage).toBe("constant-on-whole-original-member");
  const member=result.report.pieces[0];
  expect("elasticLateralTorsional"in member&&member.elasticLateralTorsional).toHaveLength(4);
  expect(member.approved).toBe(false);expect(member.allApplicableVerificationsComplete).toBe(false);
  expect(member.verifications.every(v=>v.status==="pending")).toBe(true);
  expect(high.designResistance).toBeNull();expect(result.computedStructuralApproval).toBe(false);
  expect(result.fabricationRelease).toBe(false);expect(result.releaseGate).toBe("NOT_READY_BLOCKED");
});

it("conserves joint forces/moments and independently recovers the constant-curvature deflection",()=>{
  for(const c of result.transfers.combinations)for(const j of c.joints)expect(j.balance.withinTolerance).toBe(true);
  for(const c of result.transfers.combinations)for(const s of c.supports){
    expect(Math.hypot(...s.reactionOnSteel.forceN)).toBeLessThan(1e-7);
    expect(Math.hypot(...s.reactionOnSteel.momentNm!)).toBeLessThan(1e-7);
  }
  const f=base.continuousDemands!.pieces[0].fields.find(f=>f.combinationId==="LOW")!;
  const mid=f.rows.find(r=>r.segmentPositionM===3)!;
  const iy=project.workspace.spatialPreparation!.groups.beam!.iyCm4!*1e-8;
  expect(Math.abs(mid.chordRelativeLocalM![2])).toBeCloseTo(10000*6**2/(8*200e9*iy),10);
});

it("rejects stale declarations, missing studies and tampered base results",async()=>{
  const p=structuredClone(project);p.workspace.spatialPreparation!.elasticLtbStudies![0].loadHeightFromShearCenterM=.1;
  await expect(prepareElasticLtb(p,base,p.workspace.spatialPreparation!.elasticLtbStudies![0])).rejects.toThrow("Stale");
  const altered=structuredClone(base);altered.pieces[0].physicalProperties.jCm4!*=2;
  await expect(prepareElasticLtb(project,altered,project.workspace.spatialPreparation!.elasticLtbStudies![0])).rejects.toThrow("report changed");
});

it("rejects mismatched/unconverged sections and widened resolutions; never trusts imported coefficients",async()=>{
  const plan=await prepareElasticLtb(project,base,project.workspace.spatialPreparation!.elasticLtbStudies![0]);
  const changed=structuredClone(geometric.result);changed.input_sha256="0".repeat(64);
  await expect(evaluateElasticLtb(plan,changed)).rejects.toThrow("mismatch");
  const unconverged=structuredClone(geometric.result);unconverged.convergence.status="not-converged";
  await expect(evaluateElasticLtb(plan,unconverged)).rejects.toThrow("unobserved refinement");
  const wider=structuredClone(plan);wider.piece.physicalProperties.jCm4!*=2;wider.piece.declaration!.sectionPropertyResolutions!.jCm4=1e10;
  await expect(evaluateElasticLtb(wider,geometric.result)).rejects.toThrow("six-significant");
});

it("keeps yielding-before-bifurcation conditional instead of treating min(My,Mcr) as resistance",async()=>{
  const plan=await prepareElasticLtb(project,base,project.workspace.spatialPreparation!.elasticLtbStudies![0]);
  const soft=structuredClone(plan);soft.piece.declaration!.fyMpa=1;
  const r=await evaluateElasticLtb(soft,geometric.result);
  expect(r.status).toBe("YIELD_PRECEDES_ELASTIC_BIFURCATION");expect(r.designResistance).toBeNull();expect(r.normativeResistanceVerified).toBe(false);
});

it.each([
  ["free warping",(p:typeof project)=>{p.workspace.spatialPreparation!.elasticLtbStudies![0].endWarping[0]="unknown";},"free-warping"],
  ["moment gradient",(p:typeof project)=>{p.workspace.spatialPreparation!.loads[1].myKnm=5;},"constant"],
  ["C1 roll",(p:typeof project)=>{p.workspace.spatialPreparation!.groups.beam!.rotationDeg=10;},"C1"],
  ["weak-axis bending",(p:typeof project)=>{p.workspace.spatialPreparation!.loads[0].mzKnm=1;},"Only declared end My"],
  ["undeclared brace",(p:typeof project)=>{p.workspace.spatialPreparation!.physicalRestraints!.items.pop();},"Six explicit"],
  ["artificially shortened Lb",(p:typeof project)=>{p.workspace.spatialPreparation!.resistance![0].lateralRestraintM=3;},"without automatic shortening"],
] as const)("blocks unsupported %s using actual fresh Python actions",async(_label,mutate,reason)=>{
  const p=structuredClone(project);p.workspace.spatialPreparation!.elasticLtbStudies=p.workspace.spatialPreparation!.elasticLtbStudies!.slice(0,1);mutate(p);
  const r=await runLocalStructuralAssessment(payload(p));
  expect(r.lateralTorsional[0].status).toBe("BLOCKED");
  const a=r.lateralTorsional[0];if(a.status!=="BLOCKED")throw Error("Expected explicit block");expect(a.reason).toContain(reason);
  expect(r.releaseGate).toBe("NOT_READY_BLOCKED");
},25000);

it("strict declarations reject duplicates, hidden factors and implicit warping",()=>{
  const s=project.workspace.spatialPreparation!.elasticLtbStudies![0];
  expect(elasticLtbStudiesSchema.safeParse([s,s]).success).toBe(false);
  expect(elasticLtbStudiesSchema.safeParse([{...s,Cb:1.3}]).success).toBe(false);
  const {endWarping,...missing}=s;expect(endWarping).toEqual(["free","free"]);
  expect(elasticLtbStudiesSchema.safeParse([missing]).success).toBe(false);
});

it("keeps a real finite EA/L intermediate brace in FE and blocks rigid-span substitution",async()=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!,model=p.workspace.physicalStructure!;
  d.elasticLtbStudies=d.elasticLtbStudies!.slice(0,1);
  model.nodes.push({id:"C",x:3000,y:0,z:0},{id:"R",x:3000,y:1000,z:0});
  model.pieces.push({id:"BRACE",role:"web",start:"C",end:"R"});
  d.groups.web={...d.groups.beam!,elementKind:"axial",connection:"axial"};
  d.memberKinds!.push({pieceId:"BRACE",kind:"axial"});d.memberConnections.push({pieceId:"BRACE",start:"axial",end:"axial"});
  d.supports.push({nodeId:"R",dofs:["fixed","fixed","fixed","free","free","free"]});
  d.supportInterfaces!.push({nodeId:"R",side:"internal",kind:"other",dofs:["fixed","fixed","fixed","free","free","free"],
    source:"Synthetic brace fixture",revision:"M51-brace",loadPath:"Physical axial brace to R",restraintBasis:"Explicit R translational restraint",reviewStatus:"site-reviewed"});
  reviewM34Fixture(p);d.physicalRestraints!.geometrySignature=structureSignature(p);
  d.physicalRestraints!.items.push({id:"FINITE",pieceId:"V",nodeId:"C",positionM:3,kind:"lateral",directionGlobal:[0,1,0],binding:{kind:"axial-member",pieceId:"BRACE"},
    capacity:{positive:null,negative:null,units:"N",source:"Synthetic declared capacity pending",revision:"M51-brace"},
    source:"Synthetic finite EA/L fixture",revision:"M51-brace",physicalBasis:"Actual axial brace, no rigid Y constraint"});
  const r=await runLocalStructuralAssessment(payload(p)),attempt=r.lateralTorsional[0];
  expect(r.report.physicalInput.supports.some(s=>s.node==="C")).toBe(false);
  expect(r.restraints.items.find(a=>a.declaration.id==="FINITE")!.stiffnessRepresentation).toBe("existing-finite-axial-stiffness");
  expect(attempt.status).toBe("BLOCKED");if(attempt.status!=="BLOCKED")throw Error("Explicit block required");
  expect(attempt.reason).toContain("no segmented/continuous-span shortening");expect(r.releaseGate).toBe("NOT_READY_BLOCKED");
},25000);

it("seals the integrated resistance report after attaching elastic diagnostics",async()=>{
  const {reportSha256,...body}=result.report;
  expect(await mixedInputHash(body)).toBe(reportSha256);
  expect(result.resistanceAttempts).toEqual([]);expect(result.checks).toEqual([]);
});
});
