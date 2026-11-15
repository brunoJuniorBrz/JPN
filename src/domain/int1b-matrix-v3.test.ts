import {afterEach,expect,it,vi} from "vitest";
import {execFileSync} from "node:child_process";
import {existsSync,writeFileSync} from "node:fs";
import path from "node:path";
import {roofProject} from "./test-support/m42-roof-fixture";
import {applyNbr6120Actions} from "./nbr6120-actions";
import {applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProject,adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";
import {declareLocalAxes} from "./local-axes-review";
import {projectFrameAxes} from "./current-mixed-adapter";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {buildResistanceReport} from "./resistance-report";
import {buildMemberCombinationMatrix,fitSegmentForceField} from "./member-combination-matrix";
import type {DesignExecution,ResistanceStandard} from "./member-combination-matrix";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import type {Project} from "./models";
afterEach(()=>vi.unstubAllEnvs());

/** INT-1b: the real chain NBR 6120 -> NBR 8681 -> PyNite -> NBR 8800 -> piece x ULS-combination matrix,
 * once through the legacy /2 contract and once through /3 (reviewed Z-up axes). */
const python=()=>{const portable=path.resolve(".tools/python/python.exe");return process.env.JPN_PYTHON_EXECUTABLE||(existsSync(portable)?portable:path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python"));};
const SCRIPT="import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom jpn_structural.steel_i_design import analyze_steel_i_design\nprint(json.dumps(analyze_steel_i_design(json.load(sys.stdin))))";
const design=(request:unknown)=>JSON.parse(execFileSync(python(),["-I","-X","utf8","-c",SCRIPT,path.resolve("engine")],{input:JSON.stringify(request),encoding:"utf8",windowsHide:true}));
const SECTION={family:"welded",shape:"i-h-doubly-symmetric",d_m:.4,bf_m:.2,tf_m:.016,tw_m:.008,fy_pa:345e6,fu_pa:450e6,e_pa:200e9,g_pa:77e9,properties:null,fillet_radius_m:null,
  source:"Seção I soldada sintética explícita do ensaio INT-1b, não comercial",revision:"1"};
const enable=()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");};

function buildProject(anisotropic:boolean):Project{
  const r6=applyNbr6120Actions(roofProject(),{schema_version:"jpn.nbr6120-roof-actions/1",
    permanent:[{kind:"roof-cladding",caseId:"TELHA",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"}],roofLiveLoad:{caseId:"SC"}});
  const {project}=applyNbr8681Combinations(r6.project,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets:["unfavorable"],families:["uls-normal"],actions:[{nature:"permanent",caseId:"ZERO",permanentType:"steel-and-equipment"},...r6.nbr8681Actions]});
  const sp=project.workspace.spatialPreparation!;
  if(anisotropic){const s1=sp.physicalCatalog!.sections.find(s=>s.id==="S1")!;Object.assign(s1,{iyCm4:800,izCm4:100});}
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio INT-1b: ações independentes",revision:"INT-1b v1",basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  return project;
}
const withAxes=(p:Project)=>{const a=projectFrameAxes(p);return declareLocalAxes(p,a.signature,a.framePieceIds.map(pieceId=>(
  {pieceId,rotationDeg:0,source:"Giro revisado: Iy no plano vertical da barra (ensaio INT-1b)",revision:"INT-1b v1"})));};

async function matrixFor(project:Project,contract:"v2"|"v3"){
  const prepared=contract==="v3"?await adaptLoadedMixedProjectV3(project):await adaptLoadedMixedProject(project);
  const solved=await runLocalMixed(JSON.stringify(prepared.request));
  if(solved.status!=="completed")throw Error("PyNite não analisou");
  const maxVertical=Math.max(...Object.values(solved.result.combinations).flatMap(c=>Object.values(c.nodes).map(n=>Math.abs(n.translation_m[2]))));
  const demands=(await buildResistanceReport(project,prepared,solved.result)).demands;
  const sp=project.workspace.spatialPreparation!,uls=sp.engineeringCombinations!.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id);
  const executions:DesignExecution[]=[];
  for(const piece of demands.pieces)for(const cid of uls){
    const fields=piece.segments.map(seg=>{
      const rows=piece.samples.filter(s=>s.segmentId===seg.id&&s.combinationId===cid).sort((a,b)=>a.stationIndex-b.stationIndex);
      return {segment_id:seg.id,offset_m:seg.t0*piece.lengthM,length_m:seg.lengthMm/1000,forces:fitSegmentForceField(rows.map((r,i)=>({u:i/(rows.length-1),forces:r.forces})))};
    });
    const result=design({schema_version:"jpn.steel-i-design/1",units:"SI",piece_id:piece.pieceId,combination_id:cid,combination_kind:"normal",
      binding:{mechanical_sha256:"a".repeat(64),analysis_input_sha256:demands.binding.inputSha256,analysis_result_sha256:demands.binding.resultSha256},
      section:{...SECTION,effective_length_x_m:piece.lengthM,effective_length_y_m:piece.lengthM,effective_length_z_m:piece.lengthM,unbraced_length_m:piece.lengthM},
      tension:{basis:"no-holes-all-elements-connected",source:"Sem furos (ensaio)",revision:"1"},web:{transverse_stiffener_spacing_m:null},fields});
    executions.push({pieceId:piece.pieceId,combinationId:cid,checks:result.checks});
  }
  const pieceStandards:Record<string,ResistanceStandard>=Object.fromEntries(demands.pieces.map(p=>[p.pieceId,"NBR8800" as const]));
  const matrix=buildMemberCombinationMatrix({engineeringCombinations:sp.engineeringCombinations!,demands,executions,pieceStandards});
  const equilibrium=Math.max(...Object.values(solved.result.combinations).map(c=>c.equilibrium.relative_residual));
  return {schema:prepared.request.schema_version,maxVerticalM:maxVertical,equilibrium,rows:matrix.rows.map(r=>({piece:r.pieceId,combination:r.combinationId,status:r.status,
    maxUtilization:r.maxUtilization,my:r.demand?.myNm?.absoluteMax??null,vz:r.demand?.vzN?.absoluteMax??null,checks:r.executedChecks.map(c=>c.id)}))};
}

it("INT-1b: cadeia real NBR 6120 → 8681 → PyNite → 8800 com /3: matriz /3 idêntica à do /2 (seções isotrópica e anisotrópica; modelo sem barras ambíguas)",async()=>{
  enable();
  const iso=buildProject(false),a2=await matrixFor(iso,"v2"),a3=await matrixFor(withAxes(iso),"v3");
  expect([a2.schema,a3.schema]).toEqual(["jpn.mixed3d/2","jpn.mixed3d/3"]);
  expect(a3.rows).toHaveLength(a2.rows.length);
  for(const [i,r3] of a3.rows.entries()){
    const r2=a2.rows[i];
    expect([r3.piece,r3.combination,r3.status,r3.checks.join()]).toEqual([r2.piece,r2.combination,r2.status,r2.checks.join()]);
    for(const k of ["maxUtilization","my","vz"] as const)
      if(r2[k]!==null)expect(Math.abs((r3[k] as number)-(r2[k] as number))).toBeLessThanOrEqual(1e-9*Math.max(1,Math.abs(r2[k] as number)));
  }
  expect(Math.abs(a3.maxVerticalM-a2.maxVerticalM)).toBeLessThan(1e-12);
  // anisotropic section (Iy=800 cm4, Iz=100 cm4). Every member here has a zero reference offset (horizontal purlins along Y, chords along X
  // with rise), so the legacy worker guard does not refuse /2 and /3 must reproduce it exactly: the reviewed axes change nothing where /2 was already right.
  const aniso=buildProject(true),b2=await matrixFor(aniso,"v2"),b3=await matrixFor(withAxes(aniso),"v3");
  expect(b3.equilibrium).toBeLessThan(1e-8);
  expect(Math.abs(b3.maxVerticalM-b2.maxVerticalM)).toBeLessThan(1e-12);
  for(const [i,r3] of b3.rows.entries()){
    const r2=b2.rows[i];
    expect([r3.piece,r3.combination,r3.status]).toEqual([r2.piece,r2.combination,r2.status]);
    for(const k of ["maxUtilization","my","vz"] as const)if(r2[k]!==null)expect(Math.abs((r3[k] as number)-(r2[k] as number))).toBeLessThanOrEqual(1e-9*Math.max(1,Math.abs(r2[k] as number)));
  }
  if(process.env.JPN_WRITE_INT1B==="1")writeFileSync(path.resolve("validation/int-1b-matrix-v2-vs-v3.json"),JSON.stringify({isotropic_v2:a2,isotropic_v3:a3,anisotropic_v2:b2,anisotropic_v3:b3,
    note:"Em ambos os casos /2 e /3 coincidem: todas as barras deste modelo têm deslocamento de referência nulo (terças horizontais ao longo de Y, banzos ao longo de X), logo a guarda da C1 não recusa o /2 e o /3 reproduz o mesmo valor."},null,1)+"\n");
},300000);
