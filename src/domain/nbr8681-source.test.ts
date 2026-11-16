import { expect,it } from "vitest";
import data from "../../data/normas/nbr8681-2025-combinations.json" with { type: "json" };
import { NBR8681_DOCUMENT_SHA256,assertSame8681Factors,reviewedRoofFactorsFrom8681 } from "./nbr8681-source";
import { buildReviewedRoofCatalog,combinationsDocumentSha256 } from "./reviewed-roof-catalog";
import { reviewedRoofProject,syntheticReviewedExtract } from "./test-support/m33a-reviewed-fixtures";
import { generateNormativeOriginTestStudy } from "./normative-origin";
import { withoutProvenance,WIND_PROVENANCE } from "./normative-provenance";

const SHA="f4020c7171308ad2b9577c3618f15fad67e413ec0caed70d83f7a7a51a3d2b9c";

it("N3: um só documento registrado (SHA do PDF), sem a origem Studocu", ()=>{
  expect(data.documentSha256).toBe(SHA);expect(data.sourceCopy.sha256).toBe(SHA);
  expect(NBR8681_DOCUMENT_SHA256).toBe(SHA);expect(combinationsDocumentSha256).toBe(SHA);
  expect(JSON.stringify(data).toLowerCase()).not.toContain("studocu");
});

// Cell by cell against the PDF text layer (Tabelas 1-6 p.14-17, 5.1.4.3). [desfavorável, favorável] / [psi0, psi1, psi2].
it("N3: valores do JSON conferidos célula a célula", ()=>{
  const t1=data.table1.types,unf=(k:"normal"|"special"|"exceptional")=>Object.values(t1).map(t=>t[k][0]);
  expect(unf("normal")).toEqual([1.25,1.30,1.35,1.40,1.50]);expect(unf("special")).toEqual([1.15,1.20,1.25,1.30,1.40]);
  expect(unf("exceptional")).toEqual([1.10,1.15,1.15,1.20,1.30]);
  expect(Object.values(t1).flatMap(t=>[t.normal[1],t.special[1],t.exceptional[1]]).every(v=>v===1)).toBe(true);
  expect([data.table2.normal,data.table2.special,data.table2.exceptional]).toEqual([[1.35,1],[1.25,1],[1.15,1]]);
  expect(data.table3.prestress).toEqual({normal:[1.2,.9],special:[1.2,.9],exceptional:[1.2,.9]});
  expect(data.table3["settlement-shrinkage"]).toEqual({normal:[1.2,0],special:[1.2,0],exceptional:[0,0]});
  const t4=data.table4.types;
  expect(Object.values(t4).map(t=>[t.normal,t.special,t.exceptional])).toEqual([[1.2,1.1,1],[1.2,1,1],[1.4,1.2,1],[1.5,1.3,1]]);
  expect([data.table5.normal,data.table5.special,data.table5.exceptional,data.gammaQExceptional]).toEqual([1.5,1.3,1,1]);
  expect(Object.values(data.table6.rows).map(r=>r.psi)).toEqual([[.5,.4,.3],[.7,.6,.4],[.8,.7,.6],[.6,.3,0],[.6,.5,.3],[1,1,1]]);
  const b=data.table6.registeredNotEnabled;
  expect([b["pedestrian-footbridges"],b["road-bridges"],b["railway-bridges"],b["crane-runway-beams"]]).toEqual([[.6,.4,.3],[.7,.5,.3],[1,1,.6],[1,.8,.5]]);
});

it("N3: o extrato da cobertura deriva do JSON (mesmos valores)", ()=>{
  expect(reviewedRoofFactorsFrom8681()).toEqual({permanentSteel:1.25,permanentIndustrialized:1.30,permanentFavorable:1,wind:1.4,roofLive:1.5,
    psiWind:[.6,.3,0],psiRoofLive:[.8,.7,.6]});
  expect(syntheticReviewedExtract().factors).toEqual(reviewedRoofFactorsFrom8681());
  const {project,input}=reviewedRoofProject("gable"),f=buildReviewedRoofCatalog(project,input,syntheticReviewedExtract()).factors;
  const uls=(category:string,role:string,effect="unfavorable")=>f.factors.find(x=>x.purpose==="ULS"&&x.category===category&&x.role===role&&x.effect===effect)!;
  expect(uls("wind","leading").gamma.value).toBe(1.4);expect(uls("wind","accompanying").psi.value).toBe(.6);
  expect(uls("variable","leading").gamma.value).toBe(1.5);expect(uls("permanent","permanent").gamma.value).toBe(1.30);
  expect(f.source.documentSha256).toBe(SHA);
});

it.each(["wind","psiWind","permanentFavorable"] as const)("N3: falha se as duas fontes divergirem (%s)", async key=>{
  const v=syntheticReviewedExtract();
  if(key==="wind")v.factors.wind=1.7;
  if(key==="psiWind")v.factors.psiWind=[.6,.3,.1];
  if(key==="permanentFavorable")v.factors.permanentFavorable=.9;
  expect(()=>assertSame8681Factors(v.factors)).toThrow(new RegExp(`NBR8681_SOURCE_DIVERGENCE: ${key}`));
  const {project,input}=reviewedRoofProject("gable");
  expect(()=>buildReviewedRoofCatalog(project,input,v)).toThrow(/NBR8681_SOURCE_DIVERGENCE/);
  const r=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:v});
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.batches).toEqual([]);expect(r.computedStructuralApproval).toBe(false);
});

it("N3: a marca PROVISIONAL antiga da 8681 é removida; a do vento continua", ()=>{
  const old={id:"combinations-nbr8681" as const,normativeStatus:"PROVISIONAL" as const,standard:"ABNT NBR 8681",edition:"2025",origin:"antiga",reason:"fonte não unificada (antiga)"};
  expect(withoutProvenance([old,WIND_PROVENANCE],"combinations-nbr8681")).toEqual([WIND_PROVENANCE]);
});
