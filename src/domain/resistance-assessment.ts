import { z } from "zod";
import type { Project } from "./models";
import type { ResistanceReport } from "./resistance-report";
import { coldformedDesignResultSchema,verifiedColdformedRequestSchema,prepareColdformedDesign,requireCurrentBucklingNumerics } from "./coldformed-design";
import { availableNormativeProcedures } from "./normative-procedures";
import { mixedInputHash } from "./mixed-analysis";
import { axialConnectionMinimum } from "./axial-connection-minimum";

export const memberExecutionSchema=z.object({schema_version:z.literal("jpn.member-design-record/1"),request:verifiedColdformedRequestSchema,result:coldformedDesignResultSchema.required({geometry_audit:true,calculation_input_sha256:true,connection_audit:true})}).strict();
export type MemberExecution=z.infer<typeof memberExecutionSchema>;
export const checkProcedures:Record<string,string>={compression:"NBR14762:2010-C.3",my_positive:"NBR14762:2010-C.4",my_negative:"NBR14762:2010-C.4",mz_positive:"NBR14762:2010-C.4",mz_negative:"NBR14762:2010-C.4",tension:"NBR14762:2010-9.6.2","compression-slenderness":"NBR14762:2010-9.7.4",shear_z:"NBR14762:2010-9.8.3","combined-9.9":"NBR14762:2010-9.9"};

/** Derived report v3. Keep the historical basic v2 contract and its own hash.
 * Supplying an availability string or an unrelated record is never execution. */
export async function buildResistanceAssessment(project:Project,base:ResistanceReport,values:unknown[]){
  if(values.length>1000)throw Error("RESISTANCE_EXECUTION_LIMIT");
  const {reportSha256,...original}=base;
  if(await mixedInputHash(original)!==reportSha256)throw Error("BASE_REPORT_TAMPERED");
  const seen=new Set<string>(),records:MemberExecution[]=[];
  for(const value of values){
    const record=memberExecutionSchema.parse(value),input=record.request.design,result=record.result,key=JSON.stringify([input.piece_id,input.combination_id]);
    requireCurrentBucklingNumerics(record.request,result);
    if(seen.has(key))throw Error("DUPLICATE_RESISTANCE_EXECUTION");seen.add(key);
    const declaration=project.workspace.spatialPreparation?.memberDesign?.find(d=>d.pieceId===input.piece_id&&d.combinationId===input.combination_id);
    if(!declaration)throw Error("RESISTANCE_EXECUTION_WITHOUT_DECLARATION");
    const expected=await prepareColdformedDesign(project,base,declaration),hash=await mixedInputHash(expected);
    if(await mixedInputHash(record.request)!==hash||result.input_sha256!==hash||await mixedInputHash(result.binding)!==await mixedInputHash(expected.design.binding)||result.piece_id!==input.piece_id||result.combination_id!==input.combination_id)throw Error("STALE_RESISTANCE_EXECUTION");
    records.push(record);
  }
  records.sort((a,b)=>a.result.piece_id.localeCompare(b.result.piece_id)||a.result.combination_id.localeCompare(b.result.combination_id));
  const executions=records.flatMap(r=>r.result.checks.map(c=>({pieceId:r.result.piece_id,combinationId:r.result.combination_id,procedure:checkProcedures[c.id]??null,checkId:c.id,status:c.status,inputSha256:r.result.input_sha256,check:c})));
  const jointDesignMinimums=executions.filter(e=>["compression","tension"].includes(e.checkId)&&base.demands.pieces.some(p=>p.pieceId===e.pieceId&&p.kind==="axial")).map(e=>({pieceId:e.pieceId,combinationId:e.combinationId,inputSha256:e.inputSha256,
    connectionIds:project.workspace.spatialPreparation?.connections?.connections.filter(c=>c.participants.some(p=>p.pieceId===e.pieceId)).map(c=>c.id)??[],
    requirement:axialConnectionMinimum(e.check.governing?.forces.nN??null,"resistance"in e.check?e.check.resistance:null,e.check.status)}));
  const calculationExecutions=[...base.loadProcedureExecutions.flatMap(e=>e.procedures.map(procedure=>({procedure,caseId:e.caseId,status:e.status,result:e.result}))),
    ...records.filter(r=>r.result.buckling_audit).map(r=>({procedure:"NBR14762:2010-9.7.2.2",pieceId:r.result.piece_id,combinationId:r.result.combination_id,status:"calculated-member-model",result:r.result.buckling_audit!.global_result})),
    ...jointDesignMinimums.map(r=>({procedure:"NBR14762:2010-10.1(a)",pieceId:r.pieceId,combinationId:r.combinationId,status:r.requirement.status,result:r.requirement}))];
  const body={...original,schema_version:"jpn.resistance-report/3" as const,baseReportSha256:reportSha256,
    normativeProceduresImplemented:[...availableNormativeProcedures],procedureExecutions:executions,executionRecords:records,jointDesignMinimums,calculationExecutions,
    procedureRegistry:availableNormativeProcedures.map(id=>({id,availability:"implemented-experimental" as const,executions:executions.filter(e=>e.procedure===id),calculations:calculationExecutions.filter(e=>e.procedure===id)})),
    pieces:original.pieces.map(p=>({...p,executedProcedures:executions.filter(e=>e.pieceId===p.pieceId),hasFailedProcedure:executions.some(e=>e.pieceId===p.pieceId&&e.status==="FAIL"),proceduresNotExecuted:availableNormativeProcedures.filter(id=>!executions.some(e=>e.pieceId===p.pieceId&&e.procedure===id))})),
    computedStructuralApproval:false as const,approvedForFabrication:false as const};
  return {...body,reportSha256:await mixedInputHash(body)};
}
