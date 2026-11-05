import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import { calculateWindExposure } from "./wind-speed";

const references=JSON.parse(readFileSync("docs/validation/mission31/external-reference-inputs.json","utf8"));
const exposureCases=references.cases as Array<{id:string;heightM:number;category:string;sizeClass:string;reportedS2:number;reportedDecimalPlaces:number}>;

it.each(exposureCases)("reproduces the published partial exposure reference $id without invented V0/S3",row=>{
  const result=calculateWindExposure({heightM:row.heightM,category:row.category,sizeClass:row.sizeClass});
  // Half of the last printed digit: source rounding, not a tuned engineering
  // percentage. The source is external to the JPN implementation.
  const roundingInterval=.5*10**(-row.reportedDecimalPlaces);
  expect(Math.abs(result.s2-row.reportedS2)).toBeLessThan(roundingInterval);
});

it("exposes the historical source's conflicting basic wind speeds rather than certifying its adopted pressure",()=>{
  const row=references.cases[0],{s2}=calculateWindExposure({heightM:row.heightM,category:row.category,sizeClass:row.sizeClass});
  const vk=33*s2,q=.613*vk*vk/1000;
  expect(Math.abs(vk-row.reportedCharacteristicSpeedMps)).toBeLessThan(.005);
  expect(Math.abs(q-row.reportedPressureKNM2)).toBeLessThan(.005);
  const other=.613*(45*s2)**2/1000;
  expect(Math.abs(other-row.reportedPressureKNM2)).toBeGreaterThan(.005);
  expect(Math.abs(q-row.arbitrarilyAdoptedPressureKNM2)).toBeGreaterThan(.005);
});
