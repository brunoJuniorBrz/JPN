import { beforeAll,expect,it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { windReferenceProject } from "./examples/wind-project";
import { applyEngineeringCombinations } from "./apply-engineering-combinations";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { buildResistanceReport,type ResistanceReport } from "./resistance-report";
import { memberDesignBasis,prepareColdformedDesign,type MemberDesignDeclaration } from "./coldformed-design";
import { projectSchema, type Project } from "./models";
import { resistancePreparationSchema } from "./resistance-preparation";

let project:Project,report:ResistanceReport,declaration:MemberDesignDeclaration,pieceId:string;
beforeAll(async()=>{
  project=windReferenceProject();const d=project.workspace.spatialPreparation!;
  d.engineeringCombinations!.combinations[0].purpose="ULS";
  pieceId=d.memberKinds!.find(p=>p.kind==="axial")!.pieceId;
  // This fixture tests contract conversion, not numerical section agreement;
  // the separate real worker tests reject incompatible physical properties.
  d.resistance=[resistancePreparationSchema.parse({pieceId,family:"cold-formed",profileDesignation:"Synthetic Ue",fyMpa:250,fuMpa:400,bucklingYM:2,bucklingZM:3,lateralRestraintM:1,
    source:"Explicit contract test",revision:"1",restraintDescription:"Physical test",normativeReference:"NBR14762:2010 9.6.2",
    sectionProperties:{wyCm3:12,wzCm3:3},geometry:{version:1,basis:"physical-engineer-declaration",shape:"u-stiffened",dimensionsMm:{height:100,width:50,lip:15,wallThickness:2,insideRadius:3},source:"Explicit dimensions",revision:"1"}})];
  const prepared=await adaptLoadedMixedProject(project),python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py"),"--joint-actions"],{input:JSON.stringify(prepared.request),encoding:"utf8",windowsHide:true,maxBuffer:4000000,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}}));
  report=await buildResistanceReport(project,prepared,out.result,out.joint_actions);
  expect(report.pieces.find(p=>p.pieceId===pieceId)?.dataIssues).toEqual([]);
  declaration={schema_version:"jpn.member-design-declaration/1",pieceId,combinationId:"WP",study:{source:"Explicit source",revision:"1",responsible:"Test",basis_sha256:await memberDesignBasis(project,report,pieceId),boundary_and_load_pattern:"Axial test member",minimum_search:"not-required-pure-tension"},critical:{compression:null,my_positive:null,my_negative:null,mz_positive:null,mz_negative:null},tension:{basis:"full-section-all-elements-welded",source:"All elements welded; no holes",revision:"1"},unstiffenedSingleWeb:false};
},20000);

it("converts physical group and continuous original-member forces to SI without inventing critical modes",async()=>{
  const input=await prepareColdformedDesign(project,report,declaration),group=report.pieces.find(p=>p.pieceId===pieceId)!.physicalProperties;
  expect(input.design.section.area_m2).toBe(group.areaCm2!*1e-4);expect(input.design.section.e_pa).toBe(group.eGpa!*1e9);
  expect(input.design.section.wy_m3).toBe(12e-6);expect(input.design.section.fy_pa).toBe(250e6);expect(input.design.web.flat_height_m).toBe(.09);
  expect(input.design.critical.compression).toBeNull();expect(input.property_resolutions.area_m2).toBe(0);
  expect(input.design.fields.every(f=>f.forces.myNm===null&&f.offset_m>=0)).toBe(true);
});
it("study binding excludes only its own derived preparation metadata and survives persistence",async()=>{
  const p=structuredClone(project);p.workspace.spatialPreparation!.memberDesign=[declaration];
  expect(projectSchema.parse(p).workspace.spatialPreparation!.memberDesign).toEqual([declaration]);
  const r=structuredClone(report);r.physicalInput.project.revision="different derived preparation hash";
  expect(await memberDesignBasis(p,r,pieceId)).toBe(declaration.study.basis_sha256);
});
it("load, material, combination and restraint changes invalidate the critical study",async()=>{
  for(const edit of [
    (r:ResistanceReport)=>{r.physicalInput.combinations[0].factors.WP=1.01;},
    (r:ResistanceReport)=>{const m=r.physicalInput.members.find(m=>m.kind==="axial")!;if(m.kind==="axial")m.area_m2=1;},
    (r:ResistanceReport)=>{r.physicalInput.materials[0].e_pa*=1.01;},
  ]){const r=structuredClone(report);edit(r);await expect(prepareColdformedDesign(project,r,declaration)).rejects.toThrow(/obsoleto/);}
  const p=structuredClone(project);p.workspace.spatialPreparation!.resistance![0].bucklingYM=4;
  await expect(prepareColdformedDesign(p,report,declaration)).rejects.toThrow(/obsoleto/);
});
it("never uses a service combination or sampled-only report for a resistance execution",async()=>{
  await expect(prepareColdformedDesign(project,report,{...declaration,combinationId:"WS"})).rejects.toThrow(/ULS/);
  await expect(prepareColdformedDesign(project,{...report,continuousDemands:null},declaration)).rejects.toThrow(/contínuos/);
});
it("combination editing preserves loads and sources, removes overlap approval, rejects exclusivity and duplicate factors",()=>{
  const before=JSON.stringify(project),d=project.workspace.spatialPreparation!,value=structuredClone(d.engineeringCombinations!);
  value.combinations[0].terms.find(t=>t.caseId==="WP")!.gamma=1.4;
  const changed=applyEngineeringCombinations(project,value),next=changed.workspace.spatialPreparation!;
  expect(next.combinations[0].factors.WP).toBe(1.4);expect(next.loading!.overlapReview).toBeUndefined();expect(next.loads).toEqual(d.loads);expect(next.loading!.wind).toEqual(d.loading!.wind);expect(JSON.stringify(project)).toBe(before);
  value.combinations[0].terms.find(t=>t.caseId==="WS")!.gamma=1;
  expect(()=>applyEngineeringCombinations(project,value)).toThrow(/exclusivas/);
  value.combinations[0].terms.push(value.combinations[0].terms[0]);expect(()=>applyEngineeringCombinations(project,value)).toThrow();
});
