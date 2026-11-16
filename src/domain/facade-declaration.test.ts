import {afterEach,expect,it,vi} from "vitest";
import {buildingProject} from "./test-support/m41-building-fixture";
import {setPhysicalFacades,declareFacadeTraction,applyNbr6123WallWind,rectangularFacade} from "./facade-declaration";
import type {RectangularFacadeInput} from "./facade-declaration";
import {applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";
import {declareLocalAxes} from "./local-axes-review";
import {projectFrameAxes} from "./current-mixed-adapter";
import {projectSchema} from "./models";
import {provisionalNotices} from "./normative-provenance";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {verifyMixedResult} from "./mixed-analysis";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {toFacadeLocal} from "./physical-facades";
import type {Project} from "./models";
afterEach(()=>vi.unstubAllEnvs());

const src="Levantamento sintético do ensaio INT-1d",rev="INT-1d v1";
const FAC:RectangularFacadeInput[]=([
  {id:"EAST",outward:"+X",planeMm:12000,uMinMm:0,uMaxMm:6000,zMinMm:0,zMaxMm:4000,supportPieceIds:["C12000_0","C12000_3000","C12000_6000"]},
  {id:"WEST",outward:"-X",planeMm:0,uMinMm:-6000,uMaxMm:0,zMinMm:0,zMaxMm:4000,supportPieceIds:["C0_0","C0_3000","C0_6000"]},
  {id:"NORTH",outward:"+Y",planeMm:6000,uMinMm:-12000,uMaxMm:0,zMinMm:0,zMaxMm:4000,supportPieceIds:["C0_6000","C6000_6000","C12000_6000"]},
  {id:"SOUTH",outward:"-Y",planeMm:0,uMinMm:0,uMaxMm:12000,zMinMm:0,zMaxMm:4000,supportPieceIds:["C0_0","C6000_0","C12000_0"]},
] as {id:string;outward:"+X"|"-X"|"+Y"|"-Y";planeMm:number;uMinMm:number;uMaxMm:number;zMinMm:number;zMaxMm:number;supportPieceIds:string[]}[]).map(f=>({...f,enclosure:"cladded" as const,enclosureSource:"Inspeção física sintética do revestimento",source:src,revision:rev}));
const speed={schema_version:"jpn.wind-speed/1",edition:"2023-corrected-2025",v0Mps:10,heightM:4,heightReference:"model-base-z0",topography:"flat-or-gently-undulating",
  roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,reference:{standard:"ABNT NBR 6123",edition:"2023-corrected-2025",clause:"5",source:"Dados sintéticos INT-1d",revision:"v1",responsible:"Responsável de referência"}};

/** The same steps the UI performs: facades -> NBR 6123 wall wind -> NBR 8681 combinations -> /3 analysis. Starting from a building WITHOUT facades. */
function bareBuilding():Project{
  const p=buildingProject(["G","Q"],["EAST"]);
  const d=p.workspace.spatialPreparation!;d.physicalFacades=undefined;
  const uniform=[0,1,2,3,4,5,6,7].flatMap(i=>[
    {id:"G-TOP"+i,pieceId:"TOP"+i,caseId:"G",coordinates:"global" as const,knM:[0,0,-.5] as [number,number,number],source:src,revision:rev},
    {id:"Q-TOP"+i,pieceId:"TOP"+i,caseId:"Q",coordinates:"global" as const,knM:[0,0,-.75] as [number,number,number],source:src,revision:rev}]);
  d.loading={version:1,selfWeight:null,uniform,roofArea:[]};
  return p;
}

it("editor de fachadas: anel anti-horário correto nos quatro lados, persistência e invalidação da tração anterior",()=>{
  for(const f of FAC){
    const r=rectangularFacade(f),loc=r.outer.map(p=>toFacadeLocal(f.outward,p));
    expect(loc[0]).toEqual([f.uMinMm,f.zMinMm]);expect(loc[2]).toEqual([f.uMaxMm,f.zMaxMm]);expect(r.outer[0]).toEqual(r.outer.at(-1));
  }
  const p=setPhysicalFacades(bareBuilding(),FAC,src,rev);
  expect(p.workspace.spatialPreparation!.physicalFacades!.facades.map(f=>f.id)).toEqual(["EAST","WEST","NORTH","SOUTH"]);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(p))).workspace.spatialPreparation!.physicalFacades!.facades).toHaveLength(4);       // export/restore
  const withTraction=declareFacadeTraction(p,{caseId:"WD",incidenceDeg:0,reference:"Pressão externa declarada do ensaio",source:src,revision:rev,
    calculationBasis:"Valor independente declarado; não é Cp/Cpi calculado pelo JPN",zones:FAC.map(f=>({facadeId:f.id,netPressurePa:f.id==="EAST"?300:f.id==="WEST"?-200:0}))});
  expect(withTraction.workspace.spatialPreparation!.loading!.facadeTraction!.cases[0].zones).toHaveLength(4);
  expect(withTraction.workspace.spatialPreparation!.cases.map(c=>c.id)).toContain("WD");
  const changed=setPhysicalFacades(withTraction,FAC.slice(0,2),src,rev);
  expect(changed.workspace.spatialPreparation!.loading!.facadeTraction).toBeUndefined();          // geometry changed: the old pressure is dropped, not reused
  expect(()=>setPhysicalFacades(p,[FAC[0],FAC[0]],src,rev)).toThrow("FACADE_DUPLICATE_ID");
  expect(()=>declareFacadeTraction(bareBuilding(),{caseId:"WD",incidenceDeg:0,reference:"Pressão externa declarada",source:src,revision:rev,calculationBasis:"Valor declarado",zones:[{facadeId:"EAST",netPressurePa:1}]})).toThrow("FACADE_SURFACES_REQUIRED");
  expect(()=>setPhysicalFacades(p,[{...FAC[0],uMaxMm:-1}],src,rev)).toThrow();
});

it("jornada: fachadas → vento NBR 6123 nas paredes → combinações NBR 8681 → análise /3, com avisos PROVISIONAL persistidos",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  let p=setPhysicalFacades(bareBuilding(),FAC,src,rev);
  const wind=applyNbr6123WallWind(p,{schema_version:"jpn.nbr6123-wall-wind/2",building:{longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true,heightDefinitionConfirmed:true},speed,
    cases:[["W1","+X"],["W2","-X"],["W3","+Y"],["W4","-Y"]].map(([id,windFrom])=>({id,windFrom,internalPressure:{rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"}}))});
  p=wind.project;
  expect(wind.generated.normativeStatus).toBe("PROVISIONAL");
  expect(p.workspace.spatialPreparation!.normativeProvenance!.map(x=>x.id)).toEqual(["wind-walls-nbr6123"]);
  expect(provisionalNotices(p.workspace.spatialPreparation!.normativeProvenance)[0]).toMatch(/PROVISÓRIO.*NBR 6123.*nbr6123-2023-wall-cpe\.json/);
  const comb=applyNbr8681Combinations(p,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable"],families:["uls-normal","sls-rare"],
    actions:[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
      {nature:"variable",caseId:"Q",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null},
      ...["W1","W2","W3","W4"].map(caseId=>({nature:"variable",caseId,variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"}))]});
  p=comb.project;
  // N3: NBR 8681 has a single checked source; only the NBR 6123 wind stays PROVISIONAL
  expect(comb.generated.normativeStatus).toBe("SINGLE_SOURCE_CHECKED");
  expect(p.workspace.spatialPreparation!.normativeProvenance!.map(x=>x.id).sort()).toEqual(["wind-walls-nbr6123"]);
  const restored=projectSchema.parse(JSON.parse(JSON.stringify(p)));                                   // persisted with the project
  expect(restored.workspace.spatialPreparation!.normativeProvenance).toHaveLength(1);
  const sp=p.workspace.spatialPreparation!;
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio INT-1d: ações independentes",revision:rev,basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  const a=projectFrameAxes(p),ready=declareLocalAxes(p,a.signature,a.framePieceIds.map(pieceId=>({pieceId,rotationDeg:0,source:"Giro revisado do ensaio INT-1d (Iy = Iz)",revision:rev})));
  const prepared=await adaptLoadedMixedProjectV3(ready);
  expect(prepared.request.schema_version).toBe("jpn.mixed3d/3");
  expect(prepared.request.combinations.length).toBeGreaterThan(10);
  expect(prepared.facade_traction_path!.windNormativeReady).toBe(false);
  const out=await runLocalMixed(JSON.stringify(prepared.request));
  if(out.status!=="completed")throw Error("PyNite não analisou");
  verifyMixedResult(prepared.request,out.result,prepared.input_sha256);
  for(const c of Object.values(out.result.combinations))expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(prepared.facade_solver_audit?.verified).toBe(true);
},300000);
