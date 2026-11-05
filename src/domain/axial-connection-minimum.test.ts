import { expect,it } from "vitest";
import { axialConnectionMinimum } from "./axial-connection-minimum";
it("applies the half-capacity floor even when the linear force is small or zero",()=>{
  for(const force of [0,1000,-1000]){const r=axialConnectionMinimum(force,24000,"CONDITIONAL");expect(r.designMinimumMagnitudeN).toBe(12000);expect(r.solverAxialN).toBe(force);expect(r.status).toBe("CALCULATED-CONDITIONAL");if("globalLoadsModified"in r)expect(r.globalLoadsModified).toBe(false);}
});
it("actual demand governs above the floor; a component/member PASS never certifies the joint",()=>{
  const r=axialConnectionMinimum(-20000,24000,"PASS");expect(r.designMinimumMagnitudeN).toBe(20000);if("jointResistanceVerified"in r)expect(r.jointResistanceVerified).toBe(false);
  expect(axialConnectionMinimum(12000,24000,"FAIL").designMinimumMagnitudeN).toBe(12000);
});
it("missing capacity and invalid units/data block the rule rather than falling back to solver force only",()=>{
  expect(axialConnectionMinimum(1000,null,"BLOCKED").status).toBe("BLOCKED");for(const capacity of [NaN,Infinity,0,-1])expect(()=>axialConnectionMinimum(1000,capacity,"PASS")).toThrow();
});
