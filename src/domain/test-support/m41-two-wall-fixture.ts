import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {declaredStructureSchema} from "../declared-structure";
import {physicalFacadesSchema} from "../physical-facades";
type Dof="fixed"|"free";
/** Synthetic 12 m (X) x 6 m (Y) x 4 m building: only the two walls facing
 * +/-X are modelled, each on three real fixed-base columns. */
export function twoWallProject(caseIds:string[]){
  const p=m34abProject(),source="Modelo sintético de duas paredes opostas com pilares reais",
    revision="Revisão física do ensaio M41-P4";
  const nodes=[0,8000].flatMap(x=>[0,3000,6000].flatMap((y,i)=>[
    {id:"B"+x+"_"+i,x,y,z:0},{id:"T"+x+"_"+i,x,y,z:4000}]));
  const columns=[0,8000].flatMap(x=>[0,1,2].map(i=>(
    {id:"C"+x+"_"+i,role:"column" as const,start:"B"+x+"_"+i,end:"T"+x+"_"+i})));
  const chords=[0,8000].flatMap(x=>[0,1].map(i=>(
    {id:"TOP"+x+"_"+i,role:"topChord" as const,start:"T"+x+"_"+i,end:"T"+x+"_"+(i+1)})));
  // One connected structure: roof tie between the two wall systems.
  chords.push({id:"TIE",role:"topChord" as const,start:"T0_1",end:"T8000_1"});
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",provenance:source,revision,
    nodes,pieces:[...columns,...chords]});
  const all=[...columns,...chords],d=p.workspace.spatialPreparation!;
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
  const wall=(id:string,outward:"+X"|"-X",x:number,ids:string[])=>{
    const o:[number,number,number][]=outward==="+X"?[[x,0,0],[x,6000,0],[x,6000,4000],[x,0,4000]]:
      [[x,0,0],[x,0,4000],[x,6000,4000],[x,6000,0]]; // counter-clockwise seen from outside
    return {id,kind:"wall" as const,outward,enclosure:"cladded" as const,outer:[...o,o[0]],openings:[],
      supportPieceIds:ids,source,revision,enclosureSource:"Inspeção física sintética do revestimento"};};
  d.physicalFacades=physicalFacadesSchema.parse({schema_version:"jpn.physical-facades/1",units:"mm",source,revision,
    facades:[wall("EAST","+X",8000,["C8000_0","C8000_1","C8000_2"]),wall("WEST","-X",0,["C0_0","C0_1","C0_2"])]});
  const ref={standard:"ABNT NBR 6123",edition:"2023",clause:"Tabela 6; 6.3.2.1",source:"Cálculo do ensaio M41-P4",
    revision:"v1",responsible:"Responsável técnico de referência não substituído pelo JPN"};
  d.engineeringCombinations={schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:caseIds.map(c=>({caseId:c,category:"wind" as const,exclusiveGroup:"WIND-ALT",reference:ref})),
    combinations:[{id:"ELASTIC-WIND",purpose:"SLS-characteristic" as const,
      hypothesis:"Caso de serviço sintético, sem fatores de norma presumidos",reference:ref,
      terms:[{caseId:caseIds[0],gamma:1,psi:1,reference:ref}]}]};
  reviewM34Fixture(p);
  return p;
}
