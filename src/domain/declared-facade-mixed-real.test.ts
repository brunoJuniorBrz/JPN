import {afterEach,expect,it,vi} from "vitest";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalFacadesSchema} from "./physical-facades";
import {declaredFacadeTractionSignature} from "./declared-facade-traction";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {adaptMixedProject} from "./mixed-adapter";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {auditFacadeSolverLoads} from "./facade-solver-load-audit";
import {buildResistanceReport} from "./resistance-report";
afterEach(()=>vi.unstubAllEnvs());

it("M41-P3: pressão explícita em fachada -> pilares físicos -> PyNite real e reações",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=m34abProject(),source="Modelo sintético de fachada com estrutura fisicamente apoiada",
    revision="Revisão física do ensaio M41-P3";
  const nodes=[0,3000,6000].flatMap((y,i)=>[
    {id:"B"+i,x:8000,y,z:0},{id:"T"+i,x:8000,y,z:4000}
  ]);
  const pieces=[
    {id:"C0",role:"column",start:"B0",end:"T0"},
    {id:"C3",role:"column",start:"B1",end:"T1"},
    {id:"C6",role:"column",start:"B2",end:"T2"},
    {id:"TOP0",role:"topChord",start:"T0",end:"T1"},
    {id:"TOP1",role:"topChord",start:"T1",end:"T2"},
  ] as const;
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    provenance:source,revision,nodes,pieces,
  });
  const d=p.workspace.spatialPreparation!;
  d.physicalCatalog!.assignments=pieces.map(piece=>({
    pieceId:piece.id,materialId:"STEEL",sectionId:"S1",rotationDeg:0,
  }));
  d.memberKinds=pieces.map(piece=>({pieceId:piece.id,kind:"frame" as const}));
  d.memberConnections=pieces.map(piece=>({
    pieceId:piece.id,start:"rigid" as const,end:"rigid" as const,
  }));
  d.supports=nodes.map(n=>({
    nodeId:n.id,dofs:(n.id.startsWith("B")?
      ["fixed","fixed","fixed","fixed","fixed","fixed"]:
      ["fixed","fixed","fixed","free","free","free"]) as
      ["fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free"],
  }));
  d.cases=[{id:"WIND-X",source:"Pressão líquida fornecida externamente para ensaio elástico"}];
  d.combinations=[{id:"ELASTIC-WIND",factors:{"WIND-X":1}}];
  d.loads=[];d.connectionsReview="Conexões físicas rígidas somente na referência sintética";
  d.lateralSystem="Três bases engastadas e extremidades superiores apoiadas lateralmente em nós explícitos";
  d.loadPathReview="Fechamento simplesmente apoiado horizontalmente transfere tração aos três pilares reais";
  const outer:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[
    [8000,0,0],[8000,6000,0],[8000,6000,4000],[8000,0,4000],
  ];
  d.physicalFacades=physicalFacadesSchema.parse({
    schema_version:"jpn.physical-facades/1",units:"mm",source,revision,
    facades:[{
      id:"EAST",kind:"wall",outward:"+X",enclosure:"cladded",
      outer:[...outer,outer[0]],openings:[],supportPieceIds:["C0","C3","C6"],
      source,revision,enclosureSource:"Inspeção física sintética do revestimento",
    }]
  });
  const ref={
    standard:"Hipótese externa do ensaio; ainda sem norma aplicada",
    edition:"Revisão de referência M41-P3",
    clause:"Não há cláusula normativa invocada neste teste",
    source:"Levantamento sintético de situação física",
    revision:"Revisão v1 de carga em fachada",
    responsible:"Responsável técnico de referência não substituído pelo JPN",
  };
  d.engineeringCombinations={
    schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:[{caseId:"WIND-X",category:"wind",exclusiveGroup:"FACADES-ALTERNATIVAS",reference:ref}],
    combinations:[{
      id:"ELASTIC-WIND",purpose:"SLS-characteristic",
      hypothesis:"Caso sintético de serviço, sem fatores de norma presumidos",reference:ref,
      terms:[{caseId:"WIND-X",gamma:1,psi:1,reference:ref}],
    }],
  };
  reviewM34Fixture(p);
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[],facadeTraction:{
    schema_version:"jpn.declared-facade-traction/1",
    normativeValidation:"pending-engineer-review",
    physicalSignature:declaredFacadeTractionSignature(p),cases:[{
      id:"WIND-X",incidenceDeg:0,reference:"Cenário sintético externo fornecido, sem conferência normativa",
      zones:[{facadeId:"EAST",netPressurePa:500,
        source:"Pressão líquida sintética de 500 pascais",
        revision:"Revisão de carregamento de referência",
        calculationBasis:"Dado independente declarado; NÃO é Cp/Cpi calculado pelo JPN"}],
    }],
  }};
  await expect(adaptMixedProject(p)).rejects.toThrow("FACADE_LOADED_REQUIRED");
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.request.schema_version).toBe("jpn.mixed3d/2");
  expect(prepared.facade_traction_path?.cases[0].forceN).toEqual([-12000,0,0]);
  expect(prepared.request.member_loads).toHaveLength(3);
  expect(prepared.request.member_loads.map(l=>l.force_per_length_n_m[0])).toEqual([-750,-1500,-750]);
  // One SLS-only wind scenario is NOT a complete ELU/ELS analysis matrix.
  expect(prepared.engineering_combination_coverage?.coverageStatus).toBe("review-required");
  expect(prepared.engineering_combination_coverage?.missingULS).toEqual(["WIND-X"]);
  expect(prepared.facade_solver_audit?.verified).toBe(true);
  expect(prepared.facade_solver_audit?.cases[0].facades[0].mappedMembers).toEqual(["C0","C3","C6"]);
  const sourceTrace=prepared.facade_traction_path;
  if(!sourceTrace)throw Error("Caminho de fachadas física ausente");
  const tampered=structuredClone(prepared.request);
  tampered.member_loads[0].force_per_length_n_m[0]-=50;
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,tampered,prepared.mapping))
    .toThrow("FACADE_AUDIT_LOAD_MISMATCH");
  const missingMapping={...prepared.mapping,members:prepared.mapping.members.filter(m=>m.originalId!=="C0")};
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,prepared.request,missingMapping))
    .toThrow("FACADE_AUDIT_UNMAPPED_COLUMN");
  const shortened=structuredClone(prepared.request);
  const firstColumn=shortened.members.find(m=>m.id===prepared.mapping.members.find(x=>x.originalId==="C0")?.id);
  if(!firstColumn)throw Error("Pilar C0 não foi mapeado");
  shortened.nodes.find(n=>n.id===firstColumn.start)!.z_m+=0.15;
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,shortened,prepared.mapping))
    .toThrow("FACADE_AUDIT_SEGMENTATION");
  const offAxis=structuredClone(prepared.request);
  offAxis.nodes.find(n=>n.id===firstColumn.start)!.x_m+=0.05;
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,offAxis,prepared.mapping))
    .toThrow("FACADE_AUDIT_OFF_AXIS");
  const extra=structuredClone(prepared.request);
  extra.member_loads.push({...extra.member_loads[0],id:"FACADE:WIND-X:FAKE:Z"});
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,extra,prepared.mapping))
    .toThrow("FACADE_AUDIT_UNTRACED_LOAD");
  // Regression: an attacker or buggy adapter can add the same physical facade
  // pressure with a different ID. Prefix-only detection used to miss this and
  // report the expected 12 kN while sending 12 kN extra to the solver.
  const disguised=structuredClone(prepared.request);
  disguised.member_loads.push({...disguised.member_loads[0],id:"EXTRA-WIND-LOAD"});
  expect(()=>auditFacadeSolverLoads(p,sourceTrace,disguised,prepared.mapping))
    .toThrow("FACADE_AUDIT_UNTRACED_LOAD");
  const result=await runLocalMixed(JSON.stringify(prepared.request));
  if(result.status!=="completed"||result.result.schema_version!=="jpn.mixed3d-result/2")
    throw Error("PyNite não analisou os pilares reais carregados pelas faces medidas");
  const analysis=result.result.combinations["ELASTIC-WIND"];
  const fx=Object.values(analysis.nodes).reduce((s,n)=>s+n.reaction_force_n[0],0);
  expect(fx).toBeCloseTo(12000,5);
  // Independently reconstruct the 3 global support moments, including
  // rigid-support couple reactions. Solver force equilibrium alone is not
  // evidence of a correct physical wind moment path.
  const netReactionForce:[number,number,number]=[0,0,0],
    netReactionMoment:[number,number,number]=[0,0,0];
  for(const support of prepared.request.supports){
    const node=prepared.request.nodes.find(n=>n.id===support.node);
    const answer=analysis.nodes[support.node];
    if(!node||!answer)throw Error("O solver omitiu um apoio físico");
    const r:[number,number,number]=[node.x_m,node.y_m,node.z_m],
      f=answer.reaction_force_n,m=answer.reaction_moment_nm;
    for(let i=0;i<3;i++)netReactionForce[i]+=f[i];
    netReactionMoment[0]+=m[0]+r[1]*f[2]-r[2]*f[1];
    netReactionMoment[1]+=m[1]+r[2]*f[0]-r[0]*f[2];
    netReactionMoment[2]+=m[2]+r[0]*f[1]-r[1]*f[0];
  }
  const applied=prepared.facade_traction_path!.cases[0];
  for(let i=0;i<3;i++){
    expect(Math.abs(netReactionForce[i]+applied.forceN[i]))
      .toBeLessThan(1e-7*Math.max(1,...applied.forceN.map(Math.abs)));
    expect(Math.abs(netReactionMoment[i]+applied.momentNm[i]))
      .toBeLessThan(1e-6*Math.max(1,...applied.momentNm.map(Math.abs)));
  }

  expect(analysis.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(result.result.input_sha256).toBe(prepared.input_sha256);
  expect(prepared.facade_traction_path?.windNormativeReady).toBe(false);
  const report=await buildResistanceReport(p,prepared,result.result);
  expect(report.secondOrderAudit.topology).toBe("frame-only");
  expect(report.secondOrderAudit.combinations.map(c=>c.combinationId)).toEqual(["ELASTIC-WIND"]);
  expect(report.secondOrderAudit.pDeltaExecuted).toBe(false);
  expect(report.secondOrderAudit.normativeStabilityVerified).toBe(false);
  expect(report.secondOrderAudit.fabricationRelease).toBe(false);
  expect(report.secondOrderAudit.releaseGate).toBe("NOT_READY_BLOCKED");
},30000);
