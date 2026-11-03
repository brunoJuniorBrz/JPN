import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import { coldformedDesignRequestSchema, coldformedDesignResultSchema, requireCurrentBucklingNumerics, verifiedColdformedRequestSchema } from "./coldformed-design";

const evidence=JSON.parse(readFileSync("docs/validation/coldformed-design/continuation/automatic-compression.json","utf8"));
function frame(){
  const raw=structuredClone(evidence.cases[0].design_input.design);
  Object.assign(raw.fields[0].forces,{vyN:[0],vzN:[0],tNm:[0],myNm:[0],mzNm:[0]});
  return raw;
}

it.each(["vyN","vzN","tNm","myNm","mzNm"])("rejects incomplete frame result %s before starting Python",component=>{
  const raw=frame();raw.fields[0].forces[component]=null;
  expect(()=>coldformedDesignRequestSchema.parse(raw)).toThrow(/INCOMPLETE_FORCE_FIELD/);
});
it("rejects a physical member switching force models across segments",()=>{
  const raw=frame(),second=structuredClone(raw.fields[0]);
  second.segment_id="other";second.offset_m=raw.fields[0].length_m;
  Object.assign(second.forces,{vyN:null,vzN:null,tNm:null,myNm:null,mzNm:null});
  raw.fields.push(second);
  expect(()=>coldformedDesignRequestSchema.parse(raw)).toThrow(/INCONSISTENT_FORCE_MODEL/);
});
it("keeps genuine axial force fields nullable and explicit frame zeros intact",()=>{
  const raw=evidence.cases[0].design_input.design;
  expect(coldformedDesignRequestSchema.parse(raw).fields[0].forces.myNm).toBeNull();
  expect(coldformedDesignRequestSchema.parse(frame()).fields[0].forces.myNm).toEqual([0]);
});
it("keeps old automatic results readable but rejects their reuse after the evaluator changed",()=>{
  const row=evidence.cases[0],result=coldformedDesignResultSchema.parse(row.design_result),request=verifiedColdformedRequestSchema.parse(row.design_input);
  expect(result.evaluator_version).toBe("jpn.nbr14762-mrd/2");
  expect(()=>requireCurrentBucklingNumerics(request,result)).toThrow(/OUTDATED_BUCKLING_EVALUATOR/);
});
