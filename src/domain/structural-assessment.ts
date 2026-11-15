import {z} from "zod";
import {projectSchema,type Project} from "./models";
import {mixedInputHash} from "./mixed-analysis";
import {buildResistanceReport,type ResistanceReport} from "./resistance-report";
import {buildResistanceAssessment,type MemberExecution,checkProcedures} from "./resistance-assessment";
import {buildConnectionReport,type ConnectionReport} from "./connection-report";
import {auditPhysicalRestraints} from "./physical-restraints";
import {memberDesignBasis} from "./coldformed-design";
import type {DemandInput} from "./member-demands";
import type {coldformedDesignResultSchema} from "./coldformed-design";
import type {ElasticLtbAttempt} from "./elastic-ltb";

export const structuralAssessmentRequestSchema=z.object({schema_version:z.literal("jpn.structural-assessment/1"),project:projectSchema}).strict();
export type ResistanceAttempt={pieceId:string;combinationId:string;status:"executed"|"blocked";reason:string|null};
const formula=(id:string,capacity?:z.infer<typeof coldformedDesignResultSchema>["capacities"][string])=>{
  if(id==="compression"||/m[yz]_(positive|negative)/.test(id))return "R_d = min(R_global, R_local, R_distortional) / gamma; branch equations in compression_mrd / bending_mrd";
  if(id==="shear_z")return capacity?.branch==="yield"?"V_Rd = 0.6 fy h t / gamma":capacity?.branch==="inelastic-buckling"?"V_Rd = 0.65 t^2 sqrt(5 fy E) / gamma":"V_Rd = 0.905 (5 E t^3 / h) / gamma";
  if(id==="combined-9.9")return "abs(N)/N_Rd(sign) + abs(My)/My_Rd(sign) + abs(Mz)/Mz_Rd(sign) <= 1, at the same position";
  if(id==="compression-slenderness")return "max(Ley / sqrt(Iy/A), Lez / sqrt(Iz/A)) <= 200";
  if(id==="tension")return "N_Rd = min(A fy/1.10, An,out fu/1.35, Ct An,connection fu/1.65)";
  return null;
};

/** Never add opposing participants and call the zero joint balance its design
 * demand. Keep EACH original member's concurrent wrench and actual support load.
 * No bolt count, anchor allocation, eccentricity or capacity is inferred. */
export function connectionTransferDemands(joints:ConnectionReport,base:ResistanceReport){
  return {schema_version:"jpn.connection-transfer-demands/1" as const,inputSha256:base.binding.inputSha256,
    combinations:joints.combinations.map(c=>({combinationId:c.combinationId,
      joints:c.joints.map(node=>({nodeId:node.nodeId,balance:node.balance,
        participants:[...new Set(node.ends.map(e=>e.pieceId))].map(pieceId=>{
          const ends=node.ends.filter(e=>e.pieceId===pieceId),force=[0,0,0],moment=[0,0,0];
          for(const e of ends){e.memberOnNodeGlobal.forceN.forEach((v,i)=>force[i]+=v);e.memberOnNodeGlobal.momentNm?.forEach((v,i)=>moment[i]+=v);}
          return {pieceId,segmentIds:ends.map(e=>e.segmentId),hasPhysicalMemberEnd:ends.some(e=>e.originalPieceEnd),
            memberOnConnection:{forceN:force,momentNm:moment},requiredConnectionOnMember:{forceN:force.map(v=>-v),momentNm:moment.map(v=>-v)},
            fastenerAllocation:null,verifiedCapacity:null,capacityStatus:"not-verified" as const};
        })})),
      supports:c.joints.filter(n=>n.support).map(n=>({nodeId:n.nodeId,reactionOnSteel:n.reaction,
        loadOnExistingStructure:{forceN:n.reaction.forceN.map(v=>-v),momentNm:n.reaction.momentNm?.map(v=>-v)??null},
        requiredUpliftConnectionN:Math.max(0,-n.reaction.forceN[2]),requiredHorizontalTransferN:Math.hypot(...n.reaction.forceN.slice(0,2)),
        declaredCapacityComparison:base.supportAudits.find(s=>s.nodeId===n.nodeId&&s.combinationId===c.combinationId)??null,
        verifiedConnectionCapacity:null,capacityStatus:"not-verified" as const,
        limitation:"Demand is at the FE node; anchor layout, offsets, contact loss, prying and resistance of the existing structure require separate verification"})),
    })),normativeApproval:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}

export async function prepareStructuralAssessment(project:Project,prepared:DemandInput,result:unknown,trace:unknown){
  const base=await buildResistanceReport(project,prepared,result,trace);
  if(!base.continuousDemands)throw Error("CONTINUOUS_DEMANDS_REQUIRED");
  const joints=await buildConnectionReport(project,prepared,result,trace);
  const restraints=await auditPhysicalRestraints(project,prepared,result,trace,base.continuousDemands);
  const studyBases=await Promise.all((project.workspace.spatialPreparation?.resistance??[]).map(async p=>({pieceId:p.pieceId,basisSha256:await memberDesignBasis(project,base,p.pieceId)})));
  return {base,joints,restraints,studyBases,transfers:connectionTransferDemands(joints,base)};
}

export async function finishStructuralAssessment(project:Project,prepared:Awaited<ReturnType<typeof prepareStructuralAssessment>>,records:MemberExecution[],attempts:ResistanceAttempt[],resistanceBatch:{geometryEvaluations:number;geometryReuses:number}|null=null,lateralTorsional:ElasticLtbAttempt[]=[]){
  const original=await buildResistanceAssessment(project,prepared.base,records);
  // Preserve the base/verified-resistance records and their own hashes. Attach
  // elastic evidence to the actual member without changing any normative state.
  const {reportSha256,...originalBody}=original;
  const withLtb={...originalBody,priorAssessmentSha256:reportSha256,elasticLateralTorsional:lateralTorsional,
    pieces:original.pieces.map(p=>({...p,elasticLateralTorsional:lateralTorsional.filter(s=>s.study.pieceId===p.pieceId)}))};
  const resistance=lateralTorsional.length?{...withLtb,reportSha256:await mixedInputHash(withLtb)}:original;
  const checks=records.flatMap(record=>record.result.checks.map(check=>({pieceId:record.result.piece_id,combinationId:record.result.combination_id,
    profile:prepared.base.pieces.find(p=>p.pieceId===record.result.piece_id)!.profileDesignation,
    steel:prepared.base.pieces.find(p=>p.pieceId===record.result.piece_id)!.physicalProperties.steelGrade,
    section:record.request.design.section,computedGrossProperties:record.result.geometry_audit!.computed_properties,
    failureMode:check.id,procedure:checkProcedures[check.id]??null,standard:record.result.standard,
    formula:check.status==="BLOCKED"?null:formula(check.id,record.result.capacities[check.id]),
    implementation:"engine/jpn_structural/coldformed_design.py",referenceEvidence:"docs/ENTREGA-RESISTENCIA-UE-MRD.md; docs/ENGINE-NORMATIVE-TRACEABILITY.md",
    check,criticalStudy:record.request.design.study,calculationInputSha256:record.result.input_sha256,
    allMemberLimitStatesVerified:false as const})));
  const body={schema_version:"jpn.structural-assessment-result/1" as const,status:"partial-analysis-completed-experimental" as const,
    analysisInputSha256:prepared.base.binding.inputSha256,analysisResultSha256:prepared.base.binding.resultSha256,
    report:resistance,restraints:prepared.restraints,studyBases:prepared.studyBases,transfers:prepared.transfers,resistanceAttempts:attempts,resistanceBatch,checks,lateralTorsional,
    computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const,
    remaining:["M43/M44/M45 are not complete: lateral-torsional/local/distortional stability, full resistance, connections and existing supports need their applicable verifications.",
      "External critical-mode inputs remain conditional; declared restraint capacities are not verified resistances.",
      "Second order, eccentric/semirigid connections, contact loss and per-anchor force allocation are outside this integrated linear assessment."]};
  return {...body,assessmentSha256:await mixedInputHash(body)};
}
