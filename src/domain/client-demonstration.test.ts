import {expect,it} from "vitest";
import {createMathematicalDemonstration,createTomDemonstration,verifiedHistoricalDemonstration,compareMathematicalReference,technicalDataRows} from "./client-demonstration";
import {calculateEstimate} from "./calculations/estimate";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {backupSchema,emptySnapshot,projectSchema,defaultSettings} from "./models";

it("creates independent editable Tom copies at exactly R$9651.29 without inventing physical data or a rectangular roof",()=>{
  const a=createTomDemonstration(),b=createTomDemonstration();
  expect(a.id).not.toBe(b.id);expect(a.estimate.materials[0].id).not.toBe(b.estimate.materials[0].id);expect(a.isExample).toBe(false);
  expect(calculateEstimate(a).saleCents).toBe(965129);expect(calculateEstimate(a).pending).toEqual([]);
  expect(calculateEstimate(createTomDemonstration({...defaultSettings,pricingMode:"margin",defaultPricingPercent:30,defaultWastePercent:15})).saleCents).toBe(965129);
  expect(a.workspace.physicalStructure).toBeUndefined();expect(a.workspace.spatialPreparation).toBeUndefined();expect(a.workspace.roofOutline).toBeUndefined();
  expect(a.planning).toBeNull();expect(a.roof.widthM).toBeNull();expect(a.roof.lengthM).toBeNull();expect(a.roof.supports).toEqual([]);
  expect(technicalDataRows(a).every(r=>r.status==="Pendente")).toBe(true);
});
it("keeps checklist notes in a validated project/backup without turning them into solver declarations",()=>{
  const p=createTomDemonstration();p.workspace.demonstration!.technicalData!.supports={information:"Conferir posições em levantamento",source:"Responsável técnico a confirmar"};
  const backup=backupSchema.parse({format:"jpn-projetos-backup",exportedAt:new Date().toISOString(),data:{...emptySnapshot(),projects:[p]}});
  const q=projectSchema.parse(JSON.parse(JSON.stringify(backup.data.projects[0])));
  expect(q.workspace.demonstration).toEqual(p.workspace.demonstration);expect(technicalDataRows(q).filter(r=>r.information)).toHaveLength(1);
  expect(q.workspace.spatialPreparation).toBeUndefined();expect(calculateEstimate(q).saleCents).toBe(965129);
});
it("reuses the validated physical fixture and native UDL independently from the Tom budget",async()=>{
  const tom=createTomDemonstration(),before=JSON.stringify(tom),p=createMathematicalDemonstration(tom.id);
  expect(p.id).not.toBe(tom.id);expect(p.workspace.demonstration!.parentProjectId).toBe(tom.id);expect(p.workspace.demonstration!.kind).toBe("mathematical-validation");
  const current=await adaptLoadedMixedProject(p),evidence=await verifiedHistoricalDemonstration();
  expect(current.request.schema_version).toBe("jpn.mixed3d/2");expect(current.request.members).toHaveLength(3);expect(current.request.project.id).toBe(p.id);
  expect(compareMathematicalReference(current.request,evidence.result)).not.toBeNull();expect(current.input_sha256).not.toBe(evidence.inputHash);
  expect(JSON.stringify(tom)).toBe(before);expect(calculateEstimate(tom).saleCents).toBe(965129);
});
it("verifies the historical source/hash and rejects applying its oracles to a changed model",async()=>{
  const old=await verifiedHistoricalDemonstration();
  expect(old.historical).toBe(true);expect(old.source.commit).toBe("6a64398d1e4d12577d816efb07d8483767ff4459");expect(old.computedStructuralApproval).toBe(false);expect(old.fabricationRelease).toBe(false);
  expect(old.comparison!.tipM).toBeCloseTo(-.00096875,12);expect(old.comparison!.reactionN).toBeCloseTo(200,9);
  const changed=structuredClone(old.request);changed.nodes[2].x_m+=1;
  expect(compareMathematicalReference(changed,old.result)).toBeNull();
});
