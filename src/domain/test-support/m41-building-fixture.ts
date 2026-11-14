import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";
import {physicalFacadesSchema,fromFacadeLocal} from "../physical-facades";
import type {FacadeOrientation} from "../physical-facades";
type Dof="fixed"|"free";
export type Side="EAST"|"WEST"|"NORTH"|"SOUTH";
/** Synthetic 12 m (X) x 6 m (Y) x 4 m building on a closed ring of eight real
 * fixed-base columns (corner columns are shared by two walls). `walls` selects
 * which of the four physical facades are declared. */
export const BUILDING={aM:12,bM:6,hM:4};
const X=12000,Y=6000,H=4000;
const cols=[[0,0],[6000,0],[X,0],[X,3000],[X,Y],[6000,Y],[0,Y],[0,3000]] as const;
const colId=(x:number,y:number)=>"C"+x+"_"+y;
const wallDef:Record<Side,{o:FacadeOrientation;plane:number;u:[number,number];ids:string[]}>={
  EAST:{o:"+X",plane:X,u:[0,Y],ids:[colId(X,0),colId(X,3000),colId(X,Y)]},
  WEST:{o:"-X",plane:0,u:[-Y,0],ids:[colId(0,0),colId(0,3000),colId(0,Y)]},
  NORTH:{o:"+Y",plane:Y,u:[-X,0],ids:[colId(0,Y),colId(6000,Y),colId(X,Y)]},
  SOUTH:{o:"-Y",plane:0,u:[0,X],ids:[colId(0,0),colId(6000,0),colId(X,0)]},
};
export function buildingProject(caseIds:string[],walls:Side[]=["EAST","WEST","NORTH","SOUTH"]){
  const p=m34abProject(),source="Modelo sintético de edificação retangular sobre pilares reais",
    revision="Revisão física do ensaio M41-P5";
  const nodes=cols.flatMap(([x,y])=>[{id:"B"+x+"_"+y,x,y,z:0},{id:"T"+x+"_"+y,x,y,z:H}]);
  const columns=cols.map(([x,y])=>({id:colId(x,y),role:"column" as const,start:"B"+x+"_"+y,end:"T"+x+"_"+y}));
  const ring=cols.map(([x,y],i)=>{const [x2,y2]=cols[(i+1)%cols.length];
    return {id:"TOP"+i,role:"topChord" as const,start:"T"+x+"_"+y,end:"T"+x2+"_"+y2};});
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",provenance:source,revision,
    nodes,pieces:[...columns,...ring]});
  const all=[...columns,...ring],d=p.workspace.spatialPreparation!;
  d.physicalCatalog!.assignments=all.map(x=>({pieceId:x.id,materialId:"STEEL",sectionId:"S1",rotationDeg:0}));
  d.memberKinds=all.map(x=>({pieceId:x.id,kind:"frame" as const}));
  d.memberConnections=all.map(x=>({pieceId:x.id,start:"rigid" as const,end:"rigid" as const}));
  d.supports=nodes.map(n=>({nodeId:n.id,dofs:(n.id.startsWith("B")?
    ["fixed","fixed","fixed","fixed","fixed","fixed"]:["fixed","fixed","fixed","free","free","free"]) as
    [Dof,Dof,Dof,Dof,Dof,Dof]}));
  d.cases=caseIds.map(id=>({id,source:"Caso gerado a partir da NBR 6123 Tabela 6 e Cpi 6.3.2.1"}));
  d.combinations=[{id:"ELASTIC-WIND",factors:{[caseIds[0]]:1}}];
  d.loads=[];d.connectionsReview="Conexões físicas rígidas somente na referência sintética";
  d.lateralSystem="Bases engastadas e topos apoiados lateralmente em nós explícitos";
  d.loadPathReview="Fechamento simplesmente apoiado horizontalmente transfere tração aos pilares reais";
  d.physicalFacades=physicalFacadesSchema.parse({schema_version:"jpn.physical-facades/1",units:"mm",source,revision,
    facades:walls.map(side=>{const w=wallDef[side];
      const o=[[w.u[0],0],[w.u[1],0],[w.u[1],H],[w.u[0],H]].map(q=>fromFacadeLocal(w.o,w.plane,q as [number,number]));
      return {id:side,kind:"wall" as const,outward:w.o,enclosure:"cladded" as const,outer:[...o,o[0]],openings:[],
        supportPieceIds:w.ids,source,revision,enclosureSource:"Inspeção física sintética do revestimento"};})});
  const ref={standard:"ABNT NBR 6123",edition:"2023",clause:"Tabela 6; 6.3.2.1",source:"Cálculo do ensaio M41-P5",
    revision:"v1",responsible:"Responsável técnico de referência não substituído pelo JPN"};
  d.engineeringCombinations={schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:caseIds.map(c=>({caseId:c,category:"wind" as const,exclusiveGroup:"WIND-ALT",reference:ref})),
    combinations:[{id:"ELASTIC-WIND",purpose:"SLS-characteristic" as const,
      hypothesis:"Caso de serviço sintético, sem fatores de norma presumidos",reference:ref,
      terms:[{caseId:caseIds[0],gamma:1,psi:1,reference:ref}]}]};
  reviewM34Fixture(p);
  return p;
}
