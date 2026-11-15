import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterAll,afterEach,beforeAll,expect,it,vi } from "vitest";
import { POST as section } from "@/app/api/experimental/section/route";
import { POST as design } from "@/app/api/experimental/design/route";
import { POST as assessment } from "@/app/api/experimental/structural-assessment/route";
import { POST as mixed } from "@/app/api/experimental/mixed3d/route";
import { declareM50Studies,m50Project } from "@/domain/test-support/m50-project";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { runLocalStructuralAssessment } from "./local-structural-assessment-runner";

const localOrigin="http://127.0.0.1:3000",remoteOrigin="https://jpn.example.invalid";
const testToken="int2-synthetic-server-token",testPassword="int2-synthetic-operator-password";
let server:ChildProcess,backend:string;

beforeAll(async()=>{
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const code="import sys; from wsgiref.simple_server import make_server; sys.path.insert(0,sys.argv[1]); from app import app; s=make_server('127.0.0.1',0,app); print(s.server_port,flush=True); s.serve_forever()";
  server=spawn(python,["-I","-u","-c",code,path.resolve("engine")],
    {stdio:["ignore","pipe","ignore"],windowsHide:true,env:{...process.env,JPN_ANALYSIS_TOKEN:testToken}});
  backend=await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.once("exit",code=>reject(new Error(`WSGI server exited with ${code}`)));
    server.stdout!.once("data",data=>resolve(`http://127.0.0.1:${Number(String(data).trim())}`));
  });
});
afterAll(()=>{server?.kill();});
afterEach(()=>vi.unstubAllEnvs());

function request(payload:string,remote:boolean,authenticated=true){
  const origin=remote?remoteOrigin:localOrigin;
  vi.stubEnv("NODE_ENV",remote?"test":"development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN",localOrigin);
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED",remote?"1":"0");
  vi.stubEnv("JPN_MIXED_BACKEND_URL",backend);
  vi.stubEnv("JPN_MIXED_DEPLOYMENT_BYPASS_SECRET","");
  vi.stubEnv("JPN_MIXED_APP_ORIGIN",remoteOrigin);
  vi.stubEnv("JPN_ANALYSIS_TOKEN",testToken);
  vi.stubEnv("JPN_MIXED_ACCESS_USER","operator");
  vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD",testPassword);
  return new Request(origin+"/api/experimental/test",{method:"POST",body:payload,
    headers:{origin,host:new URL(origin).host,"Content-Type":"application/json",
      ...(remote&&authenticated?{Authorization:`Basic ${Buffer.from("operator:"+testPassword).toString("base64")}`}:{})}});
}

function withoutTiming(value:unknown):unknown{
  if(Array.isArray(value))return value.map(withoutTiming);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value)
    .filter(([k])=>k!=="elapsed_seconds").map(([k,v])=>[k,withoutTiming(v)]));
  return value;
}

const derivedHashes=new Set(["analysisResultSha256","assessmentSha256","reportSha256","resultSha256",
  "calculation_input_sha256","calculationInputSha256","priorAssessmentSha256","continuousReportSha256","baseReportSha256"]);

function comparisonDifferences(actual:unknown,expected:unknown,calculationHashes=new Map<string,string>(),path="",differences:string[]=[]){
  if(actual===expected)return differences;
  if(Array.isArray(actual)&&Array.isArray(expected)&&actual.length===expected.length){
    actual.forEach((value,i)=>comparisonDifferences(value,expected[i],calculationHashes,path+"/"+i,differences));
  }else if(actual&&expected&&typeof actual==="object"&&typeof expected==="object"&&!Array.isArray(actual)&&!Array.isArray(expected)){
    const a=Object.entries(actual),b=expected as Record<string,unknown>;
    if(a.length!==Object.keys(b).length)differences.push(path+" key count");
    for(const [key,value] of a){
      if(key==="elapsed_seconds")continue;
      if(derivedHashes.has(key)&&typeof value==="string"&&typeof b[key]==="string")continue;
      // Normative check receipts refer to the verified calculation input
      // (including measured section values), not the submitted job's hash.
      if(typeof value==="string"&&calculationHashes.get(value)===b[key])continue;
      comparisonDifferences(value,b[key],calculationHashes,path+"/"+key,differences);
    }
  }else if(typeof actual==="number"&&typeof expected==="number"){
    // These two reported diagnostics subtract nearby numbers. The Ue mesh
    // repeatability is measured on the properties themselves, above this
    // loss of relative precision in the small difference.
    const absolute=path.includes("/geometry_audit/refinement/relativeChanges/")?1e-9:
      path.endsWith("/geometry_audit/differences/j_m4/absolute_difference")?1e-18:1e-21;
    if(Math.abs(actual-expected)>Math.max(absolute,1e-9*Math.abs(actual),1e-9*Math.abs(expected)))
      differences.push(`${path}: ${actual} vs ${expected}`);
  }else{
    differences.push(`${path}: ${String(actual)} vs ${String(expected)}`);
  }
  return differences;
}

async function both(handler:(request:Request)=>Promise<Response>,payload:string){
  const responses=[await handler(request(payload,false)),await handler(request(payload,true))];
  const hash=createHash("sha256").update(payload).digest("hex");
  const outputs=await Promise.all(responses.map(async response=>{
    const value=await response.json();
    expect(response.status,JSON.stringify(value.error??{})).toBe(200);
    expect(response.headers.get("x-jpn-request-sha256")).toBe(hash);
    return value;
  }));
  if(outputs[1].request_sha256)expect(outputs[1].request_sha256).toBe(hash);
  return outputs;
}

it("binds section output to identical raw bytes and refuses unauthenticated operators",async()=>{
  const input={schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:"rectangle",height:40,width:20},
    poisson:.3,source:"INT-2 rectangle",revision:"1",responsible:"test",convergence:.001};
  const payload=JSON.stringify(input,null,2);
  expect((await section(request(payload,true,false))).status).toBe(401);
  const [local,remote]=await both(section,payload);
  expect(withoutTiming(remote.result)).toEqual(withoutTiming(local.result));
  expect(remote.result.properties.areaMm2).toBeCloseTo(800,8);
  expect(remote.result.approvedForFabrication).toBe(false);
},35000);

it("preserves integrator inputs, result receipts and numerical values against real WSGI",async()=>{
  const input=m50Project(),payload=(project:typeof input)=>JSON.stringify({schema_version:"jpn.structural-assessment/1",project});
  request(payload(input),false);
  const initial=await runLocalStructuralAssessment(payload(input));
  const [local,remote]=await both(assessment,payload(declareM50Studies(input,initial.studyBases)));
  expect(remote.report.executionRecords).toHaveLength(3);
  expect(remote.analysisInputSha256).toBe(local.analysisInputSha256);
  for(const result of [local,remote]){
    const {assessmentSha256,...body}=result;
    expect(assessmentSha256).toBe(await mixedInputHash(body));
  }
  const calculationHashes=new Map<string,string>();
  calculationHashes.set(remote.analysisResultSha256,local.analysisResultSha256);
  for(const [i,record] of remote.report.executionRecords.entries()){
    const expected=local.report.executionRecords[i];
    expect(record.result.input_sha256).toBe(await mixedInputHash(record.request));
    expect(expected.result.input_sha256).toBe(await mixedInputHash(expected.request));
    calculationHashes.set(record.result.calculation_input_sha256,expected.result.calculation_input_sha256);
    calculationHashes.set(record.result.input_sha256,expected.result.input_sha256);
  }
  expect(comparisonDifferences(remote,local,calculationHashes).slice(0,8)).toEqual([]);
  const [designLocal,designRemote]=await both(design,JSON.stringify(local.report.executionRecords[0].request));
  expect(designRemote.result.input_sha256).toBe(designLocal.result.input_sha256);
  expect(comparisonDifferences(designRemote.result,designLocal.result).slice(0,8)).toEqual([]);
  expect(designRemote.result.approved_for_fabrication).toBe(false);
},80000);

it("runs authenticated /3 second order per combination with identical numbers",async()=>{
  const release=Array<boolean>(6).fill(false),source="INT-2 elastic cantilever";
  const payload=JSON.stringify({schema_version:"jpn.mixed3d/3",units:"SI",theory:"linear-elastic-frame-axial",
    local_axes:"jpn-z-up/1",analysis_order:"second-order",solution_mode:"per-combination",project:{id:"INT2",revision:"1",source},
    nodes:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:0,y_m:0,z_m:4}],
    members:[{id:"F",kind:"frame",start:"A",end:"B",material:"M",section:"S",rotation_deg:0,release_start:release,release_end:release}],
    materials:[{id:"M",e_pa:200e9,g_pa:200e9/2.6,nu:.3,source,revision:"1"}],
    sections:[{id:"S",area_m2:.01,iy_m4:2e-5,iz_m4:2e-5,j_m4:2e-5,source,revision:"1"}],
    supports:[{node:"A",restrained:[true,true,true,true,true,true]}],cases:[{id:"P",source}],
    combinations:[{id:"ULS",factors:{P:1}},{id:"SLS",factors:{P:.4}}],
    nodal_loads:[{node:"B",case:"P",fx_n:100,fy_n:0,fz_n:-10000,mx_nm:0,my_nm:0,mz_nm:0}],member_loads:[],self_weight:null});
  const [local,remote]=await both(mixed,payload);
  expect(withoutTiming(remote.result)).toEqual(withoutTiming(local.result));
  expect(Object.keys(remote.result.combinations)).toEqual(["ULS","SLS"]);
  expect(remote.result.computedStructuralApproval).toBe(false);
  expect(remote.result.fabricationRelease).toBe(false);
  expect(remote.result.releaseGate).toBe("NOT_READY_BLOCKED");
},35000);
