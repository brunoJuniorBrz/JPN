import { expect,it } from "vitest";
import { calculateWindSpeed } from "./wind-speed";
import { applyWindSpeed } from "./apply-wind-speed";
import { windReferenceProject } from "./examples/wind-project";
import { generateStructure } from "./calculations/structure";
import { distributeWindActions } from "./wind-load-path";
const reference={standard:"ABNT NBR 6123",edition:"2023",clause:"4.2; 5.3.3",source:"Declared independent numerical control; classification reviewed separately",revision:"1",responsible:"Test"};
const input={schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:40,heightM:10,heightReference:"model-base-z0",topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,reference};

it("independent exact speed/pressure reference and quadratic scaling",()=>{
  const r=calculateWindSpeed(input);expect(r.s2).toBe(1);expect(r.vkMps).toBe(40);expect(r.dynamicPressurePa).toBeCloseTo(980.8,10);
  expect(calculateWindSpeed({...input,s3:.95}).dynamicPressurePa).toBeCloseTo(885.172,10);
  expect(calculateWindSpeed({...input,v0Mps:80}).dynamicPressurePa).toBeCloseTo(4*980.8,9);
  expect(r.referenceAirDensityKgM3).toBe(1.226);expect(r.completeWindAssessment).toBe(false);
});
it("matches independent rounded Table 3 entries, using Fr from category II in every category",()=>{
  for(const [category,sizeClass,heightM,expected] of [["I","A",5,1.06],["II","B",10,.98],["III","B",10,.92],["IV","C",10,.80],["V","B",5,.72],["V","C",10,.67]] as const){
    const r=calculateWindSpeed({...input,category,sizeClass,heightM});expect(Number(r.s2.toFixed(2))).toBe(expected);
  }
  expect(calculateWindSpeed({...input,category:"V",heightM:3}).s2).toBe(.74);
  expect(calculateWindSpeed({...input,category:"V",heightM:9}).effectiveHeightM).toBe(10);
  expect(calculateWindSpeed({...input,heightM:3}).effectiveHeightM).toBe(5);
});
it("rejects unsupported topography/roughness, mixed editions, nonfinite inputs and heights beyond zg",()=>{
  for(const edit of [{topography:"ridge"},{roughnessTransition:"changed"},{edition:"2025"},{heightM:301},{s3:NaN},{v0Mps:0},{guessedAirDensity:1.2}])expect(()=>calculateWindSpeed({...input,...edit})).toThrow();
  expect(()=>calculateWindSpeed({...input,reference:{...reference,edition:"2025"}})).toThrow();
});
it("applies computed q explicitly, preserves coefficients/combinations, invalidates review and scales all six wind resultants",()=>{
  const project=windReferenceProject(),before=JSON.stringify(project),d=project.workspace.spatialPreparation!,wind=d.loading!.wind!,heightM=Math.max(...generateStructure(project).model!.nodes.map(n=>n.z))/1000;
  const changed=applyWindSpeed(project,"WP",{...input,v0Mps:wind.building.basicVelocityMS,heightM}),next=changed.project.workspace.spatialPreparation!;
  expect(JSON.stringify(project)).toBe(before);expect(next.combinations).toEqual(d.combinations);expect(next.loading!.overlapReview).toBeUndefined();
  expect(next.loading!.wind!.cases[0].zones).toEqual(wind.cases[0].zones);
  const a=distributeWindActions(project,wind).cases[0],b=distributeWindActions(changed.project,next.loading!.wind!).cases[0],ratio=changed.result.dynamicPressurePa/wind.cases[0].dynamicPressurePa;
  a.forceN.forEach((v,i)=>expect(b.forceN[i]).toBeCloseTo(v*ratio,7));a.momentNm.forEach((v,i)=>expect(b.momentNm[i]).toBeCloseTo(v*ratio,6));
  for(const edit of [(p:typeof changed.project)=>p.workspace.spatialPreparation!.loading!.wind!.cases[0].dynamicPressurePa++, (p:typeof changed.project)=>p.workspace.spatialPreparation!.loading!.wind!.cases[0].speedCalculation!.heightM++, (p:typeof changed.project)=>p.workspace.spatialPreparation!.loading!.wind!.building.basicVelocityMS++]){const p=structuredClone(changed.project);edit(p);expect(()=>distributeWindActions(p,p.workspace.spatialPreparation!.loading!.wind!)).toThrow(/STALE_WIND_SPEED/);}
});
