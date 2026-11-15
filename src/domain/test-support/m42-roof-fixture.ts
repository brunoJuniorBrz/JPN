import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";
import {physicalRoofFacesSchema} from "../physical-roof-faces";
type Dof="fixed"|"free";
/** Two-pitch synthetic roof: 8 m x 5 m in plan, three purlins (x=0, 4, 8 m), ridge at x=4 m,
 * both faces sloping 10 % (z = 3.0 m at the eaves, 3.4 m at the ridge), real fixed supports.
 * One "ZERO" reference case with a zero nodal load keeps the nodal-contact audit satisfied. */
export function roofProject(){
  const p=m34abProject();
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"Levantamento estrutural M42-P2",provenance:"Referência matemática de três terças e dois panos",
    nodes:[{id:"A",x:0,y:0,z:3000},{id:"B",x:0,y:5000,z:3000},{id:"C",x:4000,y:0,z:3400},{id:"D",x:4000,y:5000,z:3400},
      {id:"E",x:8000,y:0,z:3000},{id:"F",x:8000,y:5000,z:3000}],
    pieces:[{id:"P1",role:"purlin",start:"A",end:"B"},{id:"P2",role:"purlin",start:"C",end:"D"},{id:"P3",role:"purlin",start:"E",end:"F"},
      {id:"TC1",role:"topChord",start:"A",end:"C"},{id:"TC2",role:"topChord",start:"C",end:"E"}],
  });
  const d=p.workspace.spatialPreparation!,all=["P1","P2","P3","TC1","TC2"];
  d.physicalCatalog!.assignments=all.map(pieceId=>({pieceId,materialId:"STEEL",sectionId:"S1",rotationDeg:0}));
  d.memberKinds=all.map(pieceId=>({pieceId,kind:"frame" as const}));
  d.memberConnections=all.map(pieceId=>({pieceId,start:"rigid" as const,end:"rigid" as const}));
  const fixed:Dof[]=["fixed","fixed","fixed","fixed","fixed","fixed"],sliding:Dof[]=["fixed","fixed","fixed","free","free","free"];
  d.supports=["A","B","C","D","E","F"].map(nodeId=>({nodeId,dofs:(["A","C","E"].includes(nodeId)?fixed:sliding) as
    [Dof,Dof,Dof,Dof,Dof,Dof]}));
  d.cases=[{id:"ZERO",source:"Referência nula explícita para auditoria do contato nodal"}];
  d.combinations=[{id:"C0",factors:{ZERO:1}}];
  d.loads=[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",caseId:"ZERO",nodeId:"A",fxKn:0,fyKn:0,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0}];
  d.connectionsReview="Três terças de pórtico com vinculação física explícita, sem barra fictícia";
  d.lateralSystem="Todos os seis nós possuem vínculos conhecidos, com rotações de extremos distais livres";
  d.loadPathReview="Chapa simplesmente apoiada entre terças e carregamento de linha em cada barra real";
  const make=(q:[[number,number],[number,number],[number,number],[number,number]],z:(x:number)=>number)=>
    [...q,q[0]].map(([x,y])=>[x,y,z(x)] as [number,number,number]);
  const source="Geometria referencial medida em XYZ",revision="Revisão técnica carregamento M42-P2";
  d.physicalRoofFaces=physicalRoofFacesSchema.parse({schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,faces:[
    {id:"LEFT",outer:make([[0,0],[4000,0],[4000,5000],[0,5000]],x=>3000+.1*x),holes:[],supportPieceIds:["P1","P2"],source,revision},
    {id:"RIGHT",outer:make([[4000,0],[8000,0],[8000,5000],[4000,5000]],x=>3800-.1*x),holes:[],supportPieceIds:["P2","P3"],source,revision}]});
  reviewM34Fixture(p);
  return p;
}
