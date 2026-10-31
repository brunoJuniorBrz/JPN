import type { Project } from "./models";
import { prepareMixedInput } from "./mixed-adapter";
import { loadedMixedRequestSchema, needsSelfWeightOverlapReview, selfWeightOverlapReviewBasis } from "./structural-loading";
import { mixedInputHash } from "./mixed-analysis";
import { generateStructure } from "./calculations/structure";
export async function adaptLoadedMixedProject(project:Project){
  const loading=project.workspace.spatialPreparation?.loading;
  if(!loading)throw new Error("Declare carregamentos físicos.");
  if(loading.roofArea.length)throw new Error("ROOF_LOAD_PATH_PENDING: ações por área registradas, mas a partição tributária e o caminho até cada terça ainda exigem revisão. Automação bloqueada; nenhuma ação foi ignorada.");
  const draft=project.workspace.spatialPreparation!;
  if(needsSelfWeightOverlapReview(draft,loading)){
    const review=loading.overlapReview;
    if(!review?.confirmed||!review.source.trim()||!review.revision.trim()||review.basis!==selfWeightOverlapReviewBasis(draft,loading))
      throw new Error("POSSIBLE_DOUBLE_COUNT: peso próprio e outras cargas manuais coexistem na mesma combinação. Revise origem e independência das ações e registre confirmação rastreável para ESTA revisão antes de calcular.");
  }
  const prepared=await prepareMixedInput(project,true), pieces=new Map(generateStructure(project).model!.pieces.map(p=>[p.id,p]));
  for(const l of loading.uniform)if(!pieces.has(l.pieceId))throw new Error("Carga uniforme refere peça inexistente.");
  const member_loads=loading.uniform.flatMap(l=>prepared.mapping.members.filter(m=>m.originalId===l.pieceId).map(m=>({id:`${l.id}:${m.id}`,member:m.id,case:l.caseId,coordinate_system:l.coordinates,force_per_length_n_m:l.knM.map(v=>v*1000),source:l.source,revision:l.revision})));
  const self_weight=loading.selfWeight?{case:loading.selfWeight.caseId,gravity_m_s2:loading.selfWeight.gravity,axial_lumping:loading.selfWeight.axialLumping,densities:prepared.mapping.members.map(m=>{
    const d=draft.groups[pieces.get(m.originalId)!.role].density;if(!d)throw new Error(`${m.originalId}: densidade, fonte e revisão pendentes.`);
    return {member:m.id,kg_m3:d.kgM3,source:d.source,revision:d.revision};})}:null;
  const request=loadedMixedRequestSchema.parse({...prepared.request,schema_version:"jpn.mixed3d/2",member_loads,self_weight});
  return {...prepared,schema_version:"jpn.mixed-adapter/2" as const,request,input_sha256:await mixedInputHash(request)};
}
