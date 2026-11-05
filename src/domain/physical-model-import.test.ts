import { expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { importPhysicalModel } from "./physical-model-import";
import { restoreMixedAnalysis } from "./restore-mixed-analysis";
import { m34abProject } from "./test-support/m34ab-fixtures";
import { newProject } from "./models";
import { structureSignature } from "./calculations/project-basis";

it("imports a validated physical model while preserving the current project identity and commercial data",()=>{
  const source=m34abProject(),target=newProject();target.name="Obra real cadastrada";target.client="Cliente informado";target.commercialNotes="Preservar contrato";
  const before=JSON.stringify(target),next=importPhysicalModel(target,JSON.stringify(source));
  expect(next.id).toBe(target.id);expect(next.id).not.toBe(source.id);expect(next.name).toBe(target.name);expect(next.commercialNotes).toBe(target.commercialNotes);
  expect(next.workspace.physicalStructure).toEqual(source.workspace.physicalStructure);expect(next.workspace.spatialPreparation).toEqual(source.workspace.spatialPreparation);
  expect(JSON.stringify(target)).toBe(before);
});
it("imports bare declared coordinates with explicit pending preparation, never invented properties/supports/loads",()=>{
  const next=importPhysicalModel(newProject(),JSON.stringify(m34abProject().workspace.physicalStructure));
  const draft=next.workspace.spatialPreparation!;expect(draft.geometrySignature).toBe(structureSignature(next));expect(draft.supports).toEqual([]);expect(draft.loads).toEqual([]);expect(draft.groups.column.eGpa).toBeNull();
});
it.each(["invalid-json","duplicate-node","missing-reference","unsupported-source","approval-claim","large-file"])("rejects invalid physical import atomically: %s",kind=>{
  const p=m34abProject(),input=structuredClone(p.workspace.physicalStructure!);
  if(kind==="duplicate-node")input.nodes.push({...input.nodes[0]});if(kind==="missing-reference")input.pieces[0].end="MISSING";
  let text=JSON.stringify(input);if(kind==="invalid-json")text="{";if(kind==="unsupported-source")text=text.replace('"declared"','"generated"');if(kind==="approval-claim")text=JSON.stringify({...input,computedStructuralApproval:true});if(kind==="large-file")text=" ".repeat(5*1024*1024+1);
  const before=JSON.stringify(p);expect(()=>importPhysicalModel(p,text)).toThrow();expect(JSON.stringify(p)).toBe(before);
});
it("restores actual frozen numerical output only for the current request; imported preparation and origin claims cannot approve it",async()=>{
  const golden=JSON.parse(readFileSync("validation/m34ab/legacy-golden.json","utf8")),project=JSON.parse(readFileSync("validation/m34ab/legacy-backup.json","utf8")).data.projects[0];
  const text=JSON.stringify({prepared:{forged:"ignored"},result:golden.result,execution:{approved:true}}),r=await restoreMixedAnalysis(project,text);
  expect(r.prepared.input_sha256).toBe(golden.inputSha256);expect(r.execution.originVerified).toBe(false);expect(r.computedStructuralApproval).toBe(false);expect(r.fabricationRelease).toBe(false);
  project.workspace.spatialPreparation.groups.column.areaCm2+=1;await expect(restoreMixedAnalysis(project,text)).rejects.toThrow(/hash|revisão/);
});
