import { mixedReferenceProject } from "./mixed-project";
import { pieceRoles } from "../spatial-preparation";
import { generateStructure } from "../calculations/structure";
export function loadedMixedReferenceProject(){
  const p=mixedReferenceProject(),d=p.workspace.spatialPreparation!;
  p.name="EXEMPLO SINTÉTICO — PESO E CARGAS UNIFORMES";
  for(const r of pieceRoles)d.groups[r].density={kgM3:1000,source:"Densidade sintética de teste; não representa aço/material de obra",revision:"M17-R1"};
  const piece=generateStructure(p).model!.pieces.find(p=>p.role==="purlin")!;
  d.cases.push({id:"PP-DEMO",source:"Caso permanente sintético: rho=1000 kg/m³ e g=(0,0,-10) m/s² declarados para validação"});
  d.cases[0].source+="; mais carga uniforme sintética -0,1 kN/m em Z na terça declarada";
  d.loading={version:1,selfWeight:{caseId:"PP-DEMO",gravity:[0,0,-10],axialLumping:"half-to-end-nodes"},uniform:[{id:"Q-DEMO",pieceId:piece.id,caseId:"TESTE",coordinates:"global",knM:[0,0,-.1],source:"Carga uniforme sintética, sem ação normativa presumida",revision:"M17-R1"}],roofArea:[]};
  d.combinations=[{id:"TOTAL",factors:{TESTE:1,INVERSO:0,"PP-DEMO":1}},{id:"PESO",factors:{TESTE:0,INVERSO:0,"PP-DEMO":1}},{id:"INVERSO-TOTAL",factors:{TESTE:-1,INVERSO:0,"PP-DEMO":-1}}];
  return p;
}
