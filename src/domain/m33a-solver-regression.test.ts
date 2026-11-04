import { expect,it,vi,afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { windReferenceProject } from "./examples/wind-project";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";

afterEach(()=>vi.unstubAllEnvs());
it("preserves the frozen M32 solver output before normative-origin changes",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const a=await adaptLoadedMixedProject(windReferenceProject()),out=await runLocalMixed(JSON.stringify(a.request));
  if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw Error("Native solver did not complete");
  const c=out.result.combinations.WP;
  const actual={base:"566e068010446c3af8cb4889391ac177dcf752e3",inputSha256:a.input_sha256,
    nodes:Object.fromEntries(Object.entries(c.nodes).map(([id,n])=>[id,[...n.translation_m,...n.rotation_rad,...n.reaction_force_n,...n.reaction_moment_nm]])),
    members:Object.fromEntries(Object.entries(c.members).map(([id,m])=>[id,m.kind==="frame"?m.end_actions_local:[m.axial_n]]))};
  const frozen=JSON.parse(readFileSync("src/domain/test-support/m33a-solver-baseline.json","utf8"));
  expect(actual.inputSha256).toBe(frozen.inputSha256);
  for(const kind of ["nodes","members"] as const)for(const [id,values]of Object.entries(actual[kind])){
    expect(values).toHaveLength(frozen[kind][id].length);
    values.forEach((v,i)=>expect(v).toBeCloseTo(frozen[kind][id][i],kind==="nodes"?7:5));
  }
},20000);
