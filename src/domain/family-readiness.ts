import { coldFormedDiagnostics } from "./cold-formed-properties";
import type { z } from "zod";
import type { resistancePreparationSchema } from "./resistance-preparation";
import type { PhysicalGroup } from "./physical-declaration";

/** Physical family diagnostics are separate from unavailable normative methods. */
export function familyReadiness(d:z.infer<typeof resistancePreparationSchema>,group:PhysicalGroup,lengthM:number){
  if(d.family==="cold-formed"&&d.geometry?.shape==="u-stiffened")return {scope:"cold-formed-ue",...coldFormedDiagnostics(d,group,lengthM)};
  const issues:{code:string;message:string}[]=[],g=d.geometry,add=(code:string,message:string)=>issues.push({code,message});
  if(!d.family||!g)add("MISSING_FAMILY_GEOMETRY","Família e geometria físicas necessárias.");
  if(d.family==="rolled"||d.family==="welded"){
    if(g?.shape==="i"){
      const {height:h,width:b,webThickness:tw,flangeThickness:tf}=g.dimensionsMm;
      if([h,b,tw,tf].some(x=>x===null||x===undefined))add("MISSING_I_DIMENSIONS","I/W: dimensões físicas incompletas.");
      else if(h!<=2*tf!||b!<=tw!||tw!<=0||tf!<=0)add("INVALID_I_GEOMETRY","I/W: alma/mesas degeneradas.");
    }else add("PENDING_FAMILY_PROCEDURE","Família declarada fora do piloto I/W; isso não significa geometria fisicamente inválida.");
  }else if(d.family)add("PENDING_FAMILY_PROCEDURE","Procedimento específico desta família/forma ainda não implementado.");
  if(!group.eGpa||!group.gGpa||group.nu===null||Math.abs(group.eGpa/(2*group.gGpa*(1+group.nu))-1)>.001)add("MATERIAL_INCOHERENT","E/G/Poisson ausentes ou incompatíveis.");
  if(!d.source.trim()||!d.revision.trim())add("MISSING_PROVENANCE","Fonte/revisão físicas necessárias.");
  return {scope:(d.family==="rolled"||d.family==="welded")&&g?.shape==="i"?"i-w-physical":"declared-family",status:issues.length?"pending-data" as const:"pending-normative-source" as const,issues};
}
