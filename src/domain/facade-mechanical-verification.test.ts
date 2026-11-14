import {afterEach,expect,it,vi} from "vitest";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {declaredStructureSchema} from "./declared-structure";
import {declaredFacadeTractionSignature} from "./declared-facade-traction";
import {physicalFacadesSchema} from "./physical-facades";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {auditFacadeSolverLoads} from "./facade-solver-load-audit";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";

type Vector = [number,number,number];
const caseId = "WIND";
const combinationId = "WIND-TEST";
const source = "Synthetic surveyed geometry and externally supplied pressure";
const revision = "Analytical reference v1";
const reference = {
  standard:"Synthetic static equilibrium",edition:"v1",clause:"Uniform external traction",
  source,revision,responsible:"Analytical test fixture",
};

function asymmetricProject(turn = 1) {
  const p = m34abProject();
  const d = p.workspace.spatialPreparation!;
  const bases = [
    {id:"B0",x:7000,y:-2000,z:1000},
    {id:"B1",x:7000,y:-500,z:1000},
    {id:"B2",x:7000,y:4000,z:1000},
    {id:"B3",x:12000,y:4000,z:1000},
  ];
  const tops = bases.map((b,i)=>({...b,id:"T"+i,z:5000}));
  const nodes = [...bases,...tops,
    {id:"MID",x:7000,y:-500,z:2500},
    {id:"TIP",x:8000,y:-500,z:2500},
  ];
  const pieces = [
    {id:"C0",role:"column",start:"B0",end:"T0"},
    {id:"C1",role:"column",start:"T1",end:"B1"},
    {id:"C2",role:"column",start:"B2",end:"T2"},
    {id:"C3",role:"column",start:"B3",end:"T3"},
    {id:"BASE01",role:"topChord",start:"B0",end:"B1"},
    {id:"BASE12",role:"topChord",start:"B1",end:"B2"},
    {id:"BASE23",role:"topChord",start:"B2",end:"B3"},
    {id:"ARM",role:"topChord",start:"MID",end:"TIP"},
  ] as const;
  p.workspace.physicalStructure = declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    provenance:source,revision,nodes:nodes.map(n=>({...n,x:turn*n.x,y:turn*n.y})),pieces,
  });
  const section = d.physicalCatalog!.sections.find(s=>s.id==="S1")!;
  section.iyCm4 = 1500;
  section.izCm4 = 2400;
  d.physicalCatalog!.assignments = pieces.map(({id})=>({
    pieceId:id,materialId:"STEEL",sectionId:"S1",rotationDeg:id==="C1"?37:0,
  }));
  d.memberKinds = pieces.map(({id})=>({pieceId:id,kind:"frame"}));
  d.memberConnections = pieces.map(({id})=>({pieceId:id,start:"rigid",end:"rigid"}));
  // The base ties join fixed points. The free arm creates a cut in C1 and
  // carries no load. Each column therefore has an independent cantilever solution.
  d.supports = bases.map(({id})=>({
    nodeId:id,dofs:["fixed","fixed","fixed","fixed","fixed","fixed"],
  }));
  d.cases = [{id:caseId,source}];
  d.combinations = [{id:combinationId,factors:{[caseId]:1}}];
  d.loads = [];
  d.connectionsReview = "Rigid ends in the synthetic model";
  d.lateralSystem = "Four explicit fixed bases and free column tops";
  d.loadPathReview = "Horizontal tributary widths on independently fixed columns";
  const wall = (id:string,outward:"+X"|"+Y",outer:Vector[],supportPieceIds:string[])=>({
    id,kind:"wall",outward:turn===1?outward:outward.replace("+","-"),enclosure:"cladded",
    outer:[...outer,outer[0]].map(([x,y,z])=>[turn*x,turn*y,z]),
    openings:[],supportPieceIds,source,revision,enclosureSource:source,
  });
  d.physicalFacades = physicalFacadesSchema.parse({
    schema_version:"jpn.physical-facades/1",units:"mm",source,revision,
    facades:[
      wall("EAST","+X",[[7000,-2000,1000],[7000,4000,1000],[7000,4000,5000],[7000,-2000,5000]],["C2","C0","C1"]),
      wall("NORTH","+Y",[[12000,4000,1000],[7000,4000,1000],[7000,4000,5000],[12000,4000,5000]],["C2","C3"]),
    ],
  });
  d.engineeringCombinations = {
    schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:[{caseId,category:"wind",exclusiveGroup:"WIND-ALTERNATIVES",reference}],
    combinations:[{
      id:combinationId,purpose:"SLS-characteristic",hypothesis:source,reference,
      terms:[{caseId,gamma:1,psi:1,reference}],
    }],
  };
  d.loading = {version:1,selfWeight:null,uniform:[],roofArea:[],facadeTraction:{
    schema_version:"jpn.declared-facade-traction/1",normativeValidation:"pending-engineer-review",
    physicalSignature:declaredFacadeTractionSignature(p),
    cases:[{id:caseId,incidenceDeg:35,reference:source,zones:[
      {facadeId:"EAST",netPressurePa:500,source,revision,calculationBasis:source},
      {facadeId:"NORTH",netPressurePa:-300,source,revision,calculationBasis:source},
    ]}],
  }};
  return reviewM34Fixture(p);
}

function closeVector(actual:Vector,expected:Vector) {
  for (const [axis,value] of expected.entries()) expect(actual[axis]).toBeCloseTo(value,5);
}

afterEach(()=>vi.unstubAllEnvs());

it.each([1,-1])("equilibra pressão e sucção de paredes assimétricas no PyNite (rotação XY %s)",async(turn)=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const {request,facade_traction_path,facade_solver_audit,input_sha256} =
    await adaptLoadedMixedProject(asymmetricProject(turn));

  // East spans 1.5 + 4.5 m. Its column widths are 0.75, 3 and 2.25 m.
  // North spans 5 m and shares column C2. C1 runs downward and splits into 2.5 + 1.5 m.
  const expectedLoads: [string,number,number][] = [
    ["C0",-375,0],["C1:S1",-1500,0],["C1:S2",-1500,0],
    ["C2",-1125,0],["C2",0,750],["C3",0,750],
  ];
  const horizontalTurn = (v:Vector):Vector => [turn*v[0],turn*v[1],v[2]];
  expect(request.member_loads.map(l=>[
    l.member,...l.force_per_length_n_m.slice(0,2).map(v=>v===0?0:v),
  ]).sort()).toEqual(expectedLoads.map(([id,fx,fy])=>[id,fx*turn||0,fy*turn||0]).sort());
  expect(request.member_loads.every(l=>l.coordinate_system==="global"&&l.force_per_length_n_m[2]===0)).toBe(true);
  expect(request.members.filter(m=>m.id.startsWith("C1:")).map(m=>[m.start,m.end])).toEqual([
    ["T1","MID"],["MID","B1"],
  ]);
  expect(request.supports).toEqual(["B0","B1","B2","B3"].map(node=>({
    node,restrained:[true,true,true,true,true,true],
  })));
  for (const audit of [facade_traction_path,facade_solver_audit]) {
    expect(audit).toMatchObject({
      computedStructuralApproval:false,fabricationRelease:false,releaseGate:"NOT_READY_BLOCKED",
    });
  }

  const output = await runLocalMixed(JSON.stringify(request));
  if (output.status!=="completed"||output.result.schema_version!=="jpn.mixed3d-result/2")
    throw new Error("Expected loaded PyNite results");
  const result = output.result.combinations[combinationId];
  expect(output.result.input_sha256).toBe(input_sha256);
  expect(result.equilibrium.relative_residual).toBeLessThan(1e-8);

  // Each cantilever has R = -qL and support couple = -r x qL, with L/2 = 2 m.
  const expectedReactions: Record<string,[Vector,Vector]> = {
    B0:[[1500,0,0],[0,3000,0]], B1:[[6000,0,0],[0,12000,0]],
    B2:[[4500,-3000,0],[6000,9000,0]], B3:[[0,-3000,0],[6000,0,0]],
  };
  const force:Vector = [0,0,0], moment:Vector = [0,0,0];
  for (const n of request.nodes) {
    const response = result.nodes[n.id];
    const [f,m] = expectedReactions[n.id] ?? [[0,0,0],[0,0,0]];
    closeVector(response.reaction_force_n,horizontalTurn(f));
    closeVector(response.reaction_moment_nm,horizontalTurn(m));
    const [fx,fy,fz] = response.reaction_force_n;
    const [mx,my,mz] = response.reaction_moment_nm;
    force[0]+=fx; force[1]+=fy; force[2]+=fz;
    moment[0]+=mx+n.y_m*fz-n.z_m*fy;
    moment[1]+=my+n.z_m*fx-n.x_m*fz;
    moment[2]+=mz+n.x_m*fy-n.y_m*fx;
  }
  // Face integrals: -500*24 N at (7,1,3) and +300*20 N at (9.5,4,3).
  closeVector(force,horizontalTurn([12000,-6000,0]));
  closeVector(moment,horizontalTurn([18000,36000,-69000]));
},30000);

it("rejeita apoio ausente e exige declarar até a fachada de pressão zero",async()=>{
  const p = asymmetricProject();
  const d = p.workspace.spatialPreparation!;
  const zones = d.loading!.facadeTraction!.cases[0].zones;
  const north = zones.pop()!;
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow("FACADE_ZONE_COVERAGE");
  zones.push({...zones[0]});
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow("FACADE_ZONE_COVERAGE");
  zones[1] = {...north,netPressurePa:0};
  const {request} = await adaptLoadedMixedProject(p);
  const northLoads = request.member_loads.filter(l=>l.id.includes(":NORTH:"));
  expect(northLoads).toHaveLength(2);
  for (const load of northLoads) closeVector(load.force_per_length_n_m,[0,0,0]);
  d.supports = [];
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow("SUPPORTS");
});

it.each([
  "missing","duplicate","disguised","unloaded-member","nodal","self-weight",
] as const)("rejeita carga ausente ou não rastreada no caso de fachada (%s)",async(kind)=>{
  const p = asymmetricProject();
  const {request,mapping,facade_traction_path:trace} = await adaptLoadedMixedProject(p);
  if (!trace) throw new Error("Expected facade trace");
  const load = request.member_loads[0];
  switch (kind) {
    case "missing": request.member_loads.shift(); break;
    case "duplicate": request.member_loads.push({...load}); break;
    case "disguised":
    case "unloaded-member":
      request.member_loads.push({...load,id:"GENERAL-LOAD",source:"Different source",
        revision:"Different revision",member:kind==="disguised"?load.member:"ARM"});
      break;
    case "nodal":
      request.nodal_loads.push({node:"TIP",case:caseId,fx_n:12,fy_n:0,fz_n:0,mx_nm:0,my_nm:0,mz_nm:0});
      break;
    case "self-weight":
      request.self_weight = {case:caseId,gravity_m_s2:[0,0,-9.81],axial_lumping:"half-to-end-nodes",
        densities:request.members.map(({id})=>({member:id,kg_m3:7850,source,revision}))};
      break;
  }
  expect(()=>auditFacadeSolverLoads(p,trace,request,mapping))
    .toThrow(kind==="missing"?"FACADE_AUDIT_LOAD_MISMATCH":"FACADE_AUDIT_UNTRACED_LOAD");
});
