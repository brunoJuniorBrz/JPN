import type { evaluateDeclaredService } from "./declared-service";
import type { Project } from "./models";
import { auditConnectionGeometry } from "./connection-geometry-audit";

/** Gate for the CURRENT implementation, never a user-editable approval flag.
 * No normative procedure is registered in this revision. Numeric/declared
 * criterion success cannot satisfy an absent normative stage. */
export function buildEngineReleaseGate(project:Project,report:{binding:Record<string,unknown>;continuousDemands:unknown;wholePieceDeflections:unknown;serviceChecks:ReturnType<typeof evaluateDeclaredService>}){
  const connections=project.workspace.spatialPreparation?.connections?.connections??[],geometry=connections.map(c=>({connectionId:c.id,...auditConnectionGeometry(c)}));
  const blocked=[
    {id:"normative-actions",reason:"Vento, fatores favoráveis/desfavoráveis e combinações ainda declarados; nenhum procedimento normativo homologado."},
    {id:"normative-member-resistance",reason:"Texto/procedimentos integrais não confirmados; tração, compressão, flexão, cisalhamento, torção e interações resistentes não implementados integralmente."},
    {id:"mixed-second-order",reason:"PyNite Spring3D não contribui para Kg; segunda ordem do modelo misto atual não validada. O solver permanece linear."},
    {id:"normative-service",reason:"Limites declarados e flecha da corda não comprovam aplicabilidade/combinações normativas nem todos os critérios de serviço."},
    {id:"connection-and-foundation",reason:"Geometria computada não verifica parafusos, soldas, chapas, ancoragens ou capacidade da fundação."},
    {id:"two-external-roof-models",reason:"Referências CUFSM são de seção elástica. Não há dois modelos completos de cobertura equivalentes reproduzidos e aprovados."},
    ...geometry.filter(x=>x.status==="invalid-geometry").map(x=>({id:`invalid-connection:${x.connectionId}`,reason:x.issues.filter(i=>i.severity==="error").map(i=>i.message).join(" ")})),
    ...report.serviceChecks.filter(x=>x.status==="exceeds-declared-limit").map(x=>({id:`service-limit:${x.criterion.id}`,reason:"Flecha calculada excede o limite explicitamente declarado."})),
  ];
  return {schema_version:"jpn.engine-release-gate/1",analysisBinding:report.binding,status:"NOT_READY_BLOCKED" as const,
    stages:{linearAnalysis:"calculated",forceComponents:report.continuousDemands?"continuous-recovered":"sampled-only",wholePieceKinematics:report.wholePieceDeflections?"evaluated-per-piece":"unavailable",declaredServiceCriteria:report.serviceChecks.map(c=>({id:c.criterion.id,status:c.status})),connectionGeometry:geometry.map(x=>({id:x.connectionId,status:x.status}))},
    blocked,implementedNormativeProcedures:[] as string[],computedStructuralApproval:false,professionalReview:"not-granted",legalResponsibility:"not-issued",fabricationRelease:false};
}
