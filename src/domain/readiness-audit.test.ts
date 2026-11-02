import { expect,it } from "vitest";
import { familyReadiness } from "./family-readiness";
import { comparePhysicalProperty } from "./property-precision";
import { resistancePreparationSchema } from "./resistance-preparation";
import { emptyPhysicalGroup } from "./physical-declaration";
it("precisão explícita ou aritmética, sem percentuais e sem inferir resolução de número JSON",()=>{
  expect(comparePhysicalProperty(.1+.2,.3).status).toBe("consistent");expect(comparePhysicalProperty(10.001,10,.01).status).toBe("consistent");expect(comparePhysicalProperty(10.001,10).status).toBe("pending-precision");expect(comparePhysicalProperty(10.1,10,.01).status).toBe("mismatch");
  for(const invalid of [NaN,Infinity,-1,0])expect(()=>comparePhysicalProperty(10,10,invalid)).toThrow();
});
it.each(["rolled","welded"] as const)("família %s I/W não recebe diagnóstico Ue",family=>{
  const d=resistancePreparationSchema.parse({pieceId:"P",family,fyMpa:250,fuMpa:400,bucklingYM:4,bucklingZM:4,lateralRestraintM:4,source:"Synthetic physical I section",revision:"1",sectionProperties:{},restraintDescription:"Declared",normativeReference:"Pending clauses",geometry:{version:1,basis:"physical-engineer-declaration",shape:"i",dimensionsMm:{height:200,width:100,webThickness:6,flangeThickness:10},source:"Declared dimensions",revision:"1"}}),g={...emptyPhysicalGroup(),eGpa:200,gGpa:200/2.6,nu:.3};
  const r=familyReadiness(d,g,4);expect(r.scope).toBe("i-w-physical");expect(r.status).toBe("pending-normative-source");expect(r.issues).toEqual([]);
});
