import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";

/** Synthetic 6 x 5 x 4 m shed: two portal frames with pinned bases, joined in
 * the longitudinal direction ONLY by two purlins, plus optional declared axial
 * diagonals. Longitudinal load at the eaves. Properties are explicit test
 * inputs, not site data or approved sections. */
export type ShedOptions={purlinGroup:"rigid"|"bending-pinned";explicitRigidPurlins?:boolean;braced?:boolean};
export function secondaryFixityShed(o:ShedOptions){
  const p=m34abProject(),source="C2 synthetic stability reference; no normative or site approval",revision="C2-1";
  p.name="C2 — estabilidade longitudinal e engaste presumido de terças";
  const brace=o.braced?[{id:"X1",role:"web",start:"B1",end:"T3"},{id:"X2",role:"web",start:"B2",end:"T4"}]:[];
  p.workspace.physicalStructure=declaredStructureSchema.parse({schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",provenance:source,revision,
    nodes:[{id:"B1",x:0,y:0,z:0},{id:"T1",x:0,y:0,z:4000},{id:"B2",x:6000,y:0,z:0},{id:"T2",x:6000,y:0,z:4000},
      {id:"B3",x:0,y:5000,z:0},{id:"T3",x:0,y:5000,z:4000},{id:"B4",x:6000,y:5000,z:0},{id:"T4",x:6000,y:5000,z:4000}],
    pieces:[{id:"C1",role:"column",start:"B1",end:"T1"},{id:"C2",role:"column",start:"B2",end:"T2"},
      {id:"C3",role:"column",start:"B3",end:"T3"},{id:"C4",role:"column",start:"B4",end:"T4"},
      {id:"R1",role:"topChord",start:"T1",end:"T2"},{id:"R2",role:"topChord",start:"T3",end:"T4"},
      {id:"P1",role:"purlin",start:"T1",end:"T3"},{id:"P2",role:"purlin",start:"T2",end:"T4"},...brace],
  });
  const d=p.workspace.spatialPreparation!,pieces=p.workspace.physicalStructure.pieces;
  d.physicalCatalog={schema_version:"jpn.physical-catalog/1",
    materials:[{id:"STEEL",steelGrade:"Synthetic isotropic reference",eGpa:200,gGpa:200/2.6,nu:.3,materialSource:source,materialRevision:revision}],
    sections:[{id:"MAIN",areaCm2:40,iyCm4:4000,izCm4:4000,jCm4:100,sectionSource:source,sectionRevision:revision},
      {id:"PURLIN",areaCm2:6,iyCm4:80,izCm4:10,jCm4:.2,sectionSource:source,sectionRevision:revision},
      {id:"BRACE",areaCm2:5,iyCm4:1,izCm4:1,jCm4:1,sectionSource:source,sectionRevision:revision}],
    assignments:pieces.map(m=>({pieceId:m.id,materialId:"STEEL",sectionId:m.role==="purlin"?"PURLIN":m.role==="web"?"BRACE":"MAIN",rotationDeg:0})),
  };
  d.groups.column.connection="rigid";d.groups.topChord.connection="rigid";d.groups.web.connection="axial";
  d.groups.purlin.connection=o.purlinGroup;
  d.memberKinds=pieces.map(m=>({pieceId:m.id,kind:m.role==="web"?"axial":"frame"}));
  // Only an explicit per-piece declaration counts as a declared moment connection.
  d.memberConnections=o.explicitRigidPurlins?["P1","P2"].map(pieceId=>({pieceId,start:"rigid",end:"rigid"})):[];
  d.supports=["B1","B2","B3","B4"].map(nodeId=>({nodeId,dofs:["fixed","fixed","fixed","free","free","fixed"]}));
  delete d.supportInterfaces;delete d.engineeringCombinations;delete d.loading;delete d.physicalRoofFaces;
  d.connectionsReview="Pórticos rígidos no plano XZ; ligação das terças conforme a variante do ensaio";
  d.lateralSystem=o.braced?"Diagonais axiais declaradas B1-T3 e B2-T4":"Nenhum contraventamento longitudinal declarado";
  d.loadPathReview="Força longitudinal nos beirais -> sistema longitudinal declarado -> bases";
  d.cases=[{id:"W",source:"Synthetic longitudinal action 2 x 1 kN; not a wind calculation"}];
  d.combinations=[{id:"C",factors:{W:1}}];
  d.loads=["T1","T2"].map((nodeId,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,nodeId,caseId:"W",fxKn:0,fyKn:1,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0}));
  return reviewM34Fixture(p);
}
