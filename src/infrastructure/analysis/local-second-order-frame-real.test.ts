import {afterAll,afterEach,beforeAll,expect,it,vi} from "vitest";
import {m43FrameProject,m43Numerics} from "@/domain/test-support/m43-frame-fixture";
import {prepareSecondOrderFrameAnalysis,buildSecondOrderFrameReport,assertSecondOrderFrameReportCurrent,
  secondOrderDiagnosticSchema,verifySecondOrderFrameDiagnostic} from "@/domain/second-order-frame";
import {mixedInputHash} from "@/domain/mixed-analysis";
import {buildResistanceReport} from "@/domain/resistance-report";
import {runLocalSecondOrderFrame} from "./local-second-order-frame-runner";
import {localMixedExecutionGate,runLocalMixed} from "./local-mixed-runner";
import {POST} from "@/app/api/experimental/second-order-frame/route";
import {diagnoseSecondOrderFrameProject} from "./second-order-frame-client";
import {m34abProject,reviewM34Fixture} from "@/domain/test-support/m34ab-fixtures";

function enable(){
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");vi.stubEnv("JPN_LOCAL_SECOND_ORDER_ENABLED","1");
}
afterEach(()=>{vi.unstubAllEnvs();localMixedExecutionGate.active=0;});
afterAll(()=>{localMixedExecutionGate.active=0;localMixedExecutionGate.disabled=false;});
const project=m43FrameProject();
let prepared:Awaited<ReturnType<typeof prepareSecondOrderFrameAnalysis>>;
let diagnostic:Awaited<ReturnType<typeof runLocalSecondOrderFrame>>;
beforeAll(async()=>{
  enable();prepared=await prepareSecondOrderFrameAnalysis(project,m43Numerics);
  diagnostic=await runLocalSecondOrderFrame(prepared.request);
},20000);

it("Project -> physical preparation -> protected Python P-Delta -> independently checked blocked report",async()=>{
  const r=await buildSecondOrderFrameReport(project,prepared,diagnostic);
  expect(r.status).toBe("NOT_READY_BLOCKED");expect(r.fabricationRelease).toBe(false);
  expect(diagnostic.status).toBe("diagnostic-rejected");
  expect(diagnostic.candidate.combinations.C.nodes.T0.translation_m[0]).toBeCloseTo(.0132978672812,9);
  expect(diagnostic.linear_baseline.combinations.C.nodes.T0.translation_m[0]).toBeCloseTo(.0106666666667,9);
  expect(diagnostic.blockers).toContain("PDELTA_DEAD_LOAD_EQUILIBRIUM_NOT_VERIFIED:C");
  await assertSecondOrderFrameReportCurrent(r,project,prepared,diagnostic);
  await expect(buildResistanceReport(project,prepared.physicalPreparation,diagnostic)).rejects.toThrow();
},20000);

it.each(["geometry","support","material","load"])("invalidates diagnostic after physical %s changes",async change=>{
  const p=structuredClone(project),d=p.workspace.spatialPreparation!;
  if(change==="geometry")p.workspace.physicalStructure!.nodes[1].z+=1;
  if(change==="support")d.supports[0].dofs[0]="free";
  if(change==="material")d.physicalCatalog!.materials[0].eGpa=190;
  if(change==="load")d.loads[0].fzKn=-100;
  await expect(buildSecondOrderFrameReport(p,prepared,diagnostic)).rejects.toThrow();
});

it("rejects false approval, modified equilibrium, unexpected restraints and wrong input hash",async()=>{
  expect(secondOrderDiagnosticSchema.safeParse({...diagnostic,fabrication_release:true}).success).toBe(false);
  const r=structuredClone(diagnostic);r.input_sha256="0".repeat(64);
  await expect(verifySecondOrderFrameDiagnostic(prepared.request,r)).rejects.toThrow();
  const f=structuredClone(diagnostic);f.candidate.combinations.C.equilibrium.accepted=true;
  await expect(verifySecondOrderFrameDiagnostic(prepared.request,f)).rejects.toThrow("aprovação numérica");
  const s=structuredClone(diagnostic);s.candidate.analysis_model.supports[0].restrained[0]=false;
  await expect(verifySecondOrderFrameDiagnostic(prepared.request,s)).rejects.toThrow("declarações físicas");
  const report=await buildSecondOrderFrameReport(project,prepared,diagnostic);
  Object.assign(report,{fabricationRelease:true});
  const {reportSha256:original,...body}=report;expect(original).toMatch(/^[a-f0-9]{64}$/);
  report.reportSha256=await mixedInputHash(body);
  await expect(assertSecondOrderFrameReportCurrent(report,project,prepared,diagnostic)).rejects.toThrow();
});

function http(body:string,headers:Record<string,string>={}){
  return new Request("http://127.0.0.1:3000/api/experimental/second-order-frame",{method:"POST",body,
    headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","content-type":"application/json",
      "x-jpn-second-order":"1",...headers}});
}
it("HTTP returns 422 with explicit numerical rejection, never an apparently completed design",async()=>{
  enable();const response=await POST(http(JSON.stringify(prepared.request)));
  expect(response.status).toBe(422);expect(response.headers.get("cache-control")).toBe("no-store");
  const body=await response.json();expect(body.error.code).toBe("PDELTA_NOT_VERIFIED");
  expect(body.diagnostic.physical_convergence_verified).toBe(false);
  expect(body.diagnostic.fabrication_release).toBe(false);
},20000);
it("the application client connects Project to route, real worker, audits and blocked report",async()=>{
  enable();const fetcher:typeof fetch=async(url,init)=>{
    expect(url).toBe("/api/experimental/second-order-frame");return POST(http(String(init!.body)));
  };
  const report=await diagnoseSecondOrderFrameProject(project,m43Numerics,undefined,fetcher);
  expect(report.status).toBe("NOT_READY_BLOCKED");expect(report.diagnostic.status).toBe("diagnostic-rejected");
  expect(report.fabricationRelease).toBe(false);
},20000);
it("the project adapter refuses mixed axial/frame topology instead of substituting frame stiffness",async()=>{
  await expect(prepareSecondOrderFrameAnalysis(reviewM34Fixture(m34abProject()),m43Numerics))
    .rejects.toThrow("PDELTA_AXIAL_KG_UNSUPPORTED");
});
it("feature flag, production and hostile origin are rejected before execution",async()=>{
  enable();vi.stubEnv("JPN_LOCAL_SECOND_ORDER_ENABLED","0");
  expect((await POST(http("{}"))).status).toBe(403);
  enable();vi.stubEnv("NODE_ENV","production");expect((await POST(http("{}"))).status).toBe(403);
  enable();expect((await POST(http("{}",{origin:"https://attacker.invalid"}))).status).toBe(403);
  expect((await POST(http("{}",{"sec-fetch-site":"cross-site"}))).status).toBe(403);
  expect((await POST(http("{}",{"x-jpn-second-order":"0"}))).status).toBe(403);
});
it("shares the linear execution slot and preserves cancellation",async()=>{
  enable();localMixedExecutionGate.active=1;
  await expect(runLocalSecondOrderFrame(prepared.request)).rejects.toMatchObject({code:"BUSY"});
  await expect(runLocalMixed(JSON.stringify(prepared.request.model))).rejects.toMatchObject({code:"BUSY"});
  localMixedExecutionGate.active=0;
  const controller=new AbortController();controller.abort();
  await expect(runLocalSecondOrderFrame(prepared.request,controller.signal)).rejects.toMatchObject({code:"CANCELLED"});
});
it("preserves raw duplicate-key rejection in the bounded Python worker",async()=>{
  enable();const raw=JSON.stringify(prepared.request).replace('"units":"SI"','"units":"SI","units":"SI"');
  await expect(runLocalSecondOrderFrame(raw)).rejects.toThrow();
  const response=await POST(http(" ".repeat(500001)));expect(response.status).toBe(413);
});
