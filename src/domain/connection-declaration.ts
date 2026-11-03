import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { discretizeGeometry } from "./spatial-connectivity";
import { connectionSchema,connectionsSchema } from "./connections";
import { auditConnectionGeometry } from "./connection-geometry-audit";

export function physicalConnectionNodes(project:Project){
  const model=generateStructure(project).model,draft=project.workspace.spatialPreparation;
  if(!model||!draft?.connectivity)throw new Error("CONNECTION_PREPARATION: declare/revise a conectividade física antes de cadastrar ligações.");
  const mapping=discretizeGeometry(model,draft.connectivity,structureSignature(project));
  return mapping.nodes.map(n=>({nodeId:n.id,positionMm:[n.x,n.y,n.z],pieceIds:[...new Set(mapping.members.filter(m=>m.start===n.id||m.end===n.id).map(m=>m.originalId))]}));
}
export function saveConnectionDeclaration(project:Project,value:unknown):Project{
  const d=project.workspace.spatialPreparation!,signature=structureSignature(project),c=connectionSchema.parse(value),nodes=physicalConnectionNodes(project);
  if(d.connections&&d.connections.geometrySignature!==signature)throw new Error("STALE_CONNECTION_GEOMETRY: revisão integral do cadastro existente necessária; nenhum vínculo foi renovado silenciosamente.");
  const node=nodes.find(n=>n.nodeId===c.nodeId);
  if(!node||node.pieceIds.length!==c.participants.length||c.participants.some(p=>!node.pieceIds.includes(p.pieceId)))throw new Error("CONNECTION_PARTICIPANTS: nó ou participantes não correspondem ao modelo físico.");
  const audit=auditConnectionGeometry(c);if(audit.status==="invalid-geometry")throw new Error("CONNECTION_GEOMETRY_INVALID: "+audit.issues.filter(x=>x.severity==="error").map(x=>x.message).join(" "));
  const next=connectionsSchema.parse({schema_version:"jpn.connections/1",geometrySignature:signature,connections:[...(d.connections?.connections??[]).filter(x=>x.nodeId!==c.nodeId),c]});
  return {...project,workspace:{...project.workspace,spatialPreparation:{...d,connections:next}}};
}
export function stabilityFailureExplanation(code:string){
  const messages:Record<string,string>={UNSTABLE:"Estrutura numericamente instável: revise apoios, liberações e mecanismos. Nenhum resultado foi substituído por zeros.",ILL_CONDITIONED:"Condicionamento numérico fora do limite experimental. Não foi adicionada rigidez fictícia.",DISCONNECTED_MODEL:"Modelo fisicamente desconectado ou com nós órfãos; não houve união automática.",UNSUPPORTED_RELEASE:"Liberações incompatíveis com o domínio suportado; reveja o modelo físico.",EQUILIBRIUM_FAILURE:"Equilíbrio do solver falhou; resultados bloqueados.",JOINT_EQUILIBRIUM_FAILURE:"Conferência das juntas falhou; relatório bloqueado.",UNRESOLVED_CONTACT:"Contato/encontro exige discretização e declaração física explícitas.",NUMERICAL_FAILURE:"Falha numérica do solver; não há comprovação de estabilidade nem relatório de ações."};
  return messages[code]??null;
}
