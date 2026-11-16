import {secondOrderMixedRequestSchema} from "./structural-loading";
import {mixedInputHash} from "./mixed-analysis";
import type {Project} from "./models";
import {adaptMixedProject} from "./mixed-adapter";
import {adaptLoadedMixedProject,adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";

/** Rebuild the CURRENT adapter output for the contract version an analysis was run with, so reports and restores
 * compare like with like (/1 nodal, /2 loaded legacy axes, /3 loaded + reviewed Z-up axes). */
export type MixedRequestVersion="jpn.mixed3d/1"|"jpn.mixed3d/2"|"jpn.mixed3d/3";
export function requestVersionOf(request:unknown):MixedRequestVersion{
  const v=(request as {schema_version?:unknown})?.schema_version;
  if(v==="jpn.mixed3d/1"||v==="jpn.mixed3d/2"||v==="jpn.mixed3d/3")return v;
  throw new Error("Versão de contrato misto desconhecida.");
}
export async function adaptMixedForVersion(project:Project,version:MixedRequestVersion){
  if(version==="jpn.mixed3d/3")return await adaptLoadedMixedProjectV3(project);
  if(version==="jpn.mixed3d/2")return await adaptLoadedMixedProject(project);
  return await adaptMixedProject(project);
}

import {structureSignature} from "./calculations/project-basis";
import {resolvePhysicalStructure} from "./physical-structure";
import {resolveMemberPhysical} from "./member-physical";
import {mixedPieceKind} from "./mixed-adapter";
import {declareLocalAxes,localAxesPendency} from "./local-axes-review";
import type {AxisPendency} from "./local-axes-review";

/** Frame pieces of the CURRENT project and their reviewed-roll pendency (empty = every frame has a current reviewed roll). */
export function projectFrameAxes(project:Project){
  const draft=project.workspace.spatialPreparation,model=resolvePhysicalStructure(project).model;
  if(!draft||!model)return {framePieceIds:[] as string[],allPieceIds:[] as string[],pending:[] as AxisPendency[],signature:""};
  const framePieceIds=model.pieces.filter(p=>mixedPieceKind(p,draft)==="frame").map(p=>p.id),allPieceIds=model.pieces.map(p=>p.id),signature=structureSignature(project);
  return {framePieceIds,allPieceIds,signature,pending:localAxesPendency(draft.localAxes,signature,framePieceIds,allPieceIds)};
}
/** Built-in synthetic references only: every frame section is isotropic (Iy = Iz), so the roll cannot change the response.
 * Anything else throws; user projects never get a default roll. */
export function withReviewedIsotropicAxes(project:Project):Project{
  const draft=project.workspace.spatialPreparation,model=resolvePhysicalStructure(project).model;
  if(!draft||!model)return project;
  const frames=model.pieces.filter(p=>mixedPieceKind(p,draft)==="frame");
  for(const p of frames){
    const g=resolveMemberPhysical(p,draft).properties;
    if(g.iyCm4===null||g.izCm4===null||Math.abs(g.iyCm4-g.izCm4)>1e-9*Math.max(g.iyCm4,g.izCm4))
      throw Error("AXIS_EXAMPLE_ANISOTROPIC: "+p.id+" tem Iy≠Iz; o giro precisa de revisão explícita.");
  }
  if(!frames.length)return project;
  return declareLocalAxes(project,structureSignature(project),frames.map(p=>({pieceId:p.id,rotationDeg:0,
    source:"Exemplo sintético com seção isotrópica (Iy = Iz): o giro não altera a resposta",revision:"INT-1a: exemplo embutido revisado"})));
}

/** Only validated solver options are restored; all physical data is rebuilt. */
export async function adaptMixedForRequest(project:Project,template:unknown){
  if(template && typeof template==="object" && "analysis_order" in template){
    const options=secondOrderMixedRequestSchema.parse(template),base=await adaptLoadedMixedProjectV3(project);
    const request=secondOrderMixedRequestSchema.parse({...base.request,analysis_order:"second-order",solution_mode:"per-combination",
      ...(options.mesh_initial_subdivisions?{mesh_initial_subdivisions:options.mesh_initial_subdivisions}:{})});
    return {...base,request,input_sha256:await mixedInputHash(request)};
  }
  return adaptMixedForVersion(project,requestVersionOf(template));
}
