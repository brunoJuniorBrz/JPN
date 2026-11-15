import {afterEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {structureSignature} from "./calculations/project-basis";
import {declareLocalAxes,AxisReviewPendingError} from "./local-axes-review";
import {adaptLoadedMixedProject,adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";
import {anyMixedResultSchema,verifyLoadingTrace} from "./structural-loading";
import {verifyMixedResult} from "./mixed-analysis";
import {POST} from "@/app/api/experimental/mixed3d/route";
import type {Project} from "./models";
afterEach(()=>vi.unstubAllEnvs());

const evidence=JSON.parse(readFileSync("validation/c1-local-axes/evidence.json","utf8")) as
  {azimuth_deg:number;rise_m:number;z_up_v3:{vertical_mm:number;lateral_mm:number;closed_form_iy_mm:number;closed_form_iz_mm:number}}[];

/** The C1 reference beam (6 m horizontal run, 100 N/m, Iy=8e-6, Iz=1e-6 m4, E=200 GPa, pinned ends, fixed supports),
 * expressed as a PHYSICAL project: two pieces joined at the mid node, azimuth in plan and rise (desnível) in mm. */
function c1Beam(azimuthDeg:number,riseMm:number):Project{
  const p=m34abProject(),a=azimuthDeg*Math.PI/180,x=(t:number)=>6000*Math.cos(a)*t,y=(t:number)=>6000*Math.sin(a)*t;
  const nodes=[{id:"A",x:0,y:0,z:3000},{id:"M",x:x(.5),y:y(.5),z:3000+riseMm/2},{id:"B",x:x(1),y:y(1),z:3000+riseMm}];
  p.workspace.physicalStructure=declaredStructureSchema.parse({schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    provenance:"Viga de referência C1 (solução fechada de Euler-Bernoulli)",revision:"C1 INT-1a",nodes,
    pieces:[{id:"B1",role:"purlin",start:"A",end:"M"},{id:"B2",role:"purlin",start:"M",end:"B"}]});
  const d=p.workspace.spatialPreparation!;
  const s1=d.physicalCatalog!.sections.find(s=>s.id==="S1")!;
  Object.assign(s1,{areaCm2:20,iyCm4:800,izCm4:100,jCm4:.1,sectionSource:"C1: A=2e-3 m2, Iy=8e-6 m4, Iz=1e-6 m4, J=1e-7 m4",sectionRevision:"1"});
  d.physicalCatalog!.assignments=["B1","B2"].map(pieceId=>({pieceId,materialId:"STEEL",sectionId:"S1",rotationDeg:0}));
  d.memberKinds=["B1","B2"].map(pieceId=>({pieceId,kind:"frame" as const}));
  d.memberConnections=[{pieceId:"B1",start:"bending-pinned",end:"rigid"},{pieceId:"B2",start:"rigid",end:"bending-pinned"}];
  const fixed:["fixed","fixed","fixed","fixed","fixed","fixed"]=["fixed","fixed","fixed","fixed","fixed","fixed"];
  d.supports=[{nodeId:"A",dofs:[...fixed]},{nodeId:"B",dofs:[...fixed]}];
  d.cases=[{id:"G",source:"Carga gravitacional uniforme da viga de referência C1"}];
  d.combinations=[{id:"C",factors:{G:1}}];d.loads=[];
  d.connectionsReview="Extremos rotulados à flexão, apoios fixos da referência C1";
  d.lateralSystem="Viga biapoiada isolada de referência";d.loadPathReview="Carga uniforme declarada diretamente nas barras";
  const src="C1: 100 N/m gravitacional";
  d.loading={version:1,selfWeight:null,roofArea:[],uniform:["B1","B2"].map(pieceId=>({id:"Q-"+pieceId,pieceId,caseId:"G",coordinates:"global" as const,knM:[0,0,-.1] as [number,number,number],source:src,revision:"1"}))};
  reviewM34Fixture(p);
  return p;
}
const withRolls=(p:Project,roll=0)=>declareLocalAxes(p,structureSignature(p),["B1","B2"].map(pieceId=>(
  {pieceId,rotationDeg:roll,source:"Giro revisado: Iy resiste ao plano vertical da barra (C1)",revision:"INT-1a v1"})));
const enable=()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");};
async function viaUiRoute(project:Project){
  const prepared=await adaptLoadedMixedProjectV3(project);
  // exactly what the UI does: POST the adapter request to the experimental route, then verify the response
  const response=await POST(new Request("http://localhost:3000/api/experimental/mixed3d",{method:"POST",
    headers:{origin:"http://127.0.0.1:3000",host:"127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify(prepared.request)}));
  const out=await response.json();
  expect(response.status,JSON.stringify(out)).toBe(200);
  const parsed=anyMixedResultSchema.parse(out.result);
  expect(parsed.schema_version).toBe("jpn.mixed3d-result/3");
  verifyMixedResult(prepared.request,parsed,prepared.input_sha256);verifyLoadingTrace(prepared.request,parsed);
  return {prepared,parsed};
}
const row=(az:number,rise:number)=>evidence.find(e=>e.azimuth_deg===az&&Math.abs(e.rise_m-rise)<1e-12)!;

it("viga a 90° com desnível: pela rota da UI (/3 → HTTP → PyNite) iguala a solução fechada da C1",async()=>{
  enable();
  const ref=row(90,.6).z_up_v3,{prepared,parsed}=await viaUiRoute(withRolls(c1Beam(90,600)));
  expect(prepared.request.schema_version).toBe("jpn.mixed3d/3");
  expect(prepared.request.local_axes).toBe("jpn-z-up/1");
  const uM=parsed.combinations.C.nodes.M.translation_m;
  expect(uM[2]*1000).toBeCloseTo(ref.vertical_mm,9);                      // vertical, same value the C1 evidence recorded for /3
  expect(Math.abs(uM[0])*1000).toBeLessThan(1e-9);   // plan azimuth 90°: the lateral (weak-axis) direction is global X
  expect(Math.abs(uM[2]*1000-ref.closed_form_iy_mm)/Math.abs(ref.closed_form_iy_mm)).toBeLessThan(2e-4);   // closed form with Iy
  expect(Math.abs(uM[2]*1000)).toBeLessThan(Math.abs(ref.closed_form_iz_mm)/5);                             // far from the weak-axis (Iz) value
  // axes trace: declared roll, solver roll and orthonormal basis for every frame member
  const axes=(parsed as {local_axes:{members:Record<string,{declared_rotation_deg:number;reference_offset_deg:number;solver_rotation_deg:number}>}}).local_axes.members;
  for(const id of Object.keys(axes)){expect(axes[id].declared_rotation_deg).toBe(0);expect(Math.abs(axes[id].reference_offset_deg)).toBeGreaterThan(80);}
},60000);
it("planta a 30° e 135°: mesmo valor da solução fechada (independe da direção global)",async()=>{
  enable();
  for(const az of [30,135]){
    const ref=row(az,.6).z_up_v3,{parsed}=await viaUiRoute(withRolls(c1Beam(az,600)));
    const uM=parsed.combinations.C.nodes.M.translation_m;
    expect(uM[2]*1000).toBeCloseTo(ref.vertical_mm,9);
    const lateral=Math.abs(-uM[0]*Math.sin(az*Math.PI/180)+uM[1]*Math.cos(az*Math.PI/180))*1000;
    expect(lateral).toBeLessThan(1e-9);
  }
},90000);
it("giro revisado de 90° gira a seção: a flexão passa ao eixo fraco (Iz) — o giro declarado é respeitado",async()=>{
  enable();
  const ref=row(90,.6).z_up_v3,{parsed}=await viaUiRoute(withRolls(c1Beam(90,600),90));
  const u=parsed.combinations.C.nodes.M.translation_m;
  expect(Math.abs(u[2]*1000-ref.closed_form_iz_mm)/Math.abs(ref.closed_form_iz_mm)).toBeLessThan(2e-4);
},60000);

it("projeto sem giro revisado NÃO migra em silêncio: pendência por peça; geometria alterada invalida a revisão",async()=>{
  const bare=c1Beam(90,600);
  await expect(adaptLoadedMixedProjectV3(bare)).rejects.toBeInstanceOf(AxisReviewPendingError);
  await expect(adaptLoadedMixedProjectV3(bare)).rejects.toThrow(/B1 \(missing\), B2 \(missing\)/);
  const reviewed=withRolls(bare);
  await expect(adaptLoadedMixedProjectV3(reviewed)).resolves.toBeDefined();
  const moved=structuredClone(reviewed);moved.workspace.physicalStructure!.nodes.find(n=>n.id==="B")!.z+=50;
  moved.workspace.spatialPreparation!.geometrySignature=structureSignature(moved);
  moved.workspace.spatialPreparation!.connectivity!.geometrySignature=structureSignature(moved);
  await expect(adaptLoadedMixedProjectV3(moved)).rejects.toThrow(/stale-geometry/);
  const partial=declareLocalAxes(bare,structureSignature(bare),[{pieceId:"B1",rotationDeg:0,source:"Giro revisado da viga B1",revision:"revisão v1"}]);
  await expect(adaptLoadedMixedProjectV3(partial)).rejects.toThrow(/B2 \(missing\)/);
  // the legacy /2 adapter is unchanged and does not read the review
  const legacy=await adaptLoadedMixedProject(bare);
  expect(legacy.request.schema_version).toBe("jpn.mixed3d/2");
});
it("o gêmeo /2 do mesmo modelo ambíguo é recusado pelo worker (guarda da C1) e o /3 tem hash distinto",async()=>{
  enable();
  const legacy=await adaptLoadedMixedProject(c1Beam(90,600)),v3=await adaptLoadedMixedProjectV3(withRolls(c1Beam(90,600)));
  expect(legacy.input_sha256).not.toBe(v3.input_sha256);
  const response=await POST(new Request("http://localhost:3000/api/experimental/mixed3d",{method:"POST",
    headers:{origin:"http://127.0.0.1:3000",host:"127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify(legacy.request)}));
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(await response.json())).toContain("AXIS_CONVENTION_AMBIGUOUS");
},60000);
