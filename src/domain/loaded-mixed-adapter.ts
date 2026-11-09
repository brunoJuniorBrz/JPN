import type { Project } from "./models";
import { prepareMixedInput } from "./mixed-adapter";
import { loadedMixedRequestSchema, needsSelfWeightOverlapReview, selfWeightOverlapReviewBasis } from "./structural-loading";
import { mixedInputHash } from "./mixed-analysis";
import { resolvePhysicalStructure,assertGeneratedPhysicalStructure } from "./physical-structure";
import { resolveMemberPhysical } from "./member-physical";
import { distributeRoofActions } from "./roof-load-path";
import { distributeDeclaredRoofActions } from "./declared-roof-load-path";
import { distributeWindActions } from "./wind-load-path";
import { verifyEngineeringCombinations } from "./engineering-combinations";
export async function adaptLoadedMixedProject(project:Project){
  const loading=project.workspace.spatialPreparation?.loading;
  if(!loading)throw new Error("Declare carregamentos físicos.");
  if(loading.wind)assertGeneratedPhysicalStructure(project,"vento em fachadas/estrutura declarada exige caminho de transmissão normativo validado");
  const roof_load_path=loading.roofArea.length?(project.workspace.physicalStructure?distributeDeclaredRoofActions(project,loading.roofArea,loading.roofDistribution):distributeRoofActions(project,loading.roofArea,loading.roofDistribution)):null;
  const draft=project.workspace.spatialPreparation!;
  const wind_load_path=loading.wind?distributeWindActions(project,loading.wind):null;
  const engineering_combinations=draft.engineeringCombinations?verifyEngineeringCombinations(draft.engineeringCombinations,draft.cases,draft.combinations):null;
  if(wind_load_path){
    if(!engineering_combinations)throw new Error("WIND_COMBINATIONS_PENDING: declare categorias, exclusões, fatores e referências das combinações.");
    const windActions=engineering_combinations.declaration.actions.filter(a=>wind_load_path.cases.some(c=>c.caseId===a.caseId));
    if(windActions.length!==wind_load_path.cases.length||windActions.some(a=>a.category!=="wind"||!a.exclusiveGroup)||new Set(windActions.map(a=>a.exclusiveGroup)).size!==1)throw new Error("WIND_COMBINATIONS_PENDING: classifique casos de vento alternativos no mesmo grupo exclusivo.");
  }
  const areaCases=[...loading.roofArea.map(a=>a.caseId),...(loading.wind?.cases.map(c=>c.id)??[])];
  if(new Set(areaCases).size!==areaCases.length||areaCases.some(id=>id===loading.selfWeight?.caseId||draft.loads.some(l=>l.caseId===id)||loading.uniform.some(l=>l.caseId===id)))throw new Error("ROOF_DOUBLE_COUNT: cada ação de área exige caso próprio, sem cargas nodais, manuais ou peso próprio no mesmo caso.");
  if(needsSelfWeightOverlapReview(draft,loading)){
    const review=loading.overlapReview;
    if(!review?.confirmed||!review.source.trim()||!review.revision.trim()||review.basis!==selfWeightOverlapReviewBasis(draft,loading))
      throw new Error("POSSIBLE_DOUBLE_COUNT: ações automáticas e outras cargas coexistem na mesma combinação. Revise origem e independência das ações e registre confirmação rastreável para ESTA revisão antes de calcular.");
  }
  const prepared=await prepareMixedInput(project,true), pieces=new Map(resolvePhysicalStructure(project).model!.pieces.map(p=>[p.id,p]));
  for(const l of loading.uniform){
    if(!pieces.has(l.pieceId))throw new Error("Carga uniforme refere peça inexistente.");
    const mapped=prepared.mapping.members.filter(m=>m.originalId===l.pieceId);
    if(!mapped.length||mapped.some(m=>prepared.request.members.find(p=>p.id===m.id)?.kind!=="frame"))throw Error("UNIFORM_AXIAL_UNSUPPORTED: carga distribuída exige pórtico físico; não atribuir flexão a barra axial.");
  }
  const member_loads=loading.uniform.flatMap(l=>prepared.mapping.members.filter(m=>m.originalId===l.pieceId).map(m=>({id:`${l.id}:${m.id}`,member:m.id,case:l.caseId,coordinate_system:l.coordinates,force_per_length_n_m:l.knM.map(v=>v*1000),source:l.source,revision:l.revision})));
  for(const action of roof_load_path?.actions??[])for(const l of action.loads){
    const mapped=prepared.mapping.members.filter(m=>m.originalId===l.pieceId);
    if(!mapped.length||mapped.some(m=>prepared.request.members.find(p=>p.id===m.id)?.kind!=="frame"))throw new Error("ROOF_AXIAL_UNSUPPORTED: terça sem pórtico físico; não se atribui flexão a uma barra axial.");
    for(const m of mapped)member_loads.push({id:`${action.actionId}:${m.id}`,member:m.id,case:action.action.caseId,coordinate_system:"global",force_per_length_n_m:l.forcePerLengthNM,source:action.action.source,revision:action.action.revision});
  }
  for(const action of wind_load_path?.cases??[])for(const l of action.loads){
    const mapped=prepared.mapping.members.filter(m=>m.originalId===l.pieceId);
    if(!mapped.length||mapped.some(m=>prepared.request.members.find(p=>p.id===m.id)?.kind!=="frame"))throw new Error("WIND_AXIAL_UNSUPPORTED: terça exige pórtico físico explicitamente declarado.");
    const c=loading.wind!.cases.find(c=>c.id===action.caseId)!;
    for(const m of mapped)member_loads.push({id:`WIND:${action.caseId}:${m.id}`,member:m.id,case:action.caseId,coordinate_system:"global",force_per_length_n_m:l.forcePerLengthNM,source:c.reference.source,revision:c.reference.revision});
  }
  const self_weight=loading.selfWeight?{case:loading.selfWeight.caseId,gravity_m_s2:loading.selfWeight.gravity,axial_lumping:loading.selfWeight.axialLumping,densities:prepared.mapping.members.map(m=>{
    const d=resolveMemberPhysical(pieces.get(m.originalId)!,draft).properties.density;if(!d)throw new Error(`${m.originalId}: densidade, fonte e revisão pendentes.`);
    return {member:m.id,kg_m3:d.kgM3,source:d.source,revision:d.revision};})}:null;
  const request=loadedMixedRequestSchema.parse({...prepared.request,schema_version:"jpn.mixed3d/2",member_loads,self_weight});
  return {...prepared,schema_version:"jpn.mixed-adapter/2" as const,request,roof_load_path,wind_load_path,engineering_combinations,input_sha256:await mixedInputHash(request)};
}
