import source from "../../validation/tom-2026/tom-commercial-source.json" with {type:"json"};
import { projectSchema,type Project } from "./models";
import type { MaterialLine } from "./project-details";
/** Explicit commercial transcription only. Does not infer any member or roof geometry. */
export function applyTomCommercial(project:Project):Project{
  if(project.estimate.materials.length||project.estimate.labor.length||project.estimate.expenses.length||project.estimate.charges.length)throw Error("Crie um orçamento vazio para reproduzir a referência Tom sem sobrescrever itens existentes.");
  const item=(name:string,quantity:number,unit:"un"|"m",unitPriceCents:number):MaterialLine=>({id:crypto.randomUUID(),materialId:null,name,purchaseUnit:unit,measurementUnit:unit,measurementPerPurchase:1,source:"manual",manualQuantity:quantity,wastePercent:0,unitPriceCents});
  const materials=[...source.metal_profiles.map(p=>item(p.designation,p.quantity_pieces,"un",p.unit_price_cents)),
    ...source.roofing_sheet.rows.map((r,i)=>item(`Tom · TR25 linha ${i+1} · ${r.count} peças × ${r.length_m} m`,r.linear_m,"m",source.roofing_sheet.unit_price_cents_per_linear_m)),
    item("Tom · brocantes",source.roofing_fasteners.quantity,"un",source.roofing_fasteners.unit_price_cents)];
  return projectSchema.parse({...project,estimate:{...project.estimate,materials,pricingPercent:0,expenses:source.consumables.map(r=>({id:crypto.randomUUID(),description:r.name,quantity:r.quantity,unit:"un",unitPriceCents:r.unit_price_cents}))}});
}
