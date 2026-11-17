import type {Project} from "@/domain/models";
import {declaredTakeoff} from "@/domain/declared-takeoff";
import {generateStructure} from "@/domain/calculations/structure";
import {structureSignature} from "@/domain/calculations/project-basis";

/** One takeoff for the CAD, package and commercial quantities. Never turn a
 * generated visual profile into a declaration of mechanical properties. */
export function packageTakeoff(project:Project):Omit<ReturnType<typeof declaredTakeoff>,"schema_version">&{schema_version:"jpn.declared-takeoff/1"|"jpn.generated-takeoff/1"}{
  if(project.workspace.physicalStructure)return declaredTakeoff(project);
  const model=generateStructure(project).model;
  if(!model)throw Error("Geometria indisponível para exportação.");
  const pieces=model.pieces.map(p=>({pieceId:p.id,role:p.role,label:p.role,group:"",materialId:p.profile.steelGrade,
    sectionId:p.profile.name,profile:p.profile.name||"PENDENTE",steelGrade:p.profile.steelGrade,
    groupKey:JSON.stringify(p.profile),lengthMm:p.lengthMm,massKg:p.massKg,
    pricePerMeterCents:p.profile.pricePerMeterCents??null,fabricationLengthMm:null,commercialLengthMm:null}));
  const groups=[...new Set(pieces.map(p=>p.groupKey))].map(key=>{
    const rows=pieces.filter(p=>p.groupKey===key),p=rows[0];
    return {key,role:p.role,label:`${p.profile} · ${p.steelGrade}`,materialId:p.materialId,sectionId:p.sectionId,
      pieceIds:rows.map(p=>p.pieceId),quantity:rows.length,lengthM:rows.reduce((s,p)=>s+p.lengthMm/1000,0),
      massKg:rows.every(p=>p.massKg!==null)?rows.reduce((s,p)=>s+p.massKg!,0):null,pricePerMeterCents:p.pricePerMeterCents};
  });
  return {schema_version:"jpn.generated-takeoff/1",signature:structureSignature(project),modelRevision:String(project.roof.revision),pieces,groups,
    totals:{quantity:pieces.length,lengthM:pieces.reduce((s,p)=>s+p.lengthMm/1000,0),massKg:pieces.every(p=>p.massKg!==null)?pieces.reduce((s,p)=>s+p.massKg!,0):null},fabricationRelease:false};
}
