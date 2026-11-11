import {afterAll,afterEach,beforeAll,expect,it,vi} from "vitest";
import {m43FrameProject} from "@/domain/test-support/m43-frame-fixture";
import {prepareCorotationalFrameAnalysis,buildCorotationalFrameReport,assertCorotationalReportCurrent,
  corotationalDiagnosticSchema,verifyCorotationalDiagnostic} from "@/domain/corotational-frame";
import {buildResistanceReport} from "@/domain/resistance-report";
import {runLocalCorotationalFrame} from "./local-corotational-frame-runner";
import {diagnoseCorotationalFrameProject} from "./corotational-frame-client";
import {localMixedExecutionGate} from "./local-mixed-runner";
import {POST} from "@/app/api/experimental/second-order-frame/route";

const numerics={coarse_subdivisions:32,fine_subdivisions:64,load_steps:10,max_newton_iterations:30,
  equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4,displacement_increment_tolerance:1e-10,force_change_tolerance:1e-8};
const project=m43FrameProject();
let prepared:Awaited<ReturnType<typeof prepareCorotationalFrameAnalysis>>;
let diagnostic:Awaited<ReturnType<typeof runLocalCorotationalFrame>>;
function enable(){vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");vi.stubEnv("JPN_LOCAL_SECOND_ORDER_ENABLED","1");}
beforeAll(async()=>{enable();prepared=await prepareCorotationalFrameAnalysis(project,numerics);
  diagnostic=await runLocalCorotationalFrame(prepared.request);},20000);
afterEach(()=>{vi.unstubAllEnvs();localMixedExecutionGate.active=0;});
afterAll(()=>{localMixedExecutionGate.active=0;localMixedExecutionGate.disabled=false;});

it("Project -> v2 consistent real Python -> audited numerical convergence -> blocked report",async()=>{
  expect(diagnostic.physical_convergence_verified).toBe(true);
  expect(diagnostic.production_enabled).toBe(false);expect(diagnostic.fabrication_release).toBe(false);
  expect(diagnostic.candidate.combinations.C.equilibrium.accepted).toBe(true);
  expect(diagnostic.solver.name).toBe("JPN-Corotational-XZ");
  const report=await buildCorotationalFrameReport(project,prepared,diagnostic);
  expect(report.status).toBe("NOT_READY_BLOCKED");expect(report.computedStructuralApproval).toBe(false);
  await assertCorotationalReportCurrent(report,project,prepared,diagnostic);
  await expect(buildResistanceReport(project,prepared.physicalPreparation,diagnostic)).rejects.toThrow();
});
it.each(["geometry","supports","materials","loads"])("rejects stale %s",async change=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!;
  if(change==="geometry")p.workspace.physicalStructure!.nodes[1].z+=1;
  if(change==="supports")d.supports[0].dofs[0]="free";
  if(change==="materials")d.physicalCatalog!.materials[0].eGpa=190;
  if(change==="loads")d.loads[0].fzKn=-100;
  await expect(buildCorotationalFrameReport(p,prepared,diagnostic)).rejects.toThrow();
});
it.each(["force","axial","energy","residual","iterations","mesh","support"])("audits modified %s independently",async change=>{
  const r=structuredClone(diagnostic),c=r.candidate.combinations.C,member=Object.values(c.members)[0];
  if(change==="force")member.end_actions_global[0]+=1;
  if(change==="axial")member.geometric_axial_n+=10;
  if(change==="energy")c.strain_energy_j+=1;
  if(change==="residual")c.equilibrium.force_residual_n[0]+=1;
  if(change==="iterations")c.newton_steps[0].newton_residual_evaluations+=1;
  if(change==="mesh")r.comparison.C.translation_m+=.01;
  if(change==="support")r.candidate.analysis_model.supports[0].restrained[0]=false;
  await expect(verifyCorotationalDiagnostic(prepared.request,r)).rejects.toThrow();
});
it("rejects approval flags even when numerical convergence is true",()=>{
  for(const key of ["production_enabled","normative_stability_verified","computed_structural_approval","fabrication_release"])
    expect(corotationalDiagnosticSchema.safeParse({...diagnostic,[key]:true}).success).toBe(false);
});
function http(body:string,origin="http://127.0.0.1:3000"){
  return new Request("http://127.0.0.1:3000/api/experimental/second-order-frame",{method:"POST",body,
    headers:{host:"127.0.0.1:3000",origin,"content-type":"application/json","x-jpn-second-order":"1"}});
}
it("the existing experimental route and new explicit client return HTTP 422 / blocked report",async()=>{
  enable();const fetcher:typeof fetch=async(url,init)=>{
    expect(url).toBe("/api/experimental/second-order-frame");const r=await POST(http(String(init!.body)));
    expect(r.status).toBe(422);return r;
  };
  const report=await diagnoseCorotationalFrameProject(project,numerics,undefined,fetcher);
  expect(report.diagnostic.physical_convergence_verified).toBe(true);expect(report.fabricationRelease).toBe(false);
},20000);
it("raw duplicate keys, production, foreign origin, concurrency and abort remain protected",async()=>{
  enable();const duplicate=JSON.stringify(prepared.request).replace('"units":"SI"','"units":"SI","units":"SI"');
  await expect(runLocalCorotationalFrame(duplicate)).rejects.toThrow();
  localMixedExecutionGate.active=1;await expect(runLocalCorotationalFrame(prepared.request)).rejects.toMatchObject({code:"BUSY"});
  localMixedExecutionGate.active=0;const controller=new AbortController();controller.abort();
  await expect(runLocalCorotationalFrame(prepared.request,controller.signal)).rejects.toMatchObject({code:"CANCELLED"});
  expect((await POST(http("{}","https://attacker.invalid"))).status).toBe(403);
  vi.stubEnv("NODE_ENV","production");await expect(runLocalCorotationalFrame(prepared.request)).rejects.toMatchObject({code:"LOCAL_ONLY"});
});
