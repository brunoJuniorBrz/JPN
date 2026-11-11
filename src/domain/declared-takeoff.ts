import type { Project } from "./models";
import { resolvePhysicalStructure } from "./physical-structure";
import { resolveMemberPhysical } from "./member-physical";
import { newSpatialPreparation } from "./spatial-preparation";
import { roleLabels } from "./structure";

const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,"en")).map(([k,x])=>[k,canonical(x)])):v;
/** Independent from the analysis identity: display roles and density/prices
 * also affect the takeoff, even when they do not affect stiffness. */
export function declaredTakeoffSignature(project:Project){
  const d=project.workspace.spatialPreparation;
  return JSON.stringify(canonical({kind:"declared-bars",geometry:project.workspace.physicalStructure,groups:d?.groups??null,catalog:d?.physicalCatalog??null}));
}
export function declaredTakeoff(project:Project){
  const resolved=resolvePhysicalStructure(project);
  if(resolved.source!=="declared"||!resolved.model)throw Error("DECLARE_GEOMETRY: forneça nós e barras declarados.");
  const draft=project.workspace.spatialPreparation??newSpatialPreparation(project),signature=declaredTakeoffSignature(project);
  const pieces=resolved.model.pieces.map(piece=>{
    const physical=resolveMemberPhysical(piece,draft),p=physical.properties;
    const assignment=draft.physicalCatalog?.assignments.find(a=>a.pieceId===piece.id),section=draft.physicalCatalog?.sections.find(s=>s.id===assignment?.sectionId);
    const massKg=p.areaCm2!==null&&p.sectionSource.trim()&&p.sectionRevision.trim()&&p.density?p.areaCm2*1e-4*p.density.kgM3*piece.lengthMm/1000:null;
    const identity=project.workspace.physicalStructure!.pieces.find(p=>p.id===piece.id)!;
    return {pieceId:piece.id,role:piece.role,label:identity.label??roleLabels[piece.role],group:identity.group??"",materialId:physical.materialId,sectionId:physical.sectionId,profile:section?.designation||physical.sectionId,steelGrade:p.steelGrade,
      groupKey:JSON.stringify([piece.role,identity.label??roleLabels[piece.role],identity.group??"",physical.materialId,physical.sectionId]),lengthMm:piece.lengthMm,massKg,pricePerMeterCents:section?.priceSource?.trim()&&section.priceRevision?.trim()?section.pricePerMeterCents??null:null,
      fabricationLengthMm:null,commercialLengthMm:null};
  });
  const groups=[...new Set(pieces.map(p=>p.groupKey))].map(key=>{
    const rows=pieces.filter(p=>p.groupKey===key),first=rows[0];
    return {key,role:first.role,label:`${first.group?first.group+" · ":""}${first.label} · ${first.profile}`,materialId:first.materialId,sectionId:first.sectionId,pieceIds:rows.map(p=>p.pieceId),quantity:rows.length,
      lengthM:rows.reduce((s,p)=>s+p.lengthMm/1000,0),massKg:rows.every(p=>p.massKg!==null)?rows.reduce((s,p)=>s+p.massKg!,0):null,pricePerMeterCents:first.pricePerMeterCents};
  });
  return {schema_version:"jpn.declared-takeoff/1" as const,signature,modelRevision:project.workspace.physicalStructure!.revision,pieces,groups,
    totals:{quantity:pieces.length,lengthM:pieces.reduce((s,p)=>s+p.lengthMm/1000,0),massKg:pieces.every(p=>p.massKg!==null)?pieces.reduce((s,p)=>s+p.massKg!,0):null},fabricationRelease:false as const};
}
export function transferDeclaredTakeoff(project:Project,wastePercent:number):Project{
  if(!Number.isFinite(wastePercent)||wastePercent<0||wastePercent>100)throw Error("Perda comercial inválida; declare zero explicitamente quando aplicável.");
  const report=declaredTakeoff(project),materials=project.estimate.materials.filter(l=>l.source!=="takeoff");
  for(const group of report.groups){
    const old=project.estimate.materials.find(l=>l.source==="takeoff"&&l.quantityOrigin?.groupKey===group.key);
    materials.push({id:old?.id??crypto.randomUUID(),materialId:null,name:group.label.slice(0,200),source:"takeoff",purchaseUnit:"m",measurementUnit:"m",measurementPerPurchase:null,
      manualQuantity:group.lengthM,wastePercent,unitPriceCents:old?.unitPriceCents??group.pricePerMeterCents,
      quantityOrigin:{kind:"declared-bars",signature:report.signature,modelRevision:report.modelRevision,groupKey:group.key,role:group.role,pieceIds:group.pieceIds}});
  }
  return {...project,estimate:{...project.estimate,materials}};
}
