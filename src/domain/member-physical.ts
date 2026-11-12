import { z } from "zod";
import { physicalGroupSchema,emptyPhysicalGroup,type PhysicalGroup } from "./physical-declaration";
import { physicalId } from "./declared-structure";
import type { PhysicalPiece } from "./structure";
import type { SpatialPreparation } from "./spatial-preparation";

export const physicalCatalogSchema=z.object({schema_version:z.literal("jpn.physical-catalog/1"),
  materials:z.array(physicalGroupSchema.pick({steelGrade:true,materialSource:true,materialRevision:true,eGpa:true,gGpa:true,nu:true,density:true}).extend({id:physicalId})).min(1).max(50),
  sections:z.array(physicalGroupSchema.pick({areaCm2:true,iyCm4:true,izCm4:true,jCm4:true,sectionSource:true,sectionRevision:true}).extend({id:physicalId,designation:z.string().trim().max(200).optional(),pricePerMeterCents:z.number().int().min(0).max(10000000000).nullable().optional(),priceSource:z.string().trim().max(1000).optional(),priceRevision:z.string().trim().max(1000).optional()})).min(1).max(50),
  assignments:z.array(z.object({pieceId:physicalId,materialId:physicalId,sectionId:physicalId,rotationDeg:physicalGroupSchema.shape.rotationDeg}).strict()).max(600),
}).strict().superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  for(const ids of [v.materials.map(m=>m.id),v.sections.map(s=>s.id),v.assignments.map(a=>a.pieceId)])if(new Set(ids).size!==ids.length)issue("DUPLICATE_PHYSICAL_ID: catálogo ou atribuição duplicada.");
  for(const a of v.assignments)if(!v.materials.some(m=>m.id===a.materialId)||!v.sections.some(s=>s.id===a.sectionId))issue(`PHYSICAL_REFERENCE_MISSING: ${a.pieceId}: material/seção inexistente; sem fallback ao grupo.`);
});
export function resolveMemberPhysical(piece:PhysicalPiece,draft:SpatialPreparation):{properties:PhysicalGroup;materialId:string;sectionId:string}{
  const group=draft.groups[piece.role]??emptyPhysicalGroup(),assignment=draft.physicalCatalog?.assignments.find(a=>a.pieceId===piece.id);
  if(!assignment)return {properties:group,materialId:`MAT-${piece.role}`,sectionId:`SEC-${piece.role}`};
  const material=draft.physicalCatalog!.materials.find(m=>m.id===assignment.materialId),section=draft.physicalCatalog!.sections.find(s=>s.id===assignment.sectionId);
  if(!material||!section)throw Error(`PHYSICAL_REFERENCE_MISSING: ${piece.id}: material/seção inexistente; sem fallback ao grupo.`);
  const {id:materialId,...mat}=material,{id:sectionId,designation:_designation,pricePerMeterCents:_price,priceSource:_priceSource,priceRevision:_priceRevision,...sec}=section;void _designation;void _price;void _priceSource;void _priceRevision;
  return {properties:{...mat,...sec,rotationDeg:assignment.rotationDeg,connection:group.connection,elementKind:group.elementKind},materialId:`MAT-REF-${materialId}`,sectionId:`SEC-REF-${sectionId}`};
}
