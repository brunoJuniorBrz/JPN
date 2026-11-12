import {expect,test} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
import {m50Project,declareM50Studies} from "../../src/domain/test-support/m50-project";

test("M50 real Next.js -> Python: finite restraint, continuous resistance and uplift demands remain separate from approval",async({page})=>{
  test.setTimeout(120000);
  await page.goto("/demonstracao");
  const origin=new URL(page.url()).origin,project=m50Project();
  const analyze=async(p:typeof project)=>{
    const response=await page.request.post("/api/experimental/structural-assessment",{headers:{origin},data:{schema_version:"jpn.structural-assessment/1",project:p}});
    const body=await response.json();expect(response.status(),JSON.stringify(body)).toBe(200);return body;
  };
  const initial=await analyze(project),declared=declareM50Studies(project,initial.studyBases);
  const result=await analyze(declared);
  expect(result.schema_version).toBe("jpn.structural-assessment-result/1");
  expect(result.report.physicalInput.nodes).toHaveLength(7);
  expect(result.report.physicalInput.supports.some((s:{node:string})=>s.node==="C0")).toBe(false);
  expect(result.resistanceAttempts.every((a:{status:string})=>a.status==="executed")).toBe(true);
  expect(result.resistanceBatch).toEqual({geometryEvaluations:1,geometryReuses:2});
  expect(result.report.executionRecords).toHaveLength(3);
  expect(result.checks.filter((c:{failureMode:string})=>c.failureMode==="shear_z")).toHaveLength(3);
  expect(result.checks.find((c:{failureMode:string})=>c.failureMode==="bending-shear-9.8.4").check.status).toBe("BLOCKED");
  const brace=result.restraints.items.find((r:{declaration:{id:string}})=>r.declaration.id==="C0-BRACE");
  expect(brace.stiffnessRepresentation).toBe("existing-finite-axial-stiffness");
  expect(brace.combinations[0].demand).toBeCloseTo(5.32866273795,7);
  expect(brace.combinations.every((c:{status:string;capacityVerified:boolean})=>c.status==="exceeds-declared-capacity"&&!c.capacityVerified)).toBe(true);
  const suction=result.transfers.combinations.find((c:{combinationId:string})=>c.combinationId==="ULS_W");
  const support=suction.supports.find((s:{nodeId:string})=>s.nodeId==="A0");
  expect(support.requiredUpliftConnectionN).toBeCloseTo(180,6);expect(support.verifiedConnectionCapacity).toBeNull();
  expect(result.computedStructuralApproval).toBe(false);expect(result.fabricationRelease).toBe(false);expect(result.releaseGate).toBe("NOT_READY_BLOCKED");
  declared.workspace.spatialPreparation!.physicalRestraints!.items[0].capacity.positive=1000;
  const stale=await analyze(declared);
  expect(stale.analysisInputSha256).not.toBe(result.analysisInputSha256);
  expect(stale.resistanceAttempts.every((a:{status:string;reason:string})=>a.status==="blocked"&&a.reason.includes("obsoleto"))).toBe(true);
  expect(stale.checks).toEqual([]);expect(stale.releaseGate).toBe("NOT_READY_BLOCKED");
  await mkdir(".tools/m50-runtime",{recursive:true});
  await writeFile(".tools/m50-runtime/http-assessment.json",JSON.stringify({project:declared,result,stale},null,2));
});
