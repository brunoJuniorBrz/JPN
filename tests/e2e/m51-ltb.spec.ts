import {expect,test} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
import {m51Project,m51SectionRequest} from "../../src/domain/test-support/m51-project";
import {applyCalculatedSection} from "../../src/domain/apply-calculated-section";

test("M51 real Next.js -> Python -> continuous moment -> elastic LTB; instability never releases the beam",async({page})=>{
  // Three sequential capped HTTP operations plus page compilation. Each worker
  // retains its original 20 s limit; this is the new whole-scenario budget.
  test.setTimeout(60000);
  await page.goto("/demonstracao");
  const origin=new URL(page.url()).origin;
  const sectionResponse=await page.request.post("/api/experimental/section",{headers:{origin},data:m51SectionRequest});
  const section=await sectionResponse.json();expect(sectionResponse.status(),JSON.stringify(section)).toBe(200);
  const project=await applyCalculatedSection(m51Project(),"V",m51SectionRequest,section.result);
  const assess=async(p:typeof project)=>{
    const response=await page.request.post("/api/experimental/structural-assessment",{headers:{origin},data:{schema_version:"jpn.structural-assessment/1",project:p}});
    const body=await response.json();expect(response.status(),JSON.stringify(body)).toBe(200);return body;
  };
  const result=await assess(project);
  expect(result.lateralTorsional.map((s:{status:string})=>s.status)).toEqual(["CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","BLOCKED"]);
  const [low,high,reverse]=result.lateralTorsional.map((s:{result:unknown})=>s.result);
  expect(low.status).toBe("BELOW_ELASTIC_CRITICAL_CONDITIONAL");expect(high.status).toBe("ELASTIC_INSTABILITY_INDICATED");
  expect(high.elasticCriticalRatio).toBeGreaterThan(1);expect(high.criticalMomentNm).toBeLessThan(high.elasticYieldMomentNm);
  expect(reverse.momentNm).toBeCloseTo(-low.momentNm,7);
  expect(high.binding.analysisInputSha256).toBe(result.analysisInputSha256);
  expect(result.report.pieces[0].verifications.every((v:{status:string})=>v.status==="pending")).toBe(true);
  expect(high.designResistance).toBeNull();expect(result.computedStructuralApproval).toBe(false);
  expect(result.fabricationRelease).toBe(false);expect(result.releaseGate).toBe("NOT_READY_BLOCKED");
  // Actual changed declaration is rebound and recomputed; the former supported
  // study cannot survive a change in physical warping condition.
  const changed=structuredClone(project);changed.workspace.spatialPreparation!.elasticLtbStudies!.forEach(s=>s.endWarping[0]="restrained");
  const blocked=await assess(changed);
  expect(blocked.analysisInputSha256).not.toBe(result.analysisInputSha256);
  expect(blocked.lateralTorsional.every((a:{status:string;reason:string})=>a.status==="BLOCKED"&&a.reason.includes("free-warping"))).toBe(true);
  expect(blocked.releaseGate).toBe("NOT_READY_BLOCKED");
  await mkdir(".tools/m51-runtime",{recursive:true});
  await writeFile(".tools/m51-runtime/http.json",JSON.stringify({project,section,result,changedProject:changed,blocked},null,2));
});
