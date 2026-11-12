import {structuralAssessmentRequestSchema,prepareStructuralAssessment,finishStructuralAssessment,type ResistanceAttempt} from "@/domain/structural-assessment";
import {adaptLoadedMixedProject} from "@/domain/loaded-mixed-adapter";
import {adaptMixedProject} from "@/domain/mixed-adapter";
import {prepareColdformedDesign} from "@/domain/coldformed-design";
import type {MemberExecution} from "@/domain/resistance-assessment";
import {localMixedEnabled,localMixedLimits,runLocalMixed} from "./local-mixed-runner";
import {runLocalSection} from "./local-section-runner";
import {SolverFailure} from "./runner";

/** Reuses the capped workers sequentially, with the SAME 20 s budget for the
 * complete orchestration. No background solver, parallel worker or UI route. */
export async function runLocalStructuralAssessment(payload:string,signal?:AbortSignal){
  if(!localMixedEnabled())throw new SolverFailure("LOCAL_ONLY","Configured local structural executor required");
  if(Buffer.byteLength(payload)>localMixedLimits.inputBytes)throw new SolverFailure("INPUT_LIMIT","Input exceeds 500 kB");
  const {project}=structuralAssessmentRequestSchema.parse(JSON.parse(payload));
  if(!project.workspace.physicalStructure)throw new SolverFailure("INVALID_INPUT","Assessment requires the declared physical model");
  const declarations=project.workspace.spatialPreparation?.memberDesign??[];
  if(declarations.length>4)throw new SolverFailure("INPUT_LIMIT","At most four explicitly selected member/combination executions per request");
  const controller=new AbortController(),cancel=()=>controller.abort();
  let expired=false;
  let phase="physical-adapter";
  const timer=setTimeout(()=>{expired=true;controller.abort();},localMixedLimits.milliseconds);
  signal?.addEventListener("abort",cancel,{once:true});
  const requireActive=()=>{if(controller.signal.aborted||signal?.aborted)throw new SolverFailure(expired?"TIMEOUT":"CANCELLED","Integrated assessment cancelled or exceeded its 20 s budget");};
  try{
    requireActive();
    const adapted=await(project.workspace.spatialPreparation?.loading?adaptLoadedMixedProject(project):adaptMixedProject(project));
    phase="linear-worker";
    const analysis=await runLocalMixed(JSON.stringify(adapted.request),"connections",controller.signal);
    if(analysis.status!=="completed"||!analysis.joint_actions)throw new SolverFailure("INVALID_RESPONSE","Actual member end actions required");
    phase="continuous-demand-recovery";
    const prepared=await prepareStructuralAssessment(project,adapted,analysis.result,analysis.joint_actions);
    const records:MemberExecution[]=[],attempts:ResistanceAttempt[]=[],requests:Awaited<ReturnType<typeof prepareColdformedDesign>>[]=[];
    for(const declaration of declarations){
      requireActive();
      let request;
      try{request=await prepareColdformedDesign(project,prepared.base,declaration);}
      catch(e){attempts.push({pieceId:declaration.pieceId,combinationId:declaration.combinationId,status:"blocked",reason:e instanceof Error?e.message:String(e)});continue;}
      requests.push(request);
      attempts.push({pieceId:declaration.pieceId,combinationId:declaration.combinationId,status:"executed",reason:null});
    }
    requireActive();
    let resistanceBatch=null;
    if(requests.length){
      phase="verified-section-batch";
      const calculated=await runLocalSection(JSON.stringify({schema_version:"jpn.verified-coldformed-batch/1",requests}),controller.signal,"design-batch");
      for(let i=0;i<requests.length;i++)records.push({schema_version:"jpn.member-design-record/1",request:requests[i],result:calculated.result.results[i]});
      resistanceBatch={geometryEvaluations:calculated.result.geometry_evaluations,geometryReuses:calculated.result.geometry_reuses};
    }
    phase="assessment-binding";
    const result=await finishStructuralAssessment(project,prepared,records,attempts,resistanceBatch);
    requireActive();
    if(Buffer.byteLength(JSON.stringify(result))>localMixedLimits.outputBytes)throw new SolverFailure("OUTPUT_LIMIT","Integrated response exceeds 2 MB");
    return result;
  }catch(e){if(expired)throw new SolverFailure("TIMEOUT","Integrated assessment exceeded the unchanged 20 s budget at "+phase);throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",cancel);}
}
