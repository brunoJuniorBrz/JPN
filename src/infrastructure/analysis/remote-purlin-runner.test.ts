import {afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import path from "node:path";
import {purlinInitialCandidates,purlinRequestSchema,type PurlinResult} from "@/domain/purlin";
import {runRemotePurlin,remotePurlinLimits} from "./remote-purlin-runner";
import {GET,POST} from "@/app/api/experimental/purlin/route";

const input=purlinRequestSchema.parse({
  schema_version:"jpn.purlin/1",request_id:"PURLIN-REMOTE-TEST",
  span_count:1,span_length_m:4,end_condition:"simple",
  uniform_load_n_m:0,load_mode:"surface",
  surface_pressure_n_m2:-800,tributary_width_m:1.25,
  load_source:"Memorial de carga vertical declarado no teste",
  include_self_weight:true,gravity_m_s2:9.80665,
  e_gpa:200,density_kg_m3:7850,deflection_limit_ratio:250,
  candidates:[purlinInitialCandidates[0]],
});
let pythonResult:PurlinResult;
const payload=()=>JSON.stringify(input);
const execution={memory_limit_bytes:805306368,memory_kind:"linux-address-space",
  timeout_seconds:20,concurrency_per_instance:1,isolation:"subprocess"};
const envelope=()=>({schema_version:"jpn.http-purlin/1",
  request_sha256:createHash("sha256").update(payload()).digest("hex"),
  result:structuredClone(pythonResult),execution:{...execution}});
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json"}});
it("cada envelope possui metadados de execução independentes",()=>{
  const first=envelope(),second=envelope();
  first.execution.memory_limit_bytes=1;
  expect(second.execution.memory_limit_bytes).toBe(805306368);
  expect(execution.memory_limit_bytes).toBe(805306368);
});
beforeAll(()=>{
  const python=process.env.JPN_PYTHON_EXECUTABLE||
    path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const envelope=JSON.parse(execFileSync(python,["-I","-X","utf8",
    path.resolve("engine/local_mixed_worker.py"),"--purlin"],{
      input:payload(),encoding:"utf8",windowsHide:true,maxBuffer:200000,
      env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},
    }));
  if(envelope.status!=="completed")throw new Error("Python real não executou a terça de referência.");
  pythonResult=envelope.result;
},20000);
beforeEach(()=>{
  vi.stubEnv("NODE_ENV","test");
  vi.stubEnv("JPN_PURLIN_REMOTE_ENABLED","1");
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED","1");
  vi.stubEnv("JPN_MIXED_BACKEND_URL","https://engine.example.invalid");
  vi.stubEnv("JPN_ANALYSIS_TOKEN","server-side-token-only");
  vi.stubEnv("JPN_MIXED_APP_ORIGIN","https://jpn.example.invalid");
  vi.stubEnv("JPN_MIXED_ACCESS_USER","operator");
  vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD","unique-long-password-for-test");
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("retorna apenas o resultado Python validado, sem revelar credenciais",async()=>{
  const f=vi.spyOn(globalThis,"fetch").mockResolvedValue(respond(envelope()));
  const result=await runRemotePurlin(input);
  expect(result).toEqual(pythonResult);
  expect(result.computedStructuralApproval).toBe(false);
  expect(result.fabricationRelease).toBe(false);
  expect(f.mock.calls[0][0]).toBe("https://engine.example.invalid/api/analyze-purlin");
  expect(f.mock.calls[0][1]?.headers).toMatchObject({Authorization:"Bearer server-side-token-only"});
  expect(JSON.stringify(result)).not.toContain("server-side-token-only");
});
it("rejeita SHA, ID, carga e aprovação adulterados",async()=>{
  const variations=[
    (x:ReturnType<typeof envelope>)=>{x.request_sha256="f".repeat(64);},
    (x:ReturnType<typeof envelope>)=>{x.result.request_id="forged-id";},
    (x:ReturnType<typeof envelope>)=>{x.result.results[0].total_line_load_n_m+=150;},
    (x:ReturnType<typeof envelope>)=>{(x.result as unknown as Record<string,unknown>).fabricationRelease=true;},
    (x:ReturnType<typeof envelope>)=>{(x.execution as unknown as Record<string,unknown>).memory_limit_bytes=1;},
  ];
  const f=vi.spyOn(globalThis,"fetch");
  for(const change of variations){
    const out=envelope();change(out);f.mockResolvedValueOnce(respond(out));
    await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  }
});
it("exige a flag e HTTPS, sem fallback para o Python local",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch");
  vi.stubEnv("JPN_PURLIN_REMOTE_ENABLED","");
  await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"REMOTE_DISABLED"});
  vi.stubEnv("JPN_PURLIN_REMOTE_ENABLED","1");
  vi.stubEnv("JPN_MIXED_BACKEND_URL","http://engine.example.invalid");
  await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"CONFIGURATION"});
  expect(fetch).not.toHaveBeenCalled();
});
it("rejeita excesso, proteção negada e HTML inesperado",async()=>{
  const f=vi.spyOn(globalThis,"fetch").mockResolvedValue(respond({error:{code:"UNAUTHORIZED"}},401));
  await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"REMOTE_UNAUTHORIZED"});
  f.mockResolvedValueOnce(new Response("<html>Login</html>"));
  await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  f.mockResolvedValueOnce(new Response("x".repeat(remotePurlinLimits.outputBytes+1)));
  await expect(runRemotePurlin(input)).rejects.toMatchObject({code:"OUTPUT_LIMIT"});
});
const basic="Basic "+Buffer.from("operator:unique-long-password-for-test").toString("base64");
const route=(method:"POST"|"GET",headers:Record<string,string>={})=>
  new Request("https://jpn.example.invalid/api/experimental/purlin",{
    method,headers:{host:"jpn.example.invalid",authorization:basic,
      origin:"https://jpn.example.invalid",
      "Content-Type":"application/json","X-JPN-Purlin":"1",...headers},
    ...(method==="POST"?{body:payload()}:{})
  });
it("recusa origem externa e operador não autenticado antes do fetch",async()=>{
  const f=vi.spyOn(globalThis,"fetch");
  expect((await POST(route("POST",{authorization:""}))).status).toBe(401);
  expect((await POST(route("POST",{origin:"https://outsider.invalid"}))).status).toBe(403);
  expect(f).not.toHaveBeenCalled();
});
it("GET confirma operador e POST responde com cálculo real validado",async()=>{
  const f=vi.spyOn(globalThis,"fetch").mockResolvedValue(respond(envelope()));
  const login=await GET(route("GET"));
  expect(login.status).toBe(200);
  expect((await login.json()).status).toBe("authenticated");
  expect(f).not.toHaveBeenCalled();
  const out=await POST(route("POST"));
  // Include the structured error in the assertion so a transport regression
  // can be diagnosed without guessing whether the gate or verifier rejected it.
  expect(out.status,JSON.stringify(await out.clone().json())).toBe(200);
  expect(await out.json()).toEqual(pythonResult);
});
