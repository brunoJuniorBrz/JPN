import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { NBR6123_EDITION } from "./nbr6123-edition";
import { calculateWindExposure,calculateWindSpeed } from "./wind-speed";

// Referências externas publicadas (TCCs), transcritas em validation/tcc-2026-11.
// Os esperados vêm do documento, nunca do JPN. Tolerâncias = metade do último
// dígito impresso (S2) propagada para q, não ajuste de engenharia.
const refs=JSON.parse(readFileSync("validation/tcc-2026-11/published-references.json","utf8"));
const byId=(id:string)=>refs.cases.find((c:{id:string})=>c.id===id);
const speedInput=(v0Mps:number,heightM:number,category:"III",sizeClass:"C",s3:number)=>({
  schema_version:"jpn.wind-speed/1",edition:NBR6123_EDITION,v0Mps,heightM,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category,sizeClass,s3,
  reference:{standard:"ABNT NBR 6123",edition:NBR6123_EDITION,clause:"5.3.3",source:"TCC-01-UFMG-OLIVEIRA-2015",revision:"pending-pdf-check",responsible:"validação externa"},
});

describe("TCC-01 UFMG/Oliveira 2015 (galpão CBCA 15x54 m) — vento",()=>{
  const c=byId("TCC-01-UFMG-OLIVEIRA-2015");
  it.each(c.wind.s2ByHeight as {heightM:number;s2:number}[])("S2 categoria III/classe C a $heightM m bate com o publicado ($s2)",row=>{
    const {s2}=calculateWindExposure({heightM:row.heightM,category:c.wind.category,sizeClass:c.wind.sizeClass});
    expect(Math.abs(s2-row.s2)).toBeLessThan(.005);
  });
  it.each(c.wind.s2ByHeight as {heightM:number;s2:number;qPa:number}[])("q a $heightM m reproduz $qPa Pa dentro do arredondamento do S2 impresso",row=>{
    const r=calculateWindSpeed(speedInput(c.wind.v0Mps,row.heightM,"III","C",c.wind.s3));
    const relative=2*.005/row.s2+.5/row.qPa; // q ∝ S2²; meia unidade do q impresso
    expect(Math.abs(r.dynamicPressurePa-row.qPa)/row.qPa).toBeLessThan(relative);
  });
});

describe("TCC-04 PUCRS/Lima 2024 — aritmética Vk/q com S2 publicado (NBR 6123:2023)",()=>{
  const w=byId("TCC-04-PUCRS-LIMA-2024").wind;
  it("Vk e q publicados são coerentes com V0·S1·S2·S3 e q=0,613·Vk²",()=>{
    const vk=w.v0Mps*w.s1*w.s2*w.s3,q=.613*vk*vk;
    expect(Math.abs(vk-w.vkMps)).toBeLessThan(.05);
    expect(Math.abs(q-w.qPa)/w.qPa).toBeLessThan(.001);
  });
});

describe("TCC-03 Doctum — inconsistência do q publicado fica registrada, não certificada",()=>{
  const w=byId("TCC-03-DOCTUM-TRELICA-U").wind;
  it("q=0,613(V0·S1·S2·S3)² com os fatores impressos não dá 0,31 kN/m²",()=>{
    const q=.613*(w.v0Mps*w.s1*w.s2*w.s3)**2/1000;
    expect(q).toBeCloseTo(.327,3);
    expect(Math.abs(q-w.qKNm2Published)).toBeGreaterThan(.01);
  });
});

describe("integridade da transcrição",()=>{
  it("mantém bloqueios e status de conferência pendente",()=>{
    expect(refs.approvedForFabrication).toBe(false);
    expect(refs.computedStructuralApproval).toBe(false);
    expect(refs.transcription.reviewStatus).toBe("pending-pdf-check");
  });
  it("TCC-02: 19 barras, pares simétricos e tesoura escolhida é a mais leve",()=>{
    const c=byId("TCC-02-UTFPR-SEGUCHI-2017"),f=c.publishedBarForcesKN_G1_00;
    expect(Object.keys(f).filter(k=>k!=="note")).toHaveLength(c.geometry.barCount);
    for(const [a,b] of [["3","5"],["13","9"],["17","19"],["4","10"]])expect(Math.abs(f[a][1]-f[b][1])).toBeLessThan(.5);
    const masses=Object.values(c.publishedTrussMassKg) as number[];
    expect(c.publishedTrussMassKg[c.geometry.chosenVariant]).toBe(Math.min(...masses));
  });
});
