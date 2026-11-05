import { afterEach,expect,it,vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createQuickProject } from "./quick-project";
import { generatedRoofRegions,distributeRoofActions,type RoofAreaAction } from "./roof-load-path";
import { roofRegionsSchema,regionVertices } from "./roof-regions";
import { structureSignature } from "./calculations/project-basis";
import { generateStructure } from "./calculations/structure";
import { roofAreaReferenceProject } from "./examples/roof-area-project";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { adaptMixedProject } from "./mixed-adapter";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { mixedInputHash,verifyMixedResult } from "./mixed-analysis";
import { anyMixedRequestSchema,verifyLoadingTrace,selfWeightOverlapReviewBasis,needsSelfWeightOverlapReview } from "./structural-loading";
import { projectSchema } from "./models";
import { newSpatialPreparation } from "./spatial-preparation";
import { parseBackup,serializeBackup } from "@/infrastructure/persistence/local";
import { emptySnapshot } from "./models";

afterEach(()=>vi.unstubAllEnvs());
const action=(patch:Partial<RoofAreaAction>={}):RoofAreaAction=>({caseId:"AREA",knM2:.2,projection:"horizontal",direction:[0,0,-1],source:"Independent synthetic test",revision:"1",loadPath:"Planar sheeting to parallel frame purlins to explicitly reviewed joints",...patch});
function rectangle(){const p=createQuickProject({typology:"mono",widthM:6,lengthM:8,heightM:3,slopePercent:25});p.planning!.purlinSpacingM=2.1;return p;}
const method=(p:ReturnType<typeof rectangle>)=>({version:1,method:"parallel-purlin-strips",geometrySignature:structureSignature(p)});
function closeVector(a:number[],b:number[],digits=8){a.forEach((x,i)=>expect(x).toBeCloseTo(b[i],digits));}

it("retângulo: faixas extremas 1 m, internas 2 m, resultante e momentos independentes",()=>{
  const p=rectangle(),a=distributeRoofActions(p,[action()],method(p)).actions[0];
  expect(a.areaM2).toBe(48);expect(a.distributedAreaM2).toBe(48);
  expect([...new Set(a.contributions.map(c=>c.widthProjectedM))]).toEqual([1,2]);
  const exterior=a.loads.filter(l=>l.pieceId.startsWith("TE1-"));expect(exterior).toHaveLength(2);exterior.forEach(l=>closeVector(l.forcePerLengthNM,[0,0,-200]));
  a.loads.filter(l=>l.pieceId.startsWith("TE2-")).forEach(l=>closeVector(l.forcePerLengthNM,[0,0,-400]));
  closeVector(a.distributedForceN,[0,0,-9600]);closeVector(a.distributedMomentNm,[-38400,28800,0]);
});
it("área inclinada é medida física e balanços longitudinais integram faixas e braços",()=>{
  const p=rectangle();p.planning!.overhangStartM=1;p.planning!.overhangEndM=2;
  const horizontal=distributeRoofActions(p,[action()],method(p)).actions[0],surface=distributeRoofActions(p,[action({projection:"roof-surface"})],method(p)).actions[0];
  expect(horizontal.areaM2).toBe(66);closeVector(horizontal.distributedForceN,[0,0,-13200]);closeVector(horizontal.distributedMomentNm,[-59400,39600,0]);
  expect(surface.areaM2).toBeCloseTo(66*Math.sqrt(1+.25**2),10);
  surface.distributedForceN.forEach((x,i)=>expect(x).toBeCloseTo(horizontal.distributedForceN[i]*Math.sqrt(1+.25**2),8));
});
it.each(["width-positive","width-negative","length-positive","length-negative"] as const)("conserva força e braços globais no sentido %s",fall=>{
  const p=rectangle();p.roof.fall=fall;
  for(const typology of ["mono","gable"] as const){p.planning!.typology=typology;
    const a=distributeRoofActions(p,[action({direction:[.6,0,-.8]})],method(p)).actions[0];
    const z=typology==="mono"?3+(fall.startsWith("width")?6:8)*.25/2:3+(fall.startsWith("width")?6:8)*.25/4;
    const f=[5760,0,-7680];closeVector(a.distributedForceN,f);closeVector(a.distributedMomentNm,[4*f[2],z*f[0]-3*f[2],-4*f[0]]);
  }
});
it("cumeeira recebe duas meias faixas disjuntas em uma única carga por peça",()=>{
  const p=roofAreaReferenceProject(),trace=distributeRoofActions(p,p.workspace.spatialPreparation!.loading!.roofArea,method(p));
  expect(trace.regions.regions).toHaveLength(2);const a=trace.actions[0];expect(a.areaM2).toBe(200);
  const ridge=a.loads.filter(l=>l.pieceId.startsWith("TE5-"));expect(ridge).toHaveLength(5);
  ridge.forEach(l=>{expect(a.contributions.filter(c=>c.pieceId===l.pieceId)).toHaveLength(2);closeVector(l.forcePerLengthNM,[0,0,-125]);});
  closeVector(a.distributedMomentNm,[-200000,100000,0]);
});
it("inversão e zero explícito; não presume direção ou dados ausentes",()=>{
  const p=rectangle(),up=distributeRoofActions(p,[action({direction:[0,0,1]})],method(p)).actions[0];closeVector(up.distributedForceN,[0,0,9600]);
  const zero=distributeRoofActions(p,[action({knM2:0})],method(p)).actions[0];expect(zero.loads.length).toBeGreaterThan(0);closeVector(zero.distributedForceN,[0,0,0]);
  for(const direction of [[0,0,0],[0,0,-2],[NaN,0,-1]] as [number,number,number][])expect(()=>distributeRoofActions(p,[action({direction})],method(p))).toThrow(/ROOF_ACTION_INVALID/);
  expect(()=>distributeRoofActions(p,[action({knM2:-1})],method(p))).toThrow(/ROOF_ACTION_INVALID/);
  expect(()=>distributeRoofActions(p,[action({knM2:1e308})],method(p))).toThrow(/ROOF_CONSERVATION/);
  expect(()=>distributeRoofActions(p,[action()],null)).toThrow(/ROOF_LOAD_PATH_PENDING/);
  const original=method(p);p.roof.widthM=7;expect(()=>distributeRoofActions(p,[action()],original)).toThrow(/STALE_ROOF_LOAD_PATH/);
});

const region=(id:string,boundsM:[number,number,number,number],z0M=3)=>({id,boundsM,plane:{z0M,dzDx:0,dzDy:0},purlinPieceIds:[],source:"Declared test geometry",revision:"1"});
const compound=()=>({schema_version:"jpn.roof-regions/1",units:"m",footprintM:[[0,0,4,2],[0,2,2,4]],regions:[region("R1",[0,0,4,2]),region("R2",[0,2,2,4])]});
it("regiões adjacentes e composição em L preservam o vazio, planos e backup",async()=>{
  const c=roofRegionsSchema.parse(compound());expect(c.regions.map(r=>regionVertices(r))).toHaveLength(2);
  const p=roofAreaReferenceProject();p.workspace.spatialPreparation!.roofRegions=c;
  expect(projectSchema.parse(p).workspace.spatialPreparation!.roofRegions).toEqual(c);
  expect(parseBackup(serializeBackup({...emptySnapshot(),projects:[p]})).data.projects[0].workspace.spatialPreparation!.roofRegions).toEqual(c);
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/COMPOSED_ROOF_PRELIMINARY/);
  await expect(adaptMixedProject(p)).rejects.toThrow(/COMPOSED_ROOF_PRELIMINARY/);
});
it("recusa sobreposição, lacunas, planos incompatíveis e a planta real sem elevações",()=>{
  const overlap=compound();overlap.regions[1].boundsM=[0,1,2,4];expect(()=>roofRegionsSchema.parse(overlap)).toThrow(/ROOF_OVERLAP/);
  const hole=compound();hole.regions[1].boundsM=[0,2,1,4];expect(()=>roofRegionsSchema.parse(hole)).toThrow(/ROOF_GAP/);
  const seam=compound();seam.regions[1].plane.z0M=4;expect(()=>roofRegionsSchema.parse(seam)).toThrow(/ROOF_SEAM/);
  const duplicate=compound();duplicate.regions[1].id="R1";expect(()=>roofRegionsSchema.parse(duplicate)).toThrow(/DUPLICATE_REGION/);
  // Observed dimensions in the client's drawing are not coordinates or planes.
  expect(roofRegionsSchema.safeParse({schema_version:"jpn.roof-regions/1",units:"m",observedDimensionsM:[5.38,14.28,3.78,2.71]}).success).toBe(false);
});
it("valida a geometria associada sem substituir uma borda ausente por carga fictícia",()=>{
  const p=rectangle(),m=generateStructure(p).model!;
  m.pieces=m.pieces.filter(piece=>!piece.id.startsWith("TE1-"));expect(()=>generatedRoofRegions(p,m)).toThrow(/ROOF_BOUNDARY_ROW/);
});
it("mantém o caso de área exclusivo e revoga revisão de duplicidade após editar a ação",async()=>{
  const p=roofAreaReferenceProject(),d=p.workspace.spatialPreparation!,l=d.loading!;
  l.roofArea.push({...l.roofArea[0]});await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/ROOF_DOUBLE_COUNT/);l.roofArea.pop();
  d.loads=[{id:crypto.randomUUID(),nodeId:generateStructure(p).model!.nodes[0].id,caseId:"AREA",fxKn:0,fyKn:0,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0}];await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/ROOF_DOUBLE_COUNT/);
  d.loads[0].caseId="MANUAL";d.cases.push({id:"MANUAL",source:"Separate explicitly declared test load"});d.combinations=[{id:"TOTAL",factors:{AREA:1,MANUAL:1}}];
  expect(needsSelfWeightOverlapReview(d,l)).toBe(true);await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
  l.overlapReview={confirmed:true,source:"Independent sources",revision:"1",basis:selfWeightOverlapReviewBasis(d,l)};
  await expect(adaptLoadedMixedProject(p)).resolves.toHaveProperty("request.schema_version","jpn.mixed3d/2");
  l.roofArea[0].knM2=.11;await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
});
it("propriedades, apoios e ligações ausentes continuam bloqueados; U não vira U enrijecido",async()=>{
  const p=roofAreaReferenceProject(),d=p.workspace.spatialPreparation!;
  d.groups.purlin.areaCm2=null;await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/PROPERTIES/);
  const q=roofAreaReferenceProject();q.workspace.spatialPreparation!.supports=[];await expect(adaptLoadedMixedProject(q)).rejects.toThrow(/SUPPORTS/);
  const r=roofAreaReferenceProject();r.workspace.spatialPreparation!.groups.purlin.connection="pending";await expect(adaptLoadedMixedProject(r)).rejects.toThrow(/CONTRADICTION/);
  const realReference=createQuickProject({typology:"mono",widthM:6,lengthM:8,heightM:3});const pending=newSpatialPreparation(realReference);realReference.workspace.spatialPreparation=pending;
  realReference.planning!.profiles.topChord.name="U 75x40x2,65";realReference.planning!.profiles.purlin.name="U enrijecido 75x40x2,65";
  pending.geometrySignature=structureSignature(realReference);pending.loading=structuredClone(d.loading);pending.loading!.roofDistribution=method(realReference) as NonNullable<typeof pending.loading>["roofDistribution"];
  await expect(adaptLoadedMixedProject(realReference)).rejects.toMatchObject({code:"PREPARATION_INCOMPLETE"});
});

it("cobertura gerada → adaptação → Python real: ações, reações, IDs, superposição e hashes",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=roofAreaReferenceProject(),before=JSON.stringify(p),a=await adaptLoadedMixedProject(p);
  expect(JSON.stringify(p)).toBe(before);expect(a.request.nodes).toHaveLength(132);expect(a.request.members).toHaveLength(243);expect(a.request.nodal_loads).toEqual([]);
  expect(new Set(a.request.member_loads.map(l=>l.member)).size).toBe(a.request.member_loads.length);
  const out=await runLocalMixed(JSON.stringify(a.request));if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw new Error("No real result");
  verifyMixedResult(a.request,out.result,await mixedInputHash(a.request));verifyLoadingTrace(a.request,out.result);
  const c=out.result.combinations.AREA,inv=out.result.combinations.INVERSA;
  expect(Object.values(c.nodes).reduce((s,n)=>s+n.reaction_force_n[2],0)).toBeCloseTo(20000,6);expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
  for(const id of Object.keys(c.nodes))c.nodes[id].translation_m.forEach((x,i)=>expect(inv.nodes[id].translation_m[i]).toBeCloseTo(-x,10));
  const old=a.input_sha256;p.workspace.spatialPreparation!.loading!.roofArea[0].knM2=.2;expect((await adaptLoadedMixedProject(p)).input_sha256).not.toBe(old);
},20000);
it("UDL de cobertura não é aplicada a terças axiais",async()=>{
  const p=roofAreaReferenceProject(),d=p.workspace.spatialPreparation!;
  d.groups.purlin.elementKind="axial";d.groups.purlin.connection="axial";
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/ROOF_AXIAL_UNSUPPORTED/);
});
it("Python real aceita pressão zero declarada e recusa cobertura sem vínculos suficientes",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=roofAreaReferenceProject();p.workspace.spatialPreparation!.loading!.roofArea[0].knM2=0;
  const a=await adaptLoadedMixedProject(p),out=await runLocalMixed(JSON.stringify(a.request));if(out.status!=="completed")throw new Error("No real zero-load result");
  for(const n of Object.values(out.result.combinations.AREA.nodes))closeVector(n.translation_m,[0,0,0],12);
  p.workspace.spatialPreparation!.supports.forEach(s=>s.dofs=["free","free","free","free","free","free"]);
  const unstable=await adaptLoadedMixedProject(p);await expect(runLocalMixed(JSON.stringify(unstable.request))).rejects.toMatchObject({code:"UNSTABLE"});
},20000);
it("carga derivada numa terça: balanço+mola axial real contra flecha/rotação/V/M/reação analíticos",()=>{
  const p=rectangle(),load=distributeRoofActions(p,[action()],method(p)).actions[0].loads.find(l=>l.pieceId==="TE1-V1")!,q=load.forcePerLengthNM[2],L=4,E=200e9,I=1e-5;
  const request=anyMixedRequestSchema.parse({schema_version:"jpn.mixed3d/2",units:"SI",theory:"linear-elastic-frame-axial",project:{id:"ROOF-BEAM-CONTROL",revision:"1",source:"Independent synthetic cantilever; derived purlin UDL; not a commercial design"},
    nodes:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:0,y_m:L,z_m:0},{id:"C",x_m:1,y_m:L,z_m:0}],
    materials:[{id:"M",e_pa:E,g_pa:E/2.6,nu:.3,source:"Synthetic",revision:"1"}],sections:[{id:"S",area_m2:.01,iy_m4:I,iz_m4:I,j_m4:I,source:"Synthetic",revision:"1"}],
    members:[{id:"F",kind:"frame",start:"A",end:"B",material:"M",section:"S",rotation_deg:0,release_start:[false,false,false,false,false,false],release_end:[false,false,false,false,false,false]},{id:"X",kind:"axial",start:"B",end:"C",e_pa:E,area_m2:.001,source:"Explicit transverse axial control",revision:"1"}],
    supports:[{node:"A",restrained:[true,true,true,true,true,true]},{node:"C",restrained:[true,true,true,false,false,false]}],cases:[{id:"AREA",source:action().source}],combinations:[{id:"AREA",factors:{AREA:1}}],nodal_loads:[],self_weight:null,
    member_loads:[{id:"AREA-1:F",member:"F",case:"AREA",coordinate_system:"global",force_per_length_n_m:load.forcePerLengthNM,source:action().source,revision:"1"}]});
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(request),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},maxBuffer:2000000}));
  expect(out.status).toBe("completed");const c=out.result.combinations.AREA,F=c.members.F;
  expect(c.nodes.B.translation_m[2]).toBeCloseTo(q*L**4/(8*E*I),11);expect(c.nodes.B.rotation_rad[0]).toBeCloseTo(q*L**3/(6*E*I),11);
  expect(c.nodes.A.reaction_force_n[2]).toBeCloseTo(-q*L,7);expect(c.nodes.A.reaction_moment_nm[0]).toBeCloseTo(-q*L**2/2,7);
  expect(Math.hypot(F.stations[2].vy_n,F.stations[2].vz_n)).toBeCloseTo(Math.abs(q)*L/2,7);expect(Math.hypot(F.stations[2].my_nm,F.stations[2].mz_nm)).toBeCloseTo(Math.abs(q)*L**2/8,7);
  expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
},10000);
