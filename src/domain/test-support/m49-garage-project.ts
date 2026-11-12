import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";
import {physicalRoofFacesSchema} from "../physical-roof-faces";
import {declaredRoofDistributionSignature} from "../declared-roof-load-path";
import {compileEngineeringCombinations,type EngineeringCombinations} from "../engineering-combinations";
import {selfWeightOverlapReviewBasis} from "../structural-loading";

/** Synthetic 6 x 4 m garage: three simply supported purlins on TWO flexible
 * simply supported beams. Only the four corners reach the existing building.
 * All stiffnesses/restraints below are explicit test inputs, not site capacities.
 * Both local bending rotations are released; torsion is explicitly connected.
 */
export function m49GarageProject(){
  const p=m34abProject();
  p.name="M49 — garagem com vigas e terças, sem tesouras";
  p.client="Referência analítica sintética; não representa obra liberada";
  const source="M49 synthetic analytical garage; no normative or site approval",revision="M49-1";
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",provenance:source,revision,
    nodes:[
      {id:"A0",x:0,y:0,z:3000},{id:"A4",x:0,y:4000,z:3000},
      {id:"C0",x:3000,y:0,z:3000},{id:"C4",x:3000,y:4000,z:3000},
      {id:"B0",x:6000,y:0,z:3000},{id:"B4",x:6000,y:4000,z:3000},
    ],
    pieces:[
      {id:"V0",role:"beam",start:"A0",end:"B0"},{id:"V4",role:"beam",start:"A4",end:"B4"},
      {id:"PA",role:"purlin",start:"A0",end:"A4"},{id:"PC",role:"purlin",start:"C0",end:"C4"},
      {id:"PB",role:"purlin",start:"B0",end:"B4"},
    ],
  });
  const d=p.workspace.spatialPreparation!,pieces=p.workspace.physicalStructure.pieces;
  d.physicalCatalog={schema_version:"jpn.physical-catalog/1",
    materials:[{id:"STEEL",steelGrade:"Synthetic isotropic reference",eGpa:200,gGpa:200/2.6,nu:.3,materialSource:source,materialRevision:revision}],
    sections:[
      {id:"BEAM",areaCm2:40,iyCm4:4000,izCm4:4000,jCm4:1000,sectionSource:source,sectionRevision:revision},
      {id:"PURLIN",areaCm2:20,iyCm4:800,izCm4:800,jCm4:100,sectionSource:source,sectionRevision:revision},
    ],
    assignments:pieces.map(m=>({pieceId:m.id,materialId:"STEEL",sectionId:m.role==="beam"?"BEAM":"PURLIN",rotationDeg:0})),
  };
  d.memberKinds=pieces.map(m=>({pieceId:m.id,kind:"frame"}));
  d.memberConnections=pieces.map(m=>({pieceId:m.id,start:"bending-pinned",end:"bending-pinned"}));
  const fixed=["fixed","fixed","fixed","fixed","fixed","fixed"] as const;
  d.supports=["A0","A4","B0","B4"].map(nodeId=>({nodeId,dofs:[...fixed]}));
  d.supportInterfaces=d.supports.map(s=>({nodeId:s.nodeId,side:s.nodeId.startsWith("A")?"A":"B",
    kind:"existing-concrete",dofs:[...fixed],source,revision,
    loadPath:"Pano -> terça -> viga flexível -> quatro interfaces existentes declaradas",
    restraintBasis:"Referência com translações e rotações dos cantos contidas; flexão liberada nas barras, torção contida explicitamente",
    reviewStatus:"site-reviewed",
  }));
  d.connectionsReview="Rótulas de flexão nos extremos físicos, sem rótula na segmentação interna das vigas; torção conectada explicitamente";
  d.lateralSystem="Quatro interfaces de referência contêm translações/rotações; C0 e C4 são nós livres em vigas flexíveis, não apoios";
  d.loadPathReview="Telhas entre terças -> três terças -> duas vigas -> quatro cantos; capacidade da construção existente pendente";
  d.loads=[];
  d.cases=[{id:"G",source:"Synthetic downward pressure 0.6 kN/m2; not an ABNT coefficient"},
    {id:"W",source:"Synthetic net wind suction 0.9 kN/m2, supplied as pressure; no automatic Cpe/Cpi"}];
  const reference={standard:"Analytical benchmark, not an ABNT standard",edition:revision,
    clause:"Euler-Bernoulli simply supported beams; explicitly unit combination factors",source,revision,responsible:"Synthetic independent validation"};
  const specs:[string,"ULS"|"SLS-characteristic",number,number][]=[
    ["G_ONLY","SLS-characteristic",1,0],["W_ONLY","SLS-characteristic",0,1],["NET","SLS-characteristic",1,1],
    ["ULS_G","ULS",1,0],["ULS_W","ULS",0,1],["ULS_NET","ULS",1,1],
  ];
  d.engineeringCombinations={schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:[{caseId:"G",category:"permanent",exclusiveGroup:null,reference},
      {caseId:"W",category:"wind",exclusiveGroup:"WIND",reference}],
    combinations:specs.map(([id,purpose,g,w])=>({id,purpose,reference,
      hypothesis:"Synthetic linear superposition with unit factors; ULS/SLS labels exercise coverage, not normative design",
      terms:[{caseId:"G",gamma:g,psi:1,reference},{caseId:"W",gamma:w,psi:1,reference}]})),
  } satisfies EngineeringCombinations;
  d.combinations=compileEngineeringCombinations(d.engineeringCombinations,d.cases.map(c=>c.id)).combinations;
  d.physicalRoofFaces=physicalRoofFacesSchema.parse({schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,
    faces:[{id:"ROOF",source,revision,outer:[[0,0,3000],[6000,0,3000],[6000,4000,3000],[0,4000,3000],[0,0,3000]],
      holes:[],supportPieceIds:["PA","PC","PB"]}],
  });
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[
    {caseId:"G",knM2:.6,projection:"horizontal",direction:[0,0,-1],source,revision,loadPath:d.loadPathReview},
    {caseId:"W",knM2:.9,projection:"horizontal",direction:[0,0,1],source,revision,loadPath:d.loadPathReview},
  ]};
  refreshM49Garage(p);
  return p;
}

/** Test-only explicit re-review. Production never refreshes declarations itself. */
export function refreshM49Garage(p:ReturnType<typeof m34abProject>){
  reviewM34Fixture(p);
  const d=p.workspace.spatialPreparation!,loading=d.loading!;
  loading.roofDistribution={version:1,method:"parallel-purlin-strips",geometrySignature:declaredRoofDistributionSignature(p)};
  delete loading.overlapReview;
  loading.overlapReview={confirmed:true,source:"M49 independent gravity and wind actions explicitly reviewed",revision:"M49-1",
    basis:selfWeightOverlapReviewBasis(d,loading)};
  return p;
}
