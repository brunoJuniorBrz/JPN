import { expect,it } from "vitest";
import speedData from "../../data/normas/nbr6123-2023-speed.json" with { type: "json" };
import wallData from "../../data/normas/nbr6123-2023-wall-cpe.json" with { type: "json" };
import supplied from "../../data/normas/supplied-source-review-m33a.json" with { type: "json" };
import { NBR6123_DOCUMENT_SHA256,NBR6123_EDITION,NBR6123_ERRATA,assertSingleNbr6123Edition } from "./nbr6123-edition";
import { calculateWindExposure,calculateWindSpeed } from "./wind-speed";
import { correctedWindDocumentSha256 } from "./reviewed-roof-catalog";
import { WIND_PROVENANCE } from "./normative-provenance";
import { windReferenceProject } from "./examples/wind-project";
import { generateNormativeOriginTestStudy } from "./normative-origin";
import { m33aFixture } from "./test-support/m33a-fixtures";
import { buildNormativeFacadeTraction } from "./wind-facade-normative";
import { buildingProject } from "./test-support/m41-building-fixture";

const reference={standard:"ABNT NBR 6123",edition:NBR6123_EDITION,clause:"4.2; 5.3.3",source:"Controle numérico independente",revision:"1",responsible:"Teste"};
const speed={schema_version:"jpn.wind-speed/1",edition:NBR6123_EDITION,v0Mps:30,heightM:4,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,reference};

it("N1: todos os dados de vento declaram a mesma edição, errata e documento", ()=>{
  for(const d of [speedData,wallData]){
    expect(d.edition).toBe(NBR6123_EDITION);expect(d.errata).toBe(NBR6123_ERRATA);expect(d.documentSha256).toBe(NBR6123_DOCUMENT_SHA256);
  }
  expect(correctedWindDocumentSha256).toBe(NBR6123_DOCUMENT_SHA256);
  expect(supplied.sources.find(s=>s.id==="wind-corrected-partial")!.sha256).toBe(NBR6123_DOCUMENT_SHA256);
  expect(WIND_PROVENANCE.edition.startsWith(NBR6123_EDITION)).toBe(true);
});

it("N1: mistura de edições falha (guarda, velocidade e linhas Cpe/Cpi)", async ()=>{
  expect(()=>assertSingleNbr6123Edition([{edition:NBR6123_EDITION},{edition:"2023-original"}])).toThrow("WIND_EDITION_MIXED");
  expect(()=>assertSingleNbr6123Edition([{edition:"2023-original"}])).toThrow("WIND_EDITION_MIXED");
  expect(()=>assertSingleNbr6123Edition([])).toThrow("WIND_EDITION_MIXED");
  expect(()=>calculateWindSpeed({...speed,edition:"2023-original"})).toThrow();
  expect(()=>calculateWindSpeed({...speed,reference:{...reference,edition:"2023"}})).toThrow();
  expect(calculateWindSpeed(speed).edition).toBe(NBR6123_EDITION);

  const p=windReferenceProject();
  const ok=await generateNormativeOriginTestStudy(p,m33aFixture(p).input,m33aFixture(p).files);
  expect(ok.blockers.filter(b=>b.includes("EDITION")||b.includes("edition"))).toEqual([]);
  for(const z of ok.wind!.declaration.cases.flatMap(c=>c.zones))expect(z.reference.edition).toBe(NBR6123_EDITION);
  for(const mix of ["zone","cpi","row"] as const){
    const f=m33aFixture(p),old={...f.wind.rows[0].source,edition:"2023-original",errata:"2025-not-verified"} as never;
    if(mix==="zone")f.wind.rows[0].zones[0].cpe.source=old;
    if(mix==="cpi")f.wind.rows[0].cpiCases[0].coefficient.source=old;
    if(mix==="row")f.wind.rows[0].source=old;
    const r=await generateNormativeOriginTestStudy(p,f.input,f.files);
    expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.wind).toBeNull();
    expect(r.computedStructuralApproval).toBe(false);expect(r.fabricationRelease).toBe(false);
  }
});

it("N1: fachadas registram a edição única", ()=>{
  const r=buildNormativeFacadeTraction(buildingProject(["W1"]),{schema_version:"jpn.nbr6123-wall-wind/2",
    building:{longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true,heightDefinitionConfirmed:true},speed,
    cases:[{id:"W1",windFrom:"+X",internalPressure:{rule:"two-opposite-faces-equally-permeable",permeableAxis:"X"}}]});
  expect(r.edition).toBe(NBR6123_EDITION);expect(r.speed.edition).toBe(NBR6123_EDITION);
  expect(r.traction.cases[0].zones.every(z=>z.source.includes("Errata 1 de 08.04.2025"))).toBe(true);
  expect(r.releaseGate).toBe("NOT_READY_BLOCKED");expect(r.computedStructuralApproval).toBe(false);expect(r.fabricationRelease).toBe(false);
});

// Independent control: S2 of the corrected edition's Tabela 3 (doc p.16), two decimals, against
// the implemented 5.3.3 formula with Tabelas 1-2. z < 5 m uses 5 m (10 m in category V).
it("N1: S2 da fórmula confere com a Tabela 3 da versão corrigida", ()=>{
  const cases:[number,"I"|"II"|"III"|"IV"|"V","A"|"B"|"C",number][]=[
    [3,"I","A",1.06],[3,"II","C",0.89],[3,"V","A",0.74],[10,"II","A",1.00],[10,"IV","B",0.83],[20,"III","B",0.99],
    [30,"I","C",1.15],[50,"IV","C",0.99],[100,"I","B",1.26],[100,"V","C",1.01],[200,"III","A",1.27],[300,"II","B",1.33],[500,"V","C",1.34]];
  for(const [z,category,sizeClass,table] of cases)
    expect(Math.abs(calculateWindExposure({heightM:z,category,sizeClass}).s2-table),`${category}${sizeClass} z=${z}`).toBeLessThanOrEqual(0.005+1e-12);
});
