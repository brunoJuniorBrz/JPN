import { expect,it } from "vitest";
import { buildEngineReleaseGate } from "./engine-release-gate";
import { mixedReferenceProject } from "./examples/mixed-project";
it("numeric success and declared metadata cannot promote absent normative stages",()=>{
  const p=mixedReferenceProject(),gate=buildEngineReleaseGate(p,{binding:{inputSha256:"a".repeat(64),claimedApproval:true},continuousDemands:{approved:true},wholePieceDeflections:{approved:true},serviceChecks:[]});
  expect(gate.status).toBe("NOT_READY_BLOCKED");expect(gate.blocked.map(b=>b.id)).toEqual(expect.arrayContaining(["normative-actions","normative-member-resistance","mixed-second-order","normative-service","connection-and-foundation","two-external-roof-models"]));
  expect(gate.computedStructuralApproval).toBe(false);expect(gate.fabricationRelease).toBe(false);expect(gate.implementedNormativeProcedures).toEqual([]);expect(gate.professionalReview).toBe("not-granted");
});
