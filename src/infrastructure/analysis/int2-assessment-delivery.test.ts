import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach,expect,it,vi } from "vitest";
import { POST } from "@/app/api/experimental/structural-assessment/route";
import { compileEngineeringCombinations } from "@/domain/engineering-combinations";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { m50Project } from "@/domain/test-support/m50-project";
import { refreshM49Garage } from "@/domain/test-support/m49-garage-project";
import { acceptsAssessmentGzip,sendAssessment } from "./assessment-delivery";

afterEach(()=>vi.unstubAllEnvs());

it("honors an explicit gzip refusal over the wildcard and bounds both sizes",async()=>{
  expect(acceptsAssessmentGzip("br, gzip;q=0, *;q=1")).toBe(false);
  expect(acceptsAssessmentGzip("br, gzip;q=0.2")).toBe(true);
  expect(await (await sendAssessment({ok:true},false,"0".repeat(64),100)).json()).toEqual({ok:true});
  await expect(sendAssessment({value:"A".repeat(1000)},false,"0".repeat(64),100))
    .rejects.toMatchObject({code:"OUTPUT_LIMIT"});
  await expect(sendAssessment({value:"A".repeat(16_000_001)},true,"0".repeat(64),2_000_000))
    .rejects.toMatchObject({code:"OUTPUT_LIMIT"});
  await expect(sendAssessment({value:"A".repeat(1000)},true,"0".repeat(64),10))
    .rejects.toMatchObject({code:"OUTPUT_LIMIT"});
});

it("delivers the complete 60-combination M50 assessment with its original receipt",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED","0");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const project=m50Project(),prep=project.workspace.spatialPreparation!,declared=prep.engineeringCombinations!;
  const original=declared.combinations.slice();
  for(let i=original.length;i<60;i++){
    declared.combinations.push({...structuredClone(original[i%original.length]),id:`CONTROL_${i}`});
  }
  prep.combinations=compileEngineeringCombinations(declared,prep.cases.map(c=>c.id)).combinations;
  refreshM49Garage(project);
  const body=JSON.stringify({schema_version:"jpn.structural-assessment/1",project});
  const headers={host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","Content-Type":"application/json"};
  const refused=await POST(new Request("http://127.0.0.1:3000/api/experimental/structural-assessment",{method:"POST",body,headers}));
  expect(await refused.json()).toMatchObject({error:{code:"OUTPUT_LIMIT"}});
  const response=await POST(new Request("http://127.0.0.1:3000/api/experimental/structural-assessment",
    {method:"POST",body,headers:{...headers,"Accept-Encoding":"br, gzip"}}));
  expect(response.status,response.status!==200?await response.clone().text():"").toBe(200);
  expect(response.headers.get("Content-Encoding")).toBe("gzip");
  expect(response.headers.get("X-JPN-Request-Sha256")).toBe(createHash("sha256").update(body).digest("hex"));
  const wire=Buffer.from(await response.arrayBuffer()),decoded=gunzipSync(wire);
  expect(wire.length).toBeLessThan(2_000_000);
  expect(decoded.length).toBeGreaterThan(2_000_000);
  const {assessmentSha256,...result}=JSON.parse(decoded.toString("utf8"));
  expect(assessmentSha256).toBe(await mixedInputHash(result));
  expect(result.transfers.combinations).toHaveLength(60);
  expect(result.report.releaseGate.status).toBe("NOT_READY_BLOCKED");
},60000);
