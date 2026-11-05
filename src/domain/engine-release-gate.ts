import type { evaluateDeclaredService } from "./declared-service";
import type { Project } from "./models";
import { auditConnectionGeometry } from "./connection-geometry-audit";
import { availableNormativeProcedures,normativeProcedureRegistry } from "./normative-procedures";

/** Gate for the CURRENT implementation, never a user-editable approval flag.
 * Only partial normative procedures are registered; complete families are not. Numeric/declared
 * criterion success cannot satisfy an absent normative stage. */
export function buildEngineReleaseGate(project:Project,report:{binding:Record<string,unknown>;continuousDemands:unknown;wholePieceDeflections:unknown;serviceChecks:ReturnType<typeof evaluateDeclaredService>}){
  const connections=project.workspace.spatialPreparation?.connections?.connections??[],geometry=connections.map(c=>({connectionId:c.id,...auditConnectionGeometry(c)}));
  const blocked=[
    {id:"normative-actions",reason:"S2/Vk/q são calculáveis no escopo de terreno plano; isopletas, coeficientes externos/internos, aplicabilidade, correções da edição e combinações ainda exigem validação completa."},
    {id:"normative-member-resistance",reason:"Procedimentos Ue/MRD parciais disponíveis; torção, todas as interações, famílias, condições de carga e comprovação integral de cada peça ainda não estão concluídos."},
    {id:"mixed-second-order",reason:"PyNite Spring3D não contribui para Kg; segunda ordem do modelo misto atual não validada. O solver permanece linear."},
    {id:"normative-service",reason:"Limites declarados e flecha da corda não comprovam aplicabilidade/combinações normativas nem todos os critérios de serviço."},
    {id:"connection-and-foundation",reason:"O mínimo axial 10.1(a) é calculável separadamente; capacidades de parafusos, soldas, chapas, ancoragens e fundações continuam sem verificação completa."},
    {id:"two-external-roof-models",reason:"Referências CUFSM são de seção elástica. Não há dois modelos completos de cobertura equivalentes reproduzidos e aprovados."},
    ...geometry.filter(x=>x.status==="invalid-geometry").map(x=>({id:`invalid-connection:${x.connectionId}`,reason:x.issues.filter(i=>i.severity==="error").map(i=>i.message).join(" ")})),
    ...report.serviceChecks.filter(x=>x.status==="exceeds-declared-limit").map(x=>({id:`service-limit:${x.criterion.id}`,reason:"Flecha calculada excede o limite explicitamente declarado."})),
  ];
  return {schema_version:"jpn.engine-release-gate/1",analysisBinding:report.binding,status:"NOT_READY_BLOCKED" as const,
    stages:{linearAnalysis:"calculated",forceComponents:report.continuousDemands?"continuous-recovered":"sampled-only",wholePieceKinematics:report.wholePieceDeflections?"evaluated-per-piece":"unavailable",declaredServiceCriteria:report.serviceChecks.map(c=>({id:c.criterion.id,status:c.status})),connectionGeometry:geometry.map(x=>({id:x.connectionId,status:x.status}))},
    blocked,implementedNormativeProcedures:[...availableNormativeProcedures],procedureRegistry:normativeProcedureRegistry,computedStructuralApproval:false,professionalReview:"not-granted",legalResponsibility:"not-issued",fabricationRelease:false};
}
