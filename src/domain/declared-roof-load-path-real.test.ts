import {afterEach,expect,it,vi} from "vitest";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
import {structureSignature} from "./calculations/project-basis";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";

afterEach(()=>vi.unstubAllEnvs());
it("M39: cobertura declarada -> terças físicas -> loaded mixed3d/2 -> PyNite real -> equilíbrio",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const p=m34abProject();
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"Levantamento estrutural M39-R1",provenance:"Referência matemática auditada de três terças e dois panos",
    nodes:[
      {id:"A",x:0,y:0,z:3000},{id:"B",x:0,y:5000,z:3000},
      {id:"C",x:4000,y:0,z:3400},{id:"D",x:4000,y:5000,z:3400},
      {id:"E",x:8000,y:0,z:3000},{id:"F",x:8000,y:5000,z:3000},
    ],
    pieces:[
      {id:"P1",role:"purlin",start:"A",end:"B"},
      {id:"P2",role:"purlin",start:"C",end:"D"},
      {id:"P3",role:"purlin",start:"E",end:"F"},
      // Real longitudinal roof edge members connect the three purlins into
      // one physical topology. No phantom joint or solver restraint is added.
      {id:"TC1",role:"topChord",start:"A",end:"C"},
      {id:"TC2",role:"topChord",start:"C",end:"E"},
    ],
  });
  const d=p.workspace.spatialPreparation!;
  d.physicalCatalog!.assignments=["P1","P2","P3","TC1","TC2"].map(pieceId=>({
    pieceId,materialId:"STEEL",sectionId:"S1",rotationDeg:0,
  }));
  d.memberKinds=["P1","P2","P3","TC1","TC2"].map(pieceId=>({pieceId,kind:"frame" as const}));
  d.memberConnections=["P1","P2","P3","TC1","TC2"].map(pieceId=>({
    pieceId,start:"rigid" as const,end:"rigid" as const,
  }));
  const fixed=["fixed","fixed","fixed","fixed","fixed","fixed"] as const;
  const sliding=["fixed","fixed","fixed","free","free","free"] as const;
  d.supports=["A","B","C","D","E","F"].map(nodeId=>({
    nodeId,dofs:[...(["A","C","E"].includes(nodeId)?fixed:sliding)] as
      ["fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free","fixed"|"free"],
  }));
  d.cases=[
    {id:"AREA",source:"Carga independente em superfície de telhado declarada"},
    {id:"ZERO",source:"Referência nula explícita para auditoria do contato nodal"},
  ];
  d.combinations=[{id:"ELASTIC-CASE",factors:{AREA:1,ZERO:0}}];
  d.loads=[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",caseId:"ZERO",nodeId:"A",
    fxKn:0,fyKn:0,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0}];
  d.connectionsReview="Três terças de pórtico com vinculação física explícita, sem barra fictícia";
  d.lateralSystem="Todos os seis nós possuem vínculos conhecidos, com rotações de extremos distais livres";
  d.loadPathReview="Chapa simplesmente apoiada entre terças e carregamento de linha em cada barra real";
  const make=(p:[[number,number],[number,number],[number,number],[number,number]],z:(x:number)=>number)=>
    [...p,p[0]].map(([x,y])=>[x,y,z(x)] as [number,number,number]);
  const source="Geometria referencial medida em XYZ",revision="Revisão técnica carregamento M39";
  d.physicalRoofFaces=physicalRoofFacesSchema.parse({
    schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,
    faces:[
      {id:"LEFT",outer:make([[0,0],[4000,0],[4000,5000],[0,5000]],x=>3000+.1*x),
        holes:[],supportPieceIds:["P1","P2"],source,revision},
      {id:"RIGHT",outer:make([[4000,0],[8000,0],[8000,5000],[4000,5000]],x=>3800-.1*x),
        holes:[],supportPieceIds:["P2","P3"],source,revision},
    ],
  });
  reviewM34Fixture(p);
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[{
    caseId:"AREA",knM2:.2,projection:"horizontal",direction:[0,0,-1],
    source:"Carga vertical uniforme com declaração física do ensaio",
    revision:"Revisão da ação real sintética",loadPath:"Telhas simples -> terças reais -> vínculos físicos"
  }],roofDistribution:{version:1,method:"parallel-purlin-strips",geometrySignature:structureSignature(p)}};
  const prepared=await adaptLoadedMixedProject(p);
  expect(prepared.request.schema_version).toBe("jpn.mixed3d/2");
  expect(prepared.request.members).toHaveLength(5);
  expect(prepared.request.member_loads).toHaveLength(3);
  expect(prepared.request.member_loads.map(l=>l.force_per_length_n_m[2])).toEqual([-400,-800,-400]);
  expect(prepared.roof_load_path!.actions[0].distributedForceN[2]).toBeCloseTo(-8000,8);
  const executed=await runLocalMixed(JSON.stringify(prepared.request));
  if(executed.status!=="completed"||executed.result.schema_version!=="jpn.mixed3d-result/2")
    throw Error("Worker real não executou cobertura declarada com cargas verificadas");
  const combination=executed.result.combinations["ELASTIC-CASE"];
  const reaction=Object.values(combination.nodes).reduce((sum,node)=>sum+node.reaction_force_n[2],0);
  expect(reaction).toBeCloseTo(8000,5);
  expect(combination.equilibrium.relative_residual).toBeLessThan(1e-8);
  expect(executed.result.input_sha256).toBe(prepared.input_sha256);
},30000);
