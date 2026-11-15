import {afterEach,expect,it,vi} from "vitest";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {buildingProject} from "./test-support/m41-building-fixture";
import {buildNormativeFacadeTraction} from "./wind-facade-normative";
import {applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";
import {declareLocalAxes} from "./local-axes-review";
import {projectFrameAxes} from "./current-mixed-adapter";
import {selfWeightOverlapReviewBasis,anyMixedRequestSchema,loadedMixedRequestV3Schema} from "./structural-loading";
import {verifyMixedResult} from "./mixed-analysis";
import {combinationLimit,bytesPerCombination,MAX_CASES,MAX_COMBINATIONS,OUTPUT_BYTES} from "./analysis-limits";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import type {Project} from "./models";
afterEach(()=>vi.unstubAllEnvs());

const python=()=>{const portable=path.resolve(".tools/python/python.exe");return process.env.JPN_PYTHON_EXECUTABLE||(existsSync(portable)?portable:path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python"));};
const enable=()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");};

it("o limite derivado do TypeScript é igual ao do motor Python (mesma regra local e remota)",()=>{
  const cases:[number,number,number,number,number][]=[[4,3,0,2,0],[16,16,0,16,0],[132,207,36,0,0],[150,320,0,640,320],[120,119,0,2,0],[2,1,0,0,0],[60,40,100,30,0]];
  const script="import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom jpn_structural.analysis_limits import combination_limit,bytes_per_combination,OUTPUT_BYTES,MAX_CASES,MAX_COMBINATIONS\n"+
    "rows=json.loads(sys.stdin.read())\nprint(json.dumps(dict(limits=[combination_limit(*r) for r in rows],bytes=[bytes_per_combination(*r[:3]) for r in rows],output=OUTPUT_BYTES,cases=MAX_CASES,combos=MAX_COMBINATIONS)))";
  const py=JSON.parse(execFileSync(python(),["-I","-X","utf8","-c",script,path.resolve("engine")],{input:JSON.stringify(cases),encoding:"utf8"}));
  expect(cases.map(c=>combinationLimit(...c))).toEqual(py.limits);
  expect(cases.map(c=>bytesPerCombination(c[0],c[1],c[2]))).toEqual(py.bytes);
  expect([OUTPUT_BYTES,MAX_CASES,MAX_COMBINATIONS]).toEqual([py.output,py.cases,py.combos]);
  expect(combinationLimit(132,207,36)).toBeLessThan(10);          // a very large model is bounded by the 2 MB output cap, not by a count
});

const si=(id:string)=>({schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:10,heightM:4,heightReference:"model-base-z0",topography:"flat-or-gently-undulating",
  roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"5",source:"Dados sintéticos "+id,revision:"v1",responsible:"Responsável de referência"}});

function shed():{project:Project;ids:string[]}{
  const winds=["W1","W2","W3","W4"],ids=["G","Q",...winds],p=buildingProject(ids);
  const traction=buildNormativeFacadeTraction(p,{schema_version:"jpn.nbr6123-wall-wind/2",
    building:{longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true,heightDefinitionConfirmed:true},speed:si("INT-1c"),
    cases:[["W1","+X"],["W2","-X"],["W3","+Y"],["W4","-Y"]].map(([id,windFrom])=>({id,windFrom,internalPressure:{rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"}}))});
  const src="Carga sintética do ensaio INT-1c",rev="INT-1c v1";
  const uniform=[0,1,2,3,4,5,6,7].flatMap(i=>[
    {id:"G-TOP"+i,pieceId:"TOP"+i,caseId:"G",coordinates:"global" as const,knM:[0,0,-.5] as [number,number,number],source:src,revision:rev},
    {id:"Q-TOP"+i,pieceId:"TOP"+i,caseId:"Q",coordinates:"global" as const,knM:[0,0,-.75] as [number,number,number],source:src,revision:rev}]);
  p.workspace.spatialPreparation!.loading={version:1,selfWeight:null,uniform,roofArea:[],facadeTraction:traction.traction};
  const {project}=applyNbr8681Combinations(p,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets:["unfavorable","favorable"],families:["uls-normal","sls-quasi-permanent","sls-frequent","sls-rare"],
    actions:[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
      {nature:"variable",caseId:"Q",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null},
      ...winds.map(caseId=>({nature:"variable",caseId,variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"}))]});
  const sp=project.workspace.spatialPreparation!;
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio INT-1c: ações independentes",revision:rev,basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  const a=projectFrameAxes(project);
  return {project:declareLocalAxes(project,a.signature,a.framePieceIds.map(pieceId=>({pieceId,rotationDeg:0,source:"Giro revisado do ensaio INT-1c (Iy = Iz)",revision:rev}))),ids};
}

it("galpão com 30+ combinações (ELU e ELS, 4 ventos, 2 conjuntos de permanentes) em UMA execução, mesmo hash, equilíbrio em todas",async()=>{
  enable();
  const {project}=shed(),prepared=await adaptLoadedMixedProjectV3(project),count=prepared.request.combinations.length;
  expect(count).toBeGreaterThanOrEqual(30);
  expect(count).toBeLessThanOrEqual(combinationLimit(prepared.request.nodes.length,prepared.request.members.filter(m=>m.kind==="frame").length,prepared.request.members.filter(m=>m.kind==="axial").length,
    prepared.request.member_loads.length,0));
  const payload=JSON.stringify(prepared.request);
  expect(Buffer.byteLength(payload)).toBeLessThan(500_000);
  const out=await runLocalMixed(payload);
  if(out.status!=="completed")throw Error("PyNite não analisou");
  expect(Object.keys(out.result.combinations)).toHaveLength(count);
  expect(out.result.input_sha256).toBe(prepared.input_sha256);
  verifyMixedResult(prepared.request,out.result,prepared.input_sha256);
  for(const c of Object.values(out.result.combinations))expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(Buffer.byteLength(JSON.stringify(out.result))).toBeLessThan(OUTPUT_BYTES);
  // per-combination resolution is accepted by the contract and, in this linear engine, gives the same numbers
  const per=loadedMixedRequestV3Schema.parse({...prepared.request,solution_mode:"per-combination"});
  expect(anyMixedRequestSchema.parse(per).schema_version).toBe("jpn.mixed3d/3");
  const outPer=await runLocalMixed(JSON.stringify(per));
  if(outPer.status!=="completed")throw Error("modo por combinação não executou");
  expect(outPer.result.input_sha256).not.toBe(out.result.input_sha256);            // the mode is part of the hashed request
  for(const id of Object.keys(out.result.combinations))
    for(const [nid,n] of Object.entries(out.result.combinations[id].nodes))
      n.reaction_force_n.forEach((v,i)=>expect(Math.abs(v-outPer.result.combinations[id].nodes[nid].reaction_force_n[i])).toBeLessThanOrEqual(1e-6*Math.max(1,Math.abs(v))));
},300000);
it("acima do limite derivado, o adaptador/contrato recusa com mensagem acionável (nada é descartado em silêncio)",async()=>{
  const {project}=shed(),prepared=await adaptLoadedMixedProjectV3(project);
  const q=structuredClone(prepared.request),allowed=combinationLimit(q.nodes.length,q.members.length,0,q.member_loads.length,0);
  const template=q.combinations[0];
  q.combinations=Array.from({length:allowed+1},(_,i)=>({...template,id:"X"+String(i).padStart(3,"0")}));
  expect(allowed).toBeLessThan(MAX_COMBINATIONS+1);
  expect(()=>loadedMixedRequestV3Schema.parse(q)).toThrow(/limite|256|too big/i);
});
