import { describe,expect,it } from "vitest";
import { newProject, projectSchema, emptySnapshot, backupSchema } from "./models";
import { planningExample } from "./planning-example";
import { guidedPreset,guidedSupportIssue,isParametricSupportAllowed,applyGuidedSketch } from "./guided-support";
import { generateStructure } from "./calculations/structure";
import { resolvePhysicalStructure } from "./physical-structure";
import { structureSignature } from "./calculations/project-basis";
import { calculateEstimate } from "./calculations/estimate";

describe("Coberturas guiadas — apoios metálicos, alvenaria e obra parcial",()=>{
 it("presets express four scenarios and DO NOT create physical boundary restraints",()=>{
  const p=newProject();p.name="Cobertura de teste";p.client="Cliente";
  for(const arrangement of ["steel","masonry","mixed","attached"] as const){
   const mode=guidedPreset(arrangement);
   const next=projectSchema.parse({...p,workspace:{...p.workspace,guidedSupport:mode}});
   expect(next.workspace.spatialPreparation).toBeUndefined();
   expect(next.workspace.physicalStructure).toBeUndefined();
   expect(next.workspace.guidedSupport?.source).toMatch(/não verificada/);
  }
 });
 it("masonry: never creates the parametric steel pillars that the owner did not request",()=>{
  const p=planningExample();p.workspace.guidedSupport=guidedPreset("masonry");
  expect(isParametricSupportAllowed(p)).toBe(false);
  expect(generateStructure(p).model).toBeNull();
  expect(generateStructure(p).pending[0]).toMatch(/alvenaria|misto/);
  expect(resolvePhysicalStructure(p).model).toBeNull();
  expect(generateStructure(p).notes.join(" ")).toMatch(/pilares fictícios/);
 });
 it("mixed left-right customization is preserved; engineering auto-selection remains prohibited",()=>{
  const p=planningExample();p.workspace.guidedSupport={...guidedPreset("mixed"),left:"new-column",right:"existing-masonry",note:"Parede existente, ligação pendente"};
  expect(guidedSupportIssue(p)).toMatch(/alvenaria/);
  expect(generateStructure(p).model).toBeNull();
  expect(projectSchema.parse(p).workspace.guidedSupport).toEqual(p.workspace.guidedSupport);
 });
 it("a partial addition with TWO new steel columns still refuses fabricated full-rectangle area and false pillar layout",()=>{
  const p=planningExample();p.workspace.guidedSupport={...guidedPreset("steel"),coverage:"partial"};
  expect(generateStructure(p).model).toBeNull();
  expect(guidedSupportIssue(p)).toMatch(/parcial/);
  p.estimate.materials=[{id:crypto.randomUUID(),name:"Telhas por área",materialId:null,source:"roof-area",
    purchaseUnit:"m²",measurementUnit:"m²",measurementPerPurchase:1,manualQuantity:null,wastePercent:0,unitPriceCents:3500}];
  const r=calculateEstimate(p);
  expect(r.materials[0].baseQuantity).toBeNull();
  expect(r.pending.join(" ")).toMatch(/Área|Informe a quantidade/);
  expect(r.saleCents).toBeNull();
 });
 it("explicit all-metal option preserves historic generator counts; existing projects are unchanged",()=>{
  const p=planningExample(),old=generateStructure(p);
  expect(old.model).not.toBeNull();
  p.workspace.guidedSupport=guidedPreset("steel");
  const current=generateStructure(p);
  expect(current.model?.pieces.length).toBe(old.model?.pieces.length);
  expect(current.model?.pieces.filter(x=>x.role==="column").length).toBe(old.model?.pieces.filter(x=>x.role==="column").length);
 });
 it("guided initial sketch is editable, keeps manual cost lines and does not invent restraints",()=>{
  const p=newProject();p.name="Novo esboço";p.client="Tom";
  const x=applyGuidedSketch(p,{widthM:12,lengthM:20,lowHeightM:5,slopePercent:10,typology:"gable",frameSpacingM:5,purlinSpacingM:1.5,trussDepthM:.8,panels:6,support:guidedPreset("attached")});
  const q=projectSchema.parse({...p,...x});
  expect(q.planning?.typology).toBe("gable");
  expect(q.planning?.profiles.column.name).toBe("");
  expect(q.roof.widthM).toBe(12);
  expect(q.workspace.guidedSupport?.coverage).toBe("partial");
  expect(q.workspace.spatialPreparation).toBeUndefined();
  expect(q.workspace.physicalStructure).toBeUndefined();
  expect(generateStructure(q).model).toBeNull();
  const json=JSON.stringify({...emptySnapshot(),projects:[q]});
  expect(backupSchema.parse({format:"jpn-projetos-backup",exportedAt:new Date().toISOString(),data:JSON.parse(json)}).data.projects[0].workspace.guidedSupport).toEqual(q.workspace.guidedSupport);
 });
 it("support option invalidates signature of generated geometry, even without changing dimensions",()=>{
  const p=planningExample(),before=structureSignature(p);
  p.workspace.guidedSupport=guidedPreset("mixed");
  expect(structureSignature(p)).not.toBe(before);
  const next=structureSignature(p);p.workspace.guidedSupport.right="unknown";
  expect(structureSignature(p)).not.toBe(next);
 });
});
