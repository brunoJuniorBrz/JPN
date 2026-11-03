import { afterEach,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "@/app/api/experimental/design/route";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { coldformedDesignResultSchema } from "@/domain/coldformed-design";

const record=JSON.parse(readFileSync("docs/validation/coldformed-design/integrated-tension.json","utf8"));
const input=record.cases[0].design_input;
function enabled(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}
function request(body=JSON.stringify(input),origin="http://127.0.0.1:3000",host="127.0.0.1:3000"){return new Request("http://127.0.0.1:3000/api/experimental/design",{method:"POST",headers:{origin,host,"content-type":"application/json"},body});}
afterEach(()=>vi.unstubAllEnvs());
it("real HTTP resistance path recalculates geometry and executes NBR14762 tension under the OS cap",async()=>{
  enabled();const response=await POST(request()),out=await response.json();expect(response.status).toBe(200);
  const result=coldformedDesignResultSchema.required({geometry_audit:true,calculation_input_sha256:true}).parse(out.result);
  expect(out.execution.memory_limit_bytes).toBe(805306368);expect(result.input_sha256).toBe(await mixedInputHash(input));
  const check=result.checks.find(c=>c.id==="tension")!;expect(check.status).toBe("CONDITIONAL");
  if(check.status!=="BLOCKED")expect(check.resistance).toBeCloseTo(record.cases[0].independent.tension_resistance_n,6);
  expect(result.computed_structural_approval).toBe(false);
},25000);
it("rejects bypassing geometry, production/remote requests, unknown fields and duplicate JSON keys",async()=>{
  enabled();vi.stubEnv("NODE_ENV","production");expect((await POST(request())).status).toBe(403);
  enabled();expect((await POST(request(undefined,"https://remote.invalid"))).status).toBe(403);
  expect((await POST(request(undefined,undefined,"remote.invalid"))).status).toBe(403);
  expect((await POST(request(JSON.stringify(input.design)))).status).toBe(422);
  expect((await POST(request(JSON.stringify({...input,approved:true})))).status).toBe(422);
  const duplicate=JSON.stringify(input).replace('"height":100','"height":100,"height":100');expect(duplicate).not.toBe(JSON.stringify(input));expect((await POST(request(duplicate))).status).toBe(422);
},25000);
