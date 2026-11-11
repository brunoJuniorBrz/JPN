import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {comparePhysicalOrientations,quaternionOrientation} from "./spatial-orientation";
import {p4RequestSchema,p4DiagnosticSchema,verifyP4Diagnostic} from "./p4-frame";

const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../validation/m43-p5/${name}`,import.meta.url),"utf8"));
const evidence=read("evidence.json");

it("independently repeats Python physical SO(3) comparisons, including failed cases",()=>{
  expect(evidence.accepted_cases).toContain("cantilever");
  expect(evidence.pending_cases).toEqual(["sway","spatial","torsion"]);
  for(const c of evidence.cases){
    for(const comparison of [c.before,c.after,c.continuous_before,c.continuous_after].filter(Boolean)){
      for(const [id,node] of Object.entries(comparison.physical_nodes)){
        const n=node as {candidate_orientation:number[][];reference_orientation:number[][];reference_uncertainty_rad:number};
        const computed=comparePhysicalOrientations(n.candidate_orientation,n.reference_orientation,n.reference_uncertainty_rad);
        const recorded=comparison.orientations[id];
        expect(computed.boundsMet).toBe(recorded.bounds_met);
        expect(Math.abs(computed.geodesicErrorRad-recorded.geodesic_error_rad)).toBeLessThan(2e-16);
        expect(Math.abs(computed.allowedErrorRad-recorded.allowed_error_rad)).toBeLessThan(2e-16);
        computed.componentErrorRad.forEach((v,i)=>expect(Math.abs(v-recorded.component_error_rad[i])).toBeLessThan(2e-16));
        computed.componentAllowedRad.forEach((v,i)=>expect(Math.abs(v-recorded.component_allowed_rad[i])).toBeLessThan(2e-16));
        computed.directorError.forEach((v,i)=>expect(Math.abs(v-recorded.director_error[i])).toBeLessThan(5e-16));
      }
    }
    expect(c.production_enabled).toBe(false);expect(c.spatial_domain_verified).toBe(false);
    expect(c.computed_structural_approval).toBe(false);expect(c.fabrication_release).toBe(false);
    expect(c.release_gate).toBe("NOT_READY_BLOCKED");
  }
});

it("audits the refined Python result with the existing independent TS energy/wrench auditor",async()=>{
  const fixture=read("cantilever-audited-result.json");
  const request=p4RequestSchema.parse(fixture.request),result=p4DiagnosticSchema.parse(fixture.result);
  await verifyP4Diagnostic(request,result);
  expect(result.physical_convergence_verified).toBe(true);
  expect(result.spatial_domain_verified).toBe(false);
  const changed=structuredClone(result);
  changed.candidate.combinations.C.nodes.T0.orientation_quaternion[3]+=1e-5;
  await expect(verifyP4Diagnostic(request,changed)).rejects.toThrow();
});

it("keeps quaternion sign invariance and rejects additive noncommuting rotations",()=>{
  const q=[Math.cos(.001),Math.sin(.001),0,0];
  const a=quaternionOrientation(q),b=quaternionOrientation(q.map(v=>-v));
  expect(comparePhysicalOrientations(a,b).boundsMet).toBe(true);
  const actual=quaternionOrientation([Math.cos(.01)*Math.cos(.005),Math.cos(.01)*Math.sin(.005),Math.sin(.01)*Math.cos(.005),-Math.sin(.01)*Math.sin(.005)]);
  const angle=Math.hypot(.01,.02),scale=Math.sin(angle/2)/angle;
  const additive=quaternionOrientation([Math.cos(angle/2),.01*scale,.02*scale,0]);
  expect(comparePhysicalOrientations(actual,additive).geodesicErrorRad).toBeGreaterThan(9e-5);
});

it("uses angular absolute bounds near zero and includes independent uncertainty",()=>{
  const identity=quaternionOrientation([1,0,0,0]);
  const tiny=quaternionOrientation([Math.cos(4.5e-11),Math.sin(4.5e-11),0,0]);
  expect(comparePhysicalOrientations(identity,tiny).boundsMet).toBe(true);
  expect(comparePhysicalOrientations(identity,tiny,2e-11).boundsMet).toBe(false);
  expect(()=>comparePhysicalOrientations(identity,[[1,0,0],[0,1,0],[0,0,-1]])).toThrow();
  expect(()=>comparePhysicalOrientations(identity,identity,-1)).toThrow();
  expect(()=>quaternionOrientation([2,0,0,0])).toThrow();
  expect(()=>quaternionOrientation([NaN,0,0,0])).toThrow();
});

it("retains component-wise angular floors when another axis has a larger rotation",()=>{
  const a=quaternionOrientation([Math.cos(.005),Math.sin(.005),0,0]);
  const phi=Math.hypot(.01,1.1e-10),scale=Math.sin(phi/2)/phi;
  const b=quaternionOrientation([Math.cos(phi/2),.01*scale,0,1.1e-10*scale]);
  const check=comparePhysicalOrientations(a,b);
  expect(check.geodesicErrorRad).toBeLessThan(check.allowedErrorRad);
  expect(check.componentBoundUtilization[2]).toBeGreaterThan(1);
  expect(check.boundsMet).toBe(false);
});
