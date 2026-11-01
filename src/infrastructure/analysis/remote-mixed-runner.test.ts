import { afterEach,beforeAll,beforeEach,expect,it,vi } from "vitest";
import { execFileSync,spawn } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { anyMixedRequestSchema } from "@/domain/structural-loading";
import { runRemoteMixed,remoteMixedLimits } from "./remote-mixed-runner";
import { GET,POST } from "@/app/api/experimental/mixed3d/route";

let model:ReturnType<typeof anyMixedRequestSchema.parse>,v2:ReturnType<typeof anyMixedRequestSchema.parse>,result:Record<string,unknown>,result2:Record<string,unknown>;
const python=()=>process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
const execution={memory_limit_bytes:805306368,memory_kind:"windows-job-process-commit",timeout_seconds:20,concurrency_per_instance:1,isolation:"subprocess"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const body=()=>JSON.stringify(model);
const response=()=>({schema_version:"jpn.http-mixed/1",request_sha256:createHash("sha256").update(body()).digest("hex"),result:structuredClone(result),execution:{...execution}});
beforeAll(()=>{
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const code="import importlib.util,json,sys;s=importlib.util.spec_from_file_location('smoke',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps([m.small_v1(),m.small_v2()]))";
  const models=JSON.parse(execFileSync(python,["-I","-X","utf8","-c",code,path.resolve("scripts/smoke-mixed-remote.py")],{encoding:"utf8",windowsHide:true}));
  model=anyMixedRequestSchema.parse(models[0]);v2=anyMixedRequestSchema.parse(models[1]);
  const solve=(m:unknown)=>JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(m),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},maxBuffer:2000000})).result;
  result=solve(model);result2=solve(v2);
},15000);
beforeEach(()=>{
  vi.stubEnv("NODE_ENV","test");vi.stubEnv("JPN_MIXED_REMOTE_ENABLED","1");vi.stubEnv("JPN_MIXED_BACKEND_URL","https://engine.example.invalid");vi.stubEnv("JPN_ANALYSIS_TOKEN","unit-private-backend-token");vi.stubEnv("JPN_MIXED_APP_ORIGIN","https://jpn.example.invalid");vi.stubEnv("JPN_MIXED_ACCESS_USER","operator");vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD","unit-operator-password-unique");
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();});
it("valida corpo bruto/canônico e resposta produzida pelo Python real; token só no servidor",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(json(response()));
  const out=await runRemoteMixed(body());if(out.status!=="completed")throw new Error();
  expect(out.result).toEqual(result);expect(out.execution.local_only).toBe(false);
  const [url,options]=fetch.mock.calls[0];expect(url).toBe("https://engine.example.invalid/api/analyze-mixed");expect(options?.redirect).toBe("error");expect(options?.headers).toMatchObject({Authorization:"Bearer unit-private-backend-token"});
  expect(JSON.stringify(out)).not.toContain("unit-private-backend-token");
});
it("valida v2 sem cargas nodais, inclusive rastreabilidade do peso e bypass opcional",async()=>{
  vi.stubEnv("JPN_MIXED_DEPLOYMENT_BYPASS_SECRET","unit-bypass");const payload=JSON.stringify(v2);
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(json({...response(),request_sha256:createHash("sha256").update(payload).digest("hex"),result:result2}));
  const out=await runRemoteMixed(payload);expect(out.status).toBe("completed");expect(fetch.mock.calls[0][1]?.headers).toMatchObject({"x-vercel-protection-bypass":"unit-bypass"});expect(JSON.stringify(out)).not.toContain("unit-bypass");
});
it("preserva exigência nodal v1 e rejeita v2 sem qualquer ação física",()=>{
  expect(anyMixedRequestSchema.safeParse({...model,nodal_loads:[]}).success).toBe(false);
  expect(anyMixedRequestSchema.safeParse(v2).success).toBe(true);
  expect(anyMixedRequestSchema.safeParse({...v2,member_loads:[],self_weight:null}).success).toBe(false);
});
it.each(["raw-hash","canonical-hash","project","nodes","units","version","execution"])("recusa integridade adulterada: %s",async kind=>{
  const value=response();const r=value.result as typeof value.result & {input_sha256:string;project:{id:string};combinations:Record<string,{nodes:Record<string,unknown>}>;units:string;schema_version:string};
  if(kind==="raw-hash")value.request_sha256="0".repeat(64);
  if(kind==="canonical-hash")r.input_sha256="0".repeat(64);
  if(kind==="project")r.project.id="other";
  if(kind==="nodes")delete r.combinations.LC.nodes.B;
  if(kind==="units")r.units="mm";
  if(kind==="version")r.schema_version="jpn.mixed3d-result/2";
  if(kind==="execution")value.execution.memory_limit_bytes=1;
  vi.spyOn(globalThis,"fetch").mockResolvedValue(json(value));await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"INVALID_RESPONSE"});
});
it.each([401,403,503])("trata HTTP %i sem fallback local ou credenciais na mensagem",async status=>{
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.spyOn(globalThis,"fetch").mockResolvedValue(json({error:{code:"UNAVAILABLE"}},status));
  await expect(runRemoteMixed(body())).rejects.toMatchObject({code:status===401?"REMOTE_UNAUTHORIZED":status===403?"REMOTE_FORBIDDEN":"UNAVAILABLE"});
});
it("recusa HTML, excesso de saída e excesso de entrada",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("<html>login</html>"));await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  fetch.mockResolvedValue(new Response("x".repeat(2000001)));await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"OUTPUT_LIMIT"});
  await expect(runRemoteMixed(" ".repeat(500001))).rejects.toMatchObject({code:"INPUT_LIMIT"});
});
it("timeout cobre também leitura pendente; cancela stream e não publica resultado",async()=>{
  vi.useFakeTimers();const cancel=vi.fn();vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(new ReadableStream({cancel})));
  const pending=runRemoteMixed(body()),observed=expect(pending).rejects.toMatchObject({code:"TIMEOUT"});await vi.advanceTimersByTimeAsync(remoteMixedLimits.milliseconds);await observed;expect(cancel).toHaveBeenCalled();
});
it("cancelamento descarta resposta atrasada e impede duas consultas simultâneas",async()=>{
  let release!:(r:Response)=>void;vi.spyOn(globalThis,"fetch").mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const controller=new AbortController(),pending=runRemoteMixed(body(),"analysis",controller.signal),observed=expect(pending).rejects.toMatchObject({code:"CANCELLED"});
  await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"BUSY"});controller.abort();await observed;release(json(response()));
});
const authorization="Basic "+Buffer.from("operator:unit-operator-password-unique").toString("base64");
function routeRequest(post=false,patch:Record<string,string>={}){return new Request("https://jpn.example.invalid/api/experimental/mixed3d",{method:post?"POST":"GET",headers:{host:"jpn.example.invalid",authorization,origin:"https://jpn.example.invalid","Content-Type":"application/json","X-JPN-Request":"1",...patch},...(post?{body:body()}:{})});}
it("flag não autentica usuário; autenticação e origem são verificadas antes de fetch",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch");expect((await GET(routeRequest(false,{authorization:""}))).status).toBe(401);expect((await POST(routeRequest(true,{origin:"https://foreign.invalid"}))).status).toBe(403);expect(fetch).not.toHaveBeenCalled();
  const login=await GET(routeRequest(false,{"X-JPN-Request":""}));expect((await login.json()).status).toBe("authenticated");expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD","");expect((await GET(routeRequest())).status).toBe(503);
});
it("rota remota permite resultado validado e health sem vazar segredos",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(json(response()));const r=await POST(routeRequest(true));expect(r.status).toBe(200);expect((await r.json()).execution.local_only).toBe(false);
  fetch.mockResolvedValue(json({schema_version:"jpn.http-mixed/1",status:"ready",contracts:["jpn.mixed3d/1","jpn.mixed3d/2"],dependencies:{python:"3.12",PyNiteFEA:"3.2.1",numpy:"real",scipy:"real"},execution}));expect((await GET(routeRequest())).status).toBe(200);
});
it("modo remoto é opt-in, exige HTTPS/credenciais e nunca cai em local",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch");vi.stubEnv("JPN_MIXED_REMOTE_ENABLED","");await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"REMOTE_DISABLED"});
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED","1");vi.stubEnv("JPN_MIXED_BACKEND_URL","http://other.invalid");await expect(runRemoteMixed(body())).rejects.toMatchObject({code:"CONFIGURATION"});expect(fetch).not.toHaveBeenCalled();
});
it("Next → HTTP WSGI → worker Python real: v1/v2, referências independentes, health e autenticação",async()=>{
  // Real loopback HTTP transport; this is local evidence, never Vercel evidence.
  const code="import sys;sys.path.insert(0,sys.argv[1]);from wsgiref.simple_server import make_server;from app import app;s=make_server('127.0.0.1',0,app);print(s.server_port,flush=True);s.serve_forever()";
  const server=spawn(python(),["-I","-X","utf8","-c",code,path.resolve("engine")],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}});
  // Drain stderr without printing requests or credentials.
  server.stderr.resume();
  try{
    const port=await new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("WSGI startup timeout")),5000);
      server.once("error",e=>{clearTimeout(timer);reject(e);});
      server.stdout.once("data",b=>{clearTimeout(timer);resolve(Number(b.toString().trim()));});
      server.once("exit",()=>{clearTimeout(timer);reject(new Error("WSGI exited"));});
    });
    vi.stubEnv("JPN_MIXED_BACKEND_URL",`http://127.0.0.1:${port}`);
    const denied=await fetch(`http://127.0.0.1:${port}/health`);expect(denied.status).toBe(401);
    expect((await GET(routeRequest())).status).toBe(200);
    for(const input of [model,v2]){
      const payload=JSON.stringify(input),request=new Request(routeRequest(true),{body:payload});
      const http=await POST(request);expect(http.status).toBe(200);
      const out=await http.json();expect(out.execution).toMatchObject({local_only:false,transport:"remote"});
      const reference="import importlib.util,json,sys;s=importlib.util.spec_from_file_location('smoke',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p,r=json.load(sys.stdin);m.validate_reference('small_v1' if p['schema_version'].endswith('/1') else 'small_v2',r);print('independent references passed')";
      expect(execFileSync(python(),["-I","-X","utf8","-c",reference,path.resolve("scripts/smoke-mixed-remote.py")],{input:JSON.stringify([input,out.result]),encoding:"utf8",windowsHide:true})).toContain("independent references passed");
    }
  }finally{
    if(server.exitCode===null){const stopped=new Promise<void>(resolve=>server.once("exit",()=>resolve()));server.kill();await stopped;}
  }
},20000);
