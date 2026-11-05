import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newProject, projectSchema } from "./models";
import { calculateEstimate } from "./calculations/estimate";
import { importPhysicalModel } from "./physical-model-import";
import { resolvePhysicalStructure } from "./physical-structure";
import { transferTakeoff } from "./calculations/project-basis";
import { adaptMixedProject } from "./mixed-adapter";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { emptyLoading } from "./structural-loading";
import { m34abProject } from "./test-support/m34ab-fixtures";

type Item={name:string;quantity:number;unit_price_cents:number;subtotal_cents:number};
type SheetRow={length_m:number;count:number;linear_m:number;subtotal_cents:number};
const source=JSON.parse(readFileSync("validation/tom-2026/tom-commercial-source.json","utf8")) as {
 metal_profiles:{source_label:string;designation:string;quantity_pieces:number;unit_price_cents:number;subtotal_cents:number}[];
 roofing_sheet:{rows:SheetRow[];total_pieces:number;total_linear_m:number;unit_price_cents_per_linear_m:number};
 roofing_fasteners:{name:string;quantity:number;unit_price_cents:number;total_cents:number};
 consumables:Item[];reported_totals:{metal_profiles_cents:number;roofing_sheets_and_fasteners_cents:number;consumables_cents:number;grand_total_cents:number};
 geometric_reference:{reference_rectangle_m2:number;actual_net_roof_area_m2:number|null};
 missing_for_structural_validation:string[];
};
const item=(name:string,quantity:number,unit:"un"|"m",unitPrice:number)=>({
 id:crypto.randomUUID(),materialId:null,name,purchaseUnit:unit,measurementUnit:unit,measurementPerPurchase:1,
 source:"manual" as const,manualQuantity:quantity,wastePercent:0,unitPriceCents:unitPrice
});
function commercialProject(){
 const p=newProject();p.name="Caso Tom / referência comercial — NÃO estruturally approved";
 p.client="Caso de auditoria";p.estimate.pricingPercent=0;
 p.estimate.materials=[
   ...source.metal_profiles.map(x=>item(x.designation,x.quantity_pieces,"un",x.unit_price_cents)),
   ...source.roofing_sheet.rows.map((x,i)=>item("TR25 linha "+(i+1),x.linear_m,"m",source.roofing_sheet.unit_price_cents_per_linear_m)),
   item("brocante",source.roofing_fasteners.quantity,"un",source.roofing_fasteners.unit_price_cents)
 ];
 p.estimate.expenses=source.consumables.map(x=>({id:crypto.randomUUID(),description:x.name,quantity:x.quantity,unit:"un",unitPriceCents:x.unit_price_cents}));
 return projectSchema.parse(p);
}
describe("Tom source regression / main integrated real commercial pipeline",()=>{
 it("checks every source row, 31 sheets, 107.65 linear metres and R$ 9,651.29",()=>{
  const t=source;
  expect(t.roofing_sheet.rows).toHaveLength(7);
  expect(t.roofing_sheet.rows.reduce((s,x)=>s+x.count,0)).toBe(t.roofing_sheet.total_pieces);
  expect(t.roofing_sheet.rows.reduce((s,x)=>s+x.linear_m,0)).toBeCloseTo(t.roofing_sheet.total_linear_m,10);
  for(const x of t.roofing_sheet.rows){expect(x.count*x.length_m).toBeCloseTo(x.linear_m,10);expect(x.subtotal_cents).toBe(Math.round(x.linear_m*t.roofing_sheet.unit_price_cents_per_linear_m));}
  const p=commercialProject(),r=calculateEstimate(p);
  expect(r.pending).toEqual([]);
  expect(r.materials[0].subtotalCents).toBe(81000);
  expect(r.materials[1].subtotalCents).toBe(310000);
  expect(r.materials.slice(2,9).reduce((a,b)=>a+(b.subtotalCents??0),0)).toBe(376775);
  expect(r.materials[9].subtotalCents).toBe(36000);
  expect(r.materialsCents).toBe(803775);
  expect(r.expensesCents).toBe(t.reported_totals.consumables_cents);
  expect(r.directCostCents).toBe(t.reported_totals.grand_total_cents);
  expect(r.directCostCents).toBe(965129);
 });
 it("does not call the bounding rectangle the built roof or infer a physical structure",()=>{
  const p=commercialProject();
  expect(source.geometric_reference.actual_net_roof_area_m2).toBeNull();
  expect(source.geometric_reference.reference_rectangle_m2).toBeCloseTo(14.28*5.38,10);
  expect(p.workspace.physicalStructure).toBeUndefined();
  expect(source.missing_for_structural_validation.length).toBeGreaterThan(5);
 });
 it("imports one explicitly illustrative 5.38m dimension without approving the Tom structure",async()=>{
  const p=commercialProject();
  const schematic={
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"dimension import check / not engineering",provenance:"isolated 5.38m dimension, not actual Tom bar topology",
    nodes:[{id:"N1",x:0,y:0,z:0},{id:"N2",x:5380,y:0,z:0}],
    pieces:[{id:"ILLUSTRATIVE",role:"purlin",start:"N1",end:"N2"}]
  };
  const imported=importPhysicalModel(p,JSON.stringify(schematic));
  expect(imported.estimate).toEqual(p.estimate);
  expect(resolvePhysicalStructure(imported).model?.pieces[0].lengthMm).toBe(5380);
  expect(imported.workspace.spatialPreparation?.supports).toEqual([]);
  expect(imported.workspace.spatialPreparation?.loads).toEqual([]);
  await expect(adaptMixedProject(imported)).rejects.toThrow();
  expect(()=>transferTakeoff(imported,0)).toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);
 });
 it("rejects physical distributed loads on declared model while this adapter has no transfer path",async()=>{
  const p=m34abProject(),d=p.workspace.spatialPreparation!;
  d.loading=emptyLoading();
  d.loading.uniform=[{id:"ILLUSTRATIVE-UDL",pieceId:"F1",caseId:"Q",coordinates:"global",knM:[0,0,-0.1],
    source:"Synthetic unsupported adapter check; not the actual Tom load",revision:"1"}];
  await expect(adaptLoadedMixedProject(p)).rejects.toThrow(/DECLARED_STRUCTURE_UNSUPPORTED/);
 });
});
