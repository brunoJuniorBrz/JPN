import { afterEach,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "@/app/api/experimental/design/route";
import { coldformedDesignResultSchema } from "@/domain/coldformed-design";
import { mixedInputHash } from "@/domain/mixed-analysis";
const evidence=JSON.parse(readFileSync("docs/validation/coldformed-design/continuation/automatic-compression.json","utf8"));
function request(){return new Request("http://127.0.0.1:3000/api/experimental/design",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify(evidence.cases[0].design_input)});}
function enable(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}
afterEach(()=>vi.unstubAllEnvs());
it("executes automatic modes and MRD through the real isolated HTTP handler",async()=>{
  enable();expect(process.env.JPN_SECTION_FSM_PYTHON_EXECUTABLE).toBeTruthy();const response=await POST(request()),out=await response.json();expect(response.status).toBe(200);
  const r=coldformedDesignResultSchema.parse(out.result);expect(r.input_sha256).toBe(await mixedInputHash(evidence.cases[0].design_input));expect(r.status).toBe("CONDITIONAL-MODEL-LIMITS");expect(r.buckling_audit!.library.pycufsm).toBe("0.2.0");expect(r.buckling_audit!.refinements).toHaveLength(3);expect(out.execution.memory_limit_bytes).toBe(805306368);expect(r.computed_structural_approval).toBe(false);
},25000);
it("never falls back to a different Python profile when cFSM is unconfigured",async()=>{
  enable();vi.stubEnv("JPN_SECTION_FSM_PYTHON_EXECUTABLE","");const response=await POST(request());expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("UNAVAILABLE");
});
