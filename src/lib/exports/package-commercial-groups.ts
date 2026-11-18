import type {Project} from "@/domain/models";
import {packageTakeoff} from "./package-source";

/** The CAD role/mark is NOT a purchasing identity. Two members can share stock
 * only when catalog material, section (including thickness), grade and stock
 * length match. Legacy takeoff keys are retained solely for existing projects. */
export function declaredCommercialGroups(project:Project){
  if(!project.workspace.physicalStructure)return [];
  const report=packageTakeoff(project),catalog=project.workspace.spatialPreparation?.physicalCatalog;
  const assignments=new Map(catalog?.assignments.map(a=>[a.pieceId,a])??[]);
  const sections=new Map(catalog?.sections.map(s=>[s.id,s])??[]);
  const groups=new Map<string,{key:string;label:string;sectionId:string;materialId:string;steelGrade:string;
    pieceIds:string[];legacyKeys:string[];unlocatedPieceIds:string[]}>();
  for(const p of report.pieces){
    const assignment=assignments.get(p.pieceId),sectionId=assignment?.sectionId??p.sectionId,
      materialId=assignment?.materialId??p.materialId,designation=sections.get(sectionId)?.designation?.trim()??p.profile;
    const key=JSON.stringify(["commercial-stock/1",sectionId,materialId,p.steelGrade,designation]);
    let g=groups.get(key);
    if(!g){
      g={key,label:`${designation} · ${p.steelGrade||"AÇO PENDENTE"}`,sectionId,materialId,steelGrade:p.steelGrade,
        pieceIds:[],legacyKeys:[],unlocatedPieceIds:[]};groups.set(key,g);
    }
    g.pieceIds.push(p.pieceId);
    if(!g.legacyKeys.includes(p.groupKey))g.legacyKeys.push(p.groupKey);
    if(isUnlocatedCommercialPiece(p))g.unlocatedPieceIds.push(p.pieceId);
  }
  return [...groups.values()];
}

/** Explicit 'not located / to confirm' classification; never infer that all
 * beams or bars with a particular role are unapproved commercial scope. */
export function isUnlocatedCommercialPiece(p:{group?:string;label?:string}){
  return /SEM[-_ ]*LOCA[CÇ][AÃ]O|A[-_ ]*CONFIRMAR|UNLOCATED/i.test(`${p.group??""} ${p.label??""}`);
}
