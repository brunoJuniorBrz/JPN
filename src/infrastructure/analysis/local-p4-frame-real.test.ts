import {afterEach,afterAll,beforeAll,expect,it,vi} from "vitest";
import {m43FrameProject} from "@/domain/test-support/m43-frame-fixture";
import {prepareP4FrameAnalysis,buildP4FrameReport,assertP4ReportCurrent,p4DiagnosticSchema,verifyP4Diagnostic} from "@/domain/p4-frame";
import {buildResistanceReport} from "@/domain/resistance-report";
import {runLocalP4Frame} from "./local-p4-frame-runner";
import {diagnoseP4FrameProject} from "./p4-frame-client";
import {localMixedExecutionGate} from "./local-mixed-runner";
import {POST} from "@/app/api/experimental/second-order-frame/route";

const project=m43FrameProject();
const numerics={coarse_subdivisions:2,fine_subdivisions:4,load_steps:10,max_newton_iterations:30,equilibrium_relative_tolerance:1e-8,
  refinement_relative_tolerance:1e-4,displacement_increment_tolerance:1e-10,force_change_tolerance:1e-8};
let prepared:Awaited<ReturnType<typeof prepareP4FrameAnalysis>>,diagnostic:Awaited<ReturnType<typeof runLocalP4Frame>>;
function enable(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_SECOND_ORDER_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");}
beforeAll(async()=>{enable();prepared=await prepareP4FrameAnalysis(project,numerics,"spatial-quaternion-arc/1");diagnostic=await runLocalP4Frame(prepared.request);},20000);
afterEach(()=>{vi.unstubAllEnvs();localMixedExecutionGate.active=0;});
afterAll(()=>{localMixedExecutionGate.active=0;localMixedExecutionGate.disabled=false;});

it("Project -> explicit v3 spatial worker -> independent energy/wrench audit -> blocked report",async()=>{
  expect(diagnostic.dimensionality).toBe(3);expect(diagnostic.candidate.combinations.C.equilibrium.accepted).toBe(true);
  expect(diagnostic.blockers).toContain("P4_SPATIAL_DOMAIN_NOT_VERIFIED");
  const report=await buildP4FrameReport(project,prepared,diagnostic);
  expect(report.status).toBe("NOT_READY_BLOCKED");expect(report.fabricationRelease).toBe(false);
  await assertP4ReportCurrent(report,project,prepared,diagnostic);
  await expect(buildResistanceReport(project,prepared.physicalPreparation,diagnostic)).rejects.toThrow();
});
it.each(["geometry","support","material","load"])("rejects stale %s",async change=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!;
  if(change==="geometry")p.workspace.physicalStructure!.nodes[1].z+=1;
  if(change==="support")d.supports[0].dofs[0]="free";
  if(change==="material")d.physicalCatalog!.materials[0].eGpa=190;
  if(change==="load")d.loads[0].fzKn=-100;
  await expect(buildP4FrameReport(p,prepared,diagnostic)).rejects.toThrow();
});
it.each(["wrench","energy","quaternion","frame","constitutive","mode","residual","iterations","mesh"])("independently rejects forged %s",async change=>{
  const r=structuredClone(diagnostic),a=r.candidate.combinations.C,m=Object.values(a.members)[0];
  if(change==="wrench")m.end_actions_global[0]+=1;
  if(change==="energy")m.strain_energy_j+=1;
  if(change==="quaternion")a.nodes.T0.orientation_quaternion[1]+=.01;
  if(change==="frame")m.current_basis[1][0]+=.01;
  if(change==="constitutive")m.local_state.axial_n+=10;
  if(change==="mode")a.stability.generalized_mode[0]+=1;
  if(change==="residual")a.equilibrium.force_residual_n[0]+=1;
  if(change==="iterations")a.newton_steps[0].linear_system_solves+=1;
  if(change==="mesh")r.comparison.C.translation_m+=.01;
  await expect(verifyP4Diagnostic(prepared.request,r)).rejects.toThrow();
});
it("all engineering approval and fabrication flags remain literal false",()=>{
  for(const key of ["production_enabled","normative_stability_verified","computed_structural_approval","fabrication_release"])
    expect(p4DiagnosticSchema.safeParse({...diagnostic,[key]:true}).success).toBe(false);
});
function http(body:string,origin="http://127.0.0.1:3000"){
  return new Request("http://127.0.0.1:3000/api/experimental/second-order-frame",{method:"POST",body,
    headers:{host:"127.0.0.1:3000",origin,"content-type":"application/json","x-jpn-second-order":"1"}});
}
it("planar arc uses the same endpoint with explicit formulation and HTTP 422",async()=>{
  enable();const fetcher:typeof fetch=async(url,init)=>{expect(url).toBe("/api/experimental/second-order-frame");const r=await POST(http(String(init!.body)));expect(r.status).toBe(422);return r;};
  const report=await diagnoseP4FrameProject(project,numerics,"xz-hermite-arc/1",undefined,fetcher);
  expect(report.diagnostic.dimensionality).toBe(2);expect(report.fabricationRelease).toBe(false);
},20000);
it("preserves duplicate-key refusal, origin, production, shared gate and cancellation",async()=>{
  enable();const raw=JSON.stringify(prepared.request).replace('"units":"SI"','"units":"SI","units":"SI"');
  await expect(runLocalP4Frame(raw)).rejects.toThrow();localMixedExecutionGate.active=1;
  await expect(runLocalP4Frame(prepared.request)).rejects.toMatchObject({code:"BUSY"});localMixedExecutionGate.active=0;
  const abort=new AbortController();abort.abort();await expect(runLocalP4Frame(prepared.request,abort.signal)).rejects.toMatchObject({code:"CANCELLED"});
  expect((await POST(http("{}","https://attacker.invalid"))).status).toBe(403);
  vi.stubEnv("NODE_ENV","production");await expect(runLocalP4Frame(prepared.request)).rejects.toMatchObject({code:"LOCAL_ONLY"});
});
