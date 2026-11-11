import { expect,it } from "vitest";
import { declaredTakeoff,declaredTakeoffSignature } from "./declared-takeoff";
import { editDeclaredStructure,removeDeletedReferences } from "./edit-declared-structure";
import { m34abProject } from "./test-support/m34ab-fixtures";
import { transferTakeoff,structureSignature } from "./calculations/project-basis";
import { calculateEstimate } from "./calculations/estimate";
import { importPhysicalModel } from "./physical-model-import";
import { backupSchema,emptySnapshot,projectSchema,newProject } from "./models";
import { applyTomCommercial } from "./tom-commercial";
import { adaptMixedProject } from "./mixed-adapter";
import { planningExample } from "./planning-example";

it("geometric lengths and counts use exact physical coordinates and independent groups/sections",()=>{
  const p=m34abProject(),before=JSON.stringify(p),r=declaredTakeoff(p);
  expect(r.totals).toEqual({quantity:3,lengthM:3,massKg:null});expect(r.groups).toHaveLength(3);expect(r.pieces.map(p=>p.lengthMm)).toEqual([1000,1000,1000]);
  expect(r.pieces.every(p=>p.fabricationLengthMm===null&&p.commercialLengthMm===null&&p.massKg===null)).toBe(true);expect(r.fabricationRelease).toBe(false);expect(JSON.stringify(p)).toBe(before);
});
it("mass requires traceable physical area/density; commercial rates require explicit per-metre source/revision",()=>{
  const p=m34abProject(),cat=p.workspace.spatialPreparation!.physicalCatalog!;
  for(const m of cat.materials)m.density={kgM3:1000,source:"Synthetic density, not a steel assumption",revision:"1"};
  for(const s of cat.sections){s.designation=s.id+" synthetic";s.pricePerMeterCents=250;s.priceSource="Explicit synthetic price per metre";s.priceRevision="1";}
  expect(declaredTakeoff(p).totals.massKg).toBeCloseTo(3.4,12);
  const next=transferTakeoff(p,0);expect(projectSchema.safeParse(next).success).toBe(true);expect(calculateEstimate(next).directCostCents).toBe(750);expect(calculateEstimate(next).pending).toEqual([]);
  cat.materials[1].density=undefined;expect(declaredTakeoff(p).totals.massKg).toBeNull();cat.sections[0].priceSource="";expect(declaredTakeoff(p).groups[0].pricePerMeterCents).toBeNull();
});
it("transfer is idempotent, preserves manual purchases, binds each original ID and blocks stale estimates",()=>{
  const p=m34abProject();p.estimate.materials=[{id:crypto.randomUUID(),materialId:null,name:"Manual real purchase",source:"manual",manualQuantity:6,purchaseUnit:"un",measurementUnit:"un",measurementPerPurchase:1,wastePercent:0,unitPriceCents:13500}];
  const next=transferTakeoff(p,0),again=transferTakeoff(next,0);
  expect(again.estimate.materials).toEqual(next.estimate.materials);expect(again.estimate.materials[0]).toEqual(p.estimate.materials[0]);
  expect(again.estimate.materials.filter(l=>l.source==="takeoff").flatMap(l=>l.quantityOrigin!.pieceIds).sort()).toEqual(["AX1","F1","F2"]);
  const changed=structuredClone(again);changed.workspace.physicalStructure!.nodes.find(n=>n.id==="B2")!.x=2500;
  expect(calculateEstimate(changed).pending.join(" ")).toMatch(/Levantamento alterado/);
  const refreshed=transferTakeoff(changed,0);expect(refreshed.estimate.materials.filter(l=>l.source==="takeoff").reduce((s,l)=>s+l.manualQuantity!,0)).toBe(3.5);
});
it("takeoff tracks display roles and physical values even when a pure label does not affect the FE geometry identity",()=>{
  const p=m34abProject(),a=structureSignature(p),q=declaredTakeoffSignature(p);
  p.workspace.physicalStructure!.pieces[0].role="purlin";expect(structureSignature(p)).toBe(a);expect(declaredTakeoffSignature(p)).not.toBe(q);
  const b=declaredTakeoffSignature(p);p.workspace.spatialPreparation!.physicalCatalog!.sections[0].areaCm2=20;expect(declaredTakeoffSignature(p)).not.toBe(b);
});
it("atomic geometry edits preserve declarations and commercial data; invalid changes never mutate the saved source",()=>{
  const p=m34abProject(),before=JSON.stringify(p),g=structuredClone(p.workspace.physicalStructure!);g.nodes[1].x=-500;g.revision="Explicit new geometry";
  const next=editDeclaredStructure(p,g);expect(next.estimate).toEqual(p.estimate);expect(next.workspace.spatialPreparation).toEqual(p.workspace.spatialPreparation);expect(next.workspace.spatialPreparation!.geometrySignature).not.toBe(structureSignature(next));expect(JSON.stringify(p)).toBe(before);
  g.nodes[1].id="B0";expect(()=>editDeclaredStructure(p,g)).toThrow();expect(JSON.stringify(p)).toBe(before);
});
it("round-trips nodes, assignments, commercial metadata and geometric quantities through export/import and backup",()=>{
  const p=m34abProject();p.workspace.physicalStructure!.pieces[0].label="Viga";p.workspace.physicalStructure!.pieces[0].group="Setor A";
  p.workspace.spatialPreparation!.physicalCatalog!.sections[0].designation="Physical profile with no assumed stock length";
  const saved=projectSchema.parse(JSON.parse(JSON.stringify(transferTakeoff(p,0))));
  const backup=backupSchema.parse({format:"jpn-projetos-backup",exportedAt:new Date().toISOString(),data:{...emptySnapshot(),projects:[saved]}});
  const target=newProject();target.name="New owned identity";target.client="Real owner";const imported=importPhysicalModel(target,JSON.stringify(backup.data.projects[0]));
  expect(imported.workspace.physicalStructure).toEqual(p.workspace.physicalStructure);expect(imported.workspace.spatialPreparation).toEqual(p.workspace.spatialPreparation);expect(declaredTakeoff(imported).signature).toBe(declaredTakeoff(p).signature);
});
it("explicit deleted-reference cleanup never invents supports, updates connectivity or removes manual purchases",()=>{
  const p=m34abProject(),d=p.workspace.spatialPreparation!;d.memberKinds!.push({pieceId:"REMOVED",kind:"axial"});d.memberConnections.push({pieceId:"REMOVED",start:"axial",end:"axial"});d.supports.push({nodeId:"REMOVED",dofs:["fixed","fixed","fixed","free","free","free"]});
  const next=removeDeletedReferences(p);expect(next.workspace.spatialPreparation!.supports).toHaveLength(2);expect(next.workspace.spatialPreparation!.memberKinds).toHaveLength(3);expect(next.workspace.spatialPreparation!.connectivity).toEqual(d.connectivity);expect(next.estimate).toEqual(p.estimate);
});
it("the real Tom commercial transcription reproduces R$9651.29 and never creates geometry or engineering approval",async()=>{
  const p=newProject();p.name="Tom — commercial source only";p.client="Audit reference";const next=applyTomCommercial(p),r=calculateEstimate(next);
  expect(r.pending).toEqual([]);expect(r.directCostCents).toBe(965129);expect(r.saleCents).toBe(965129);expect(next.estimate.materials).toHaveLength(10);expect(next.estimate.materials[0].manualQuantity).toBe(6);expect(next.estimate.materials[1].manualQuantity).toBe(20);
  expect(next.workspace.physicalStructure).toBeUndefined();expect(()=>applyTomCommercial(next)).toThrow(/vazio/);await expect(adaptMixedProject(next)).rejects.toThrow();
});
it("a valid rectangular generator envelope can never supply area/counts to an unrelated declared structure",()=>{
  const p=m34abProject(),generated=planningExample();p.category="Cobertura metálica";p.roof=generated.roof;p.planning=generated.planning;
  p.estimate.materials=[{id:crypto.randomUUID(),materialId:null,name:"Area action without a verified declared roof",source:"roof-area",manualQuantity:null,purchaseUnit:"m²",measurementUnit:"m²",measurementPerPurchase:1,wastePercent:0,unitPriceCents:100}];
  const r=calculateEstimate(p);expect(r.materials[0].baseQuantity).toBeNull();expect(r.pending.length).toBeGreaterThan(0);expect(r.saleCents).toBeNull();
});
