import { afterEach,expect,it,vi } from "vitest";
import { POST } from "@/app/api/experimental/section/route";
import { mixedInputHash } from "@/domain/mixed-analysis";

const input={schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:"rectangle",height:40,width:20},poisson:.3,source:"Analytical rectangle",revision:"1",responsible:"Synthetic test",convergence:.001};
function enabled(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}
function request(body=JSON.stringify(input),origin="http://127.0.0.1:3000",host="127.0.0.1:3000"){return new Request("http://127.0.0.1:3000/api/experimental/section",{method:"POST",headers:{origin,host,"content-type":"application/json"},body});}
afterEach(()=>vi.unstubAllEnvs());
it("executes the real isolated section worker over the local route with OS cap and input hash",async()=>{
  enabled();const response=await POST(request());expect(response.status).toBe(200);const out=await response.json();
  expect(out.execution.memory_limit_bytes).toBe(805306368);expect(out.execution.local_only).toBe(true);
  expect(out.result.input_sha256).toBe(await mixedInputHash(input));expect(out.result.library).toEqual({name:"sectionproperties",version:"3.10.2",license:"MIT"});
  expect(out.result.properties.areaMm2).toBeCloseTo(800,8);expect(out.result.properties.iyMm4).toBeCloseTo(20*40**3/12,6);expect(out.result.properties.izMm4).toBeCloseTo(40*20**3/12,6);
  expect(out.result.normativeResistanceVerified).toBe(false);
},25000);
it("blocks remote/production requests, oversize, duplicate JSON keys and invalid geometry",async()=>{
  enabled();vi.stubEnv("NODE_ENV","production");expect((await POST(request())).status).toBe(403);
  enabled();expect((await POST(request(undefined,"https://remote.invalid"))).status).toBe(403);expect((await POST(request(undefined,undefined,"remote.invalid"))).status).toBe(403);
  expect((await POST(request(" ".repeat(500001)))).status).toBe(413);
  expect((await POST(request(JSON.stringify({...input,geometry:{shape:"rectangle",height:0,width:20}})))).status).toBe(422);
  const duplicate=JSON.stringify(input).replace('"height":40','"height":40,"height":40');expect((await POST(request(duplicate))).status).toBe(422);
},25000);
