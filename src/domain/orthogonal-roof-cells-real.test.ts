import {afterEach,expect,it,vi} from "vitest";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
import {declaredRoofDistributionSignature} from "./declared-roof-load-path";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";

afterEach(()=>vi.unstubAllEnvs());
it("M39-P2: L real -> caminhos de carga nos segmentos -> solver PyNite -> 3 reações e momento global conservados",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=m34abProject();
  const coords=[
    {id:"A0",x:0,y:0,z:3000},{id:"A2",x:0,y:2000,z:3000},{id:"A5",x:0,y:5000,z:3000},
    {id:"B0",x:2000,y:0,z:3200},{id:"B2",x:2000,y:2000,z:3200},{id:"B5",x:2000,y:5000,z:3200},
    {id:"C0",x:6000,y:0,z:3600},{id:"C2",x:6000,y:2000,z:3600},
  ];
  const pieces=[
    {id:"P0LOW",start:"A0",end:"A2",role:"purlin"},
    {id:"P0HIGH",start:"A2",end:"A5",role:"purlin"},
    {id:"P2LOW",start:"B0",end:"B2",role:"purlin"},
    {id:"P2HIGH",start:"B2",end:"B5",role:"purlin"},
    {id:"P6LOW",start:"C0",end:"C2",role:"purlin"},
    // Actual transverse framing connects ALL purlins into one reviewed
    // topology; the solver is never asked to join disconnected beams.
    {id:"TCAB0",start:"A0",end:"B0",role:"topChord"},
    {id:"TCBC0",start:"B0",end:"C0",role:"topChord"},
    {id:"TCAB2",start:"A2",end:"B2",role:"topChord"},
    {id:"TCBC2",start:"B2",end:"C2",role:"topChord"},
    {id:"TCAB5",start:"A5",end:"B5",role:"topChord"},
  ] as const;
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"M39-P2 revisão 1",provenance:"Modelo matemático audível com contorno em L e terças divididas",
    nodes:coords,pieces,
  });
  const d=p.workspace.spatialPreparation!;
  d.physicalCatalog!.assignments=pieces.map(piece=>({
    pieceId:piece.id,materialId:"STEEL",sectionId:"S1",rotationDeg:0,
  }));
  d.memberKinds=pieces.map(piece=>({pieceId:piece.id,kind:"frame" as const}));
  d.memberConnections=pieces.map(piece=>({
    pieceId:piece.id,start:"rigid" as const,end:"rigid" as const,
  }));
  // Both ends of each physical roof beam line are supported in the
  // reference problem. The earlier cantilever-only fixture exceeded the
  // linear-elastic displacement limit; we DO NOT relax that solver safety gate.
  const rootSupports=new Set(["A0","B0","C0"]);
  const edgeSupports=["A0","B0","C0","A5","B5","C2"];
  d.supports=edgeSupports.map(nodeId=>({
    nodeId,dofs:(rootSupports.has(nodeId)
      ? ["fixed","fixed","fixed","fixed","fixed","fixed"]
      : ["fixed","fixed","fixed","free","free","free"]) as
      ["fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free"],
  }));
  // The loaded mixed3d/2 contract must handle genuine area-only projects.
  // No phantom zero-valued nodal case is inserted to unlock the solver.
  d.cases=[{id:"AREA",source:"Pressão de referência não normativa declarada na cobertura L"}];
  d.combinations=[{id:"ELASTIC-L",factors:{AREA:1}}];
  d.loads=[];
  d.connectionsReview="Ligações rígidas sintéticas explicitamente declaradas; verificar na obra";
  d.lateralSystem="Raízes engastadas e apoios físicos de borda articulados em nós explícitos no ensaio; revisar vínculos para cada obra";
  d.loadPathReview="Painéis ortogonais L em terças divididas e peças de travamento reais entre os nós";
  const outer:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[
    [0,0],[6000,0],[6000,2000],[2000,2000],[2000,5000],[0,5000],
  ];
  const source="Medição tridimensional sintética e hipóteses controladas",revision="Revisão de geometria M39 P2";
  d.physicalRoofFaces=physicalRoofFacesSchema.parse({
    schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,
    faces:[{id:"L",outer:[...outer,outer[0]].map(([x,y])=>[x,y,3000+.1*x]),
      holes:[],supportPieceIds:["P0LOW","P0HIGH","P2LOW","P2HIGH","P6LOW"],source,revision}],
  });
  reviewM34Fixture(p);
  d.loading={
    version:1,selfWeight:null,uniform:[],roofArea:[{
      caseId:"AREA",knM2:.2,projection:"horizontal",direction:[0,0,-1],
      source:"Caso sintético independente - pressão vertical uniforme declarada",
      revision:"Revisão de ação M39 P2",
      loadPath:"Painéis em L → terças de borda em cada célula → ligação e raízes",
    }],
    roofDistribution:{version:1,method:"parallel-purlin-strips",
      geometrySignature:declaredRoofDistributionSignature(p)},
  };
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.request.schema_version).toBe("jpn.mixed3d/2");
  expect(prepared.request.nodal_loads).toHaveLength(0);
  expect(prepared.request.members).toHaveLength(10);
  expect(prepared.request.member_loads).toHaveLength(5);
  expect(prepared.roof_load_path!.actions[0].areaM2).toBeCloseTo(18,9);
  const result=await runLocalMixed(JSON.stringify(prepared.request));
  if(result.status!=="completed"||result.result.schema_version!=="jpn.mixed3d-result/2")
    throw Error("Executor Python real não concluiu cobertura irregular com carga auditada");
  const combination=result.result.combinations["ELASTIC-L"];
  const reactions=Object.values(combination.nodes);
  const rz=reactions.reduce((sum,n)=>sum+n.reaction_force_n[2],0);
  expect(rz).toBeCloseTo(3600,5);
  expect(combination.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(result.result.input_sha256).toBe(prepared.input_sha256);
  expect(prepared.approved_for_fabrication).toBe(false);
},30000);
