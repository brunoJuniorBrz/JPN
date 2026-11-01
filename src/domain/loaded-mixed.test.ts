import { expect,it,vi,afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { loadedMixedReferenceProject } from "./examples/loaded-mixed-project";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { mixedInputHash, mixedStations } from "./mixed-analysis";
import { resistanceDiagnostics } from "./resistance-preparation";
import { verifyLoadingTrace, selfWeightOverlapReviewBasis } from "./structural-loading";
import { parseBackup,serializeBackup } from "@/infrastructure/persistence/local";
import { emptySnapshot } from "./models";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { baseNodeIds, newSpatialPreparation, pieceRoles } from "./spatial-preparation";
import { inspectConnectivity } from "./spatial-connectivity";
afterEach(()=>vi.unstubAllEnvs());
it("prepara carga física sem mutação, conserva peso/segmentos e persiste backup compatível",async()=>{
  const p=loadedMixedReferenceProject(),before=JSON.stringify(p),a=await adaptLoadedMixedProject(p);
  expect(a.request.members).toHaveLength(243);expect(a.request.self_weight!.densities).toHaveLength(243);expect(a.request.member_loads[0].force_per_length_n_m).toEqual([0,0,-100]);expect(JSON.stringify(p)).toBe(before);
  expect(parseBackup(serializeBackup({...emptySnapshot(),projects:[p]})).data.projects[0]).toEqual(p);
  if(process.env.JPN_EXPORT_LOADED_FIXTURE==="1")writeFileSync("engine/examples/mixed-loaded-roof.json",JSON.stringify(a.request,null,2)+"\n");
});
it("recusa falta de densidade, axial transversal, caso duplicado e caminho de cobertura indefinido",async()=>{
  const p=loadedMixedReferenceProject(),d=p.workspace.spatialPreparation!;delete d.groups.column.density;
  // This case tests density validation after an explicit review of the current
  // declarations. Other tests below require edits to revoke that review.
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/densidade/);
  const b=loadedMixedReferenceProject(),loading=b.workspace.spatialPreparation!.loading!;loading.uniform[0].caseId="PP-DEMO";
  loading.overlapReview!.basis=selfWeightOverlapReviewBasis(b.workspace.spatialPreparation!,loading);
  await expect(adaptLoadedMixedProject(b)).rejects.toThrow(/exclusivo/);
  loading.uniform[0].caseId="TESTE";loading.uniform[0].pieceId=b.workspace.spatialPreparation!.memberKinds![0].pieceId;
  loading.overlapReview!.basis=selfWeightOverlapReviewBasis(b.workspace.spatialPreparation!,loading);
  await expect(adaptLoadedMixedProject(b)).rejects.toThrow(/axial|pórtico/);
  loading.roofArea=[{caseId:"TESTE",knM2:.1,projection:"horizontal",direction:[0,0,-1],source:"S",revision:"1",loadPath:"A definir"}];
  await expect(adaptLoadedMixedProject(b)).rejects.toThrow(/ROOF_LOAD_PATH_PENDING/);
  expect(resistanceDiagnostics(null)).toMatchObject({approved:false,status:"not_verified"});
});
it("executa versão 2 com Python real: massa, equilíbrio, forças invertidas, estações e identidade",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const a=await adaptLoadedMixedProject(loadedMixedReferenceProject()),out=await runLocalMixed(JSON.stringify(a.request));
  if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw new Error("Resultado carregado ausente");
  expect(out.result.input_sha256).toBe(await mixedInputHash(a.request));expect(out.result.loading.self_weight!.total_mass_kg).toBeGreaterThan(0);
  const c=out.result.combinations.TOTAL, inverse=out.result.combinations["INVERSO-TOTAL"];
  expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
  for(const id of Object.keys(c.nodes))c.nodes[id].translation_m.forEach((x,i)=>expect(inverse.nodes[id].translation_m[i]).toBeCloseTo(-x,9));
  const frame=Object.values(c.members).find(m=>m.kind==="frame")!;expect(mixedStations(frame)).toEqual(frame.kind==="frame"?frame.stations:null);
  const bad=structuredClone(out.result);bad.loading.self_weight!.total_mass_kg+=1;expect(()=>verifyLoadingTrace(a.request,bad)).toThrow(/Massa/);
},20000);

it("bloqueia potencial dupla contagem entre casos até revisão explícita, revogada por mudança das ações",async()=>{
  const p=loadedMixedReferenceProject(),d=p.workspace.spatialPreparation!,loading=d.loading!;
  delete loading.overlapReview;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
  loading.overlapReview={confirmed:true,source:"Conferência sintética das fontes",revision:"R1",basis:selfWeightOverlapReviewBasis(d,loading)};
  await expect(adaptLoadedMixedProject(p)).resolves.toHaveProperty("request.schema_version","jpn.mixed3d/2");
  d.loads[0].fzKn=-1.1;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
  loading.overlapReview.basis=selfWeightOverlapReviewBasis(d,loading);
  d.combinations[0].factors.TESTE=0.5;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
  loading.overlapReview.basis=selfWeightOverlapReviewBasis(d,loading);
  d.groups.column.density!.kgM3=1100;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
});
it("não exige revisão de duplicidade quando combinações isolam peso de cargas manuais",async()=>{
  const p=loadedMixedReferenceProject(),d=p.workspace.spatialPreparation!,loading=d.loading!;
  delete loading.overlapReview;
  d.combinations=[{id:"APENAS-PESO",factors:{TESTE:0,INVERSO:0,"PP-DEMO":1}}];
  await expect(adaptLoadedMixedProject(p)).resolves.toHaveProperty("request.schema_version","jpn.mixed3d/2");
});

it("cobertura criada pelo gerador comum admite peso/carga após declarações reais explícitas, sem abrir fixture",async()=>{
  const p=createQuickProject({typology:"gable",widthM:10,lengthM:20,heightM:4});
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/carregamentos físicos/);
  const model=generateStructure(p).model!,nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const d=newSpatialPreparation(p);
  for(const role of pieceRoles)d.groups[role]={
    steelGrade:"Material ISOTRÓPICO SINTÉTICO PARA TESTE, não é aço certificado",
    materialSource:"Declaração manual do teste de cobertura gerada",materialRevision:"T1",
    eGpa:200,gGpa:200/2.6,nu:.3,areaCm2:100,iyCm4:8000,izCm4:8000,jCm4:16000,
    sectionSource:"Seção física sintética do ensaio, não visual",sectionRevision:"T1",
    rotationDeg:0,connection:"rigid",elementKind:"frame",
    density:{kgM3:1000,source:"Densidade sintética declarada para teste",revision:"T1"}
  };
  const diagonals=model.pieces.filter(piece=>piece.role==="web"&&Math.abs(nodes.get(piece.start)!.x-nodes.get(piece.end)!.x)>1e-6);
  d.memberKinds=diagonals.map(piece=>({pieceId:piece.id,kind:"axial"}));
  d.memberConnections=diagonals.map(piece=>({pieceId:piece.id,start:"axial",end:"axial"}));
  d.supports=baseNodeIds(model).map(nodeId=>({nodeId,dofs:["fixed","fixed","fixed","fixed","fixed","fixed"] as ["fixed","fixed","fixed","fixed","fixed","fixed"]}));
  d.connectionsReview="Conexões sintéticas declaradas: encontros reais da malha unidos, diagonais axiais, demais peças pórtico.";
  d.lateralSystem="Ensaio: pórticos rígidos com engastes sintéticos e diagonais axiais; sem homologação para obra.";
  d.loadPathReview="Caso de teste sintético: peso próprio declarado e UDL em uma terça, sem carga normativa.";
  d.connectivity={version:1,geometrySignature:structureSignature(p),reviewSource:d.connectionsReview,
    junctions:inspectConnectivity(model).junctions.map(j=>({nodeId:j.nodeId,pieceIds:j.pieceIds,decision:"connect"}))};
  d.cases=[{id:"PERMANENTE",source:"Peso próprio sintético declarado"},{id:"LINHA",source:"Uniforme sintética em uma terça"}];
  d.loads=[];d.combinations=[
    {id:"SO-PESO",factors:{PERMANENTE:1,LINHA:0}},
    {id:"SO-LINHA",factors:{PERMANENTE:0,LINHA:1}}
  ];
  const purlin=model.pieces.find(piece=>piece.role==="purlin")!;
  d.loading={version:1,selfWeight:{caseId:"PERMANENTE",gravity:[0,0,-10],axialLumping:"half-to-end-nodes"},
    uniform:[{id:"Q-GERADA",pieceId:purlin.id,caseId:"LINHA",coordinates:"global",
      knM:[0,0,-0.1],source:"Teste UDL sintético independente",revision:"T1"}],roofArea:[]};
  p.workspace.spatialPreparation=d;
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.request.nodal_loads).toEqual([]);
  expect(prepared.request.members).toHaveLength(243);
  expect(prepared.request.self_weight!.densities).toHaveLength(243);
  expect(prepared.request.member_loads).toHaveLength(1);
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const response=await runLocalMixed(JSON.stringify(prepared.request));
  if(response.status!=="completed"||response.result.schema_version!=="jpn.mixed3d-result/2")throw new Error("Sem análise real");
  for(const combo of Object.values(response.result.combinations))expect(combo.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(response.result.loading.self_weight!.total_mass_kg).toBeGreaterThan(0);
},30000);
