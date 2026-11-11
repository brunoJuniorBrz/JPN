import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";

/** Synthetic fixture only; never a template for the physical Tom structure. */
export function m43FrameProject(){
  const p=m34abProject(),source="Independent M43-P2 synthetic fixed-free reference";
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",revision:"M43-P2-R1",provenance:source,
    nodes:[{id:"B0",x:0,y:0,z:0},{id:"T0",x:0,y:0,z:4000}],
    pieces:[{id:"COLUMN",role:"column",start:"B0",end:"T0"}],
  });
  const d=p.workspace.spatialPreparation!,catalog=d.physicalCatalog!;
  Object.assign(catalog.sections.find(s=>s.id==="S1")!,{areaCm2:200,iyCm4:2000,izCm4:2000,jCm4:2000,
    sectionSource:"Synthetic A=0.02m2; Iy=Iz=J=2e-5m4; no certified profile",sectionRevision:"M43-P2"});
  catalog.assignments=[{pieceId:"COLUMN",materialId:"STEEL",sectionId:"S1",rotationDeg:0}];
  d.memberKinds=[{pieceId:"COLUMN",kind:"frame"}];
  d.memberConnections=[{pieceId:"COLUMN",start:"rigid",end:"rigid"}];
  d.supports=[{nodeId:"B0",dofs:["fixed","fixed","fixed","fixed","fixed","fixed"]}];
  d.cases=[{id:"P",source},{id:"H",source}];d.combinations=[{id:"C",factors:{P:1,H:1}}];
  d.loads=[
    {id:"11111111-1111-4111-8111-111111111111",caseId:"P",nodeId:"T0",fxKn:0,fyKn:0,
      fzKn:-.2*Math.PI**2*200e9*2e-5/(4*4**2)/1000,mxKnm:0,myKnm:0,mzKnm:0},
    {id:"22222222-2222-4222-8222-222222222222",caseId:"H",nodeId:"T0",fxKn:2,fyKn:0,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0},
  ];
  delete d.loading;
  d.connectionsReview="Known rigid-ended synthetic cantilever; not a connection capacity check";
  d.lateralSystem="Explicitly fixed base; no wall, foundation or brace stiffness invented";
  d.loadPathReview="Two explicit global nodal dead forces at the measured synthetic top";
  return reviewM34Fixture(p);
}
export const m43Numerics={coarse_subdivisions:32,fine_subdivisions:64,max_tc_iterations:30,
  equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4};
