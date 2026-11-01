import type { Project } from "./models";
import { prepareMixedInput } from "./mixed-adapter";
import { loadedMixedRequestSchema, needsSelfWeightOverlapReview, selfWeightOverlapReviewBasis } from "./structural-loading";
import { mixedInputHash } from "./mixed-analysis";
import { generateStructure } from "./calculations/structure";
import { distributeRoofActions } from "./roof-load-path";
export async function adaptLoadedMixedProject(project:Project){
  const loading=project.workspace.spatialPreparation?.loading;
  if(!loading)throw new Error("Declare carregamentos físicos.");
  const roof_load_path=loading.roofArea.length?distributeRoofActions(project,loading.roofArea,loading.roofDistribution):null;
  const draft=project.workspace.spatialPreparation!;
  const areaCases=loading.roofArea.map(a=>a.caseId);
  if(new Set(areaCases).size!==areaCases.length||areaCases.some(id=>id===loading.selfWeight?.caseId||draft.loads.some(l=>l.caseId===id)||loading.uniform.some(l=>l.caseId===id)))throw new Error("ROOF_DOUBLE_COUNT: cada ação de área exige caso próprio, sem cargas nodais, manuais ou peso próprio no mesmo caso.");
  if(needsSelfWeightOverlapReview(draft,loading)){
    const review=loading.overlapReview;
    if(!review?.confirmed||!review.source.trim()||!review.revision.trim()||review.basis!==selfWeightOverlapReviewBasis(draft,loading))
      throw new Error("POSSIBLE_DOUBLE_COUNT: ações automáticas e outras cargas coexistem na mesma combinação. Revise origem e independência das ações e registre confirmação rastreável para ESTA revisão antes de calcular.");
  }
  const prepared=await prepareMixedInput(project,true), pieces=new Map(generateStructure(project).model!.pieces.map(p=>[p.id,p]));
  for(const l of loading.uniform)if(!pieces.has(l.pieceId))throw new Error("Carga uniforme refere peça inexistente.");
  const member_loads=loading.uniform.flatMap(l=>prepared.mapping.members.filter(m=>m.originalId===l.pieceId).map(m=>({id:`${l.id}:${m.id}`,member:m.id,case:l.caseId,coordinate_system:l.coordinates,force_per_length_n_m:l.knM.map(v=>v*1000),source:l.source,revision:l.revision})));
  for(const action of roof_load_path?.actions??[])for(const l of action.loads){
    const mapped=prepared.mapping.members.filter(m=>m.originalId===l.pieceId);
    if(!mapped.length||mapped.some(m=>prepared.request.members.find(p=>p.id===m.id)?.kind!=="frame"))throw new Error("ROOF_AXIAL_UNSUPPORTED: terça sem pórtico físico; não se atribui flexão a uma barra axial.");
    for(const m of mapped)member_loads.push({id:`${action.actionId}:${m.id}`,member:m.id,case:action.action.caseId,coordinate_system:"global",force_per_length_n_m:l.forcePerLengthNM,source:action.action.source,revision:action.action.revision});
  }
  const self_weight=loading.selfWeight?{case:loading.selfWeight.caseId,gravity_m_s2:loading.selfWeight.gravity,axial_lumping:loading.selfWeight.axialLumping,densities:prepared.mapping.members.map(m=>{
    const d=draft.groups[pieces.get(m.originalId)!.role].density;if(!d)throw new Error(`${m.originalId}: densidade, fonte e revisão pendentes.`);
    return {member:m.id,kg_m3:d.kgM3,source:d.source,revision:d.revision};})}:null;
  const request=loadedMixedRequestSchema.parse({...prepared.request,schema_version:"jpn.mixed3d/2",member_loads,self_weight});
  return {...prepared,schema_version:"jpn.mixed-adapter/2" as const,request,roof_load_path,input_sha256:await mixedInputHash(request)};
}
