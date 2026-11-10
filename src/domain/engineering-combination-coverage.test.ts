import {describe,expect,it} from "vitest";
import {auditEngineeringCombinationCoverage} from "./engineering-combination-coverage";
const source={standard:"Norma de ação a conferir pelo responsável",
  edition:"Edição de estudo identificada e pendente de validação",
  clause:"Cláusula por cenário ainda sujeita à revisão de engenharia",
  source:"Referência externa do cálculo de ações",revision:"REV-M42",
  responsible:"Responsável técnico identificado nos documentos externos"};
const ids=["G","Q","WPOS","WNEG"];
const actions=[
  {caseId:"G",category:"permanent",exclusiveGroup:null,reference:source},
  {caseId:"Q",category:"variable",exclusiveGroup:null,reference:source},
  {caseId:"WPOS",category:"wind",exclusiveGroup:"WIND",reference:source},
  {caseId:"WNEG",category:"wind",exclusiveGroup:"WIND",reference:source},
] as const;
const combo=(id:string,purpose:"ULS"|"SLS-characteristic"|"SLS-frequent"|"SLS-quasi-permanent",
  multipliers:Record<string,number>)=>({
  id,purpose,hypothesis:"Ensaio de simultaneidade explícita, coeficientes artificiais sem validade normativa",
  reference:source,
  terms:ids.map(caseId=>({caseId,gamma:multipliers[caseId]??0,psi:1,reference:source})),
});
const study=(combinations:ReturnType<typeof combo>[])=>({
  schema_version:"jpn.engineering-combinations/1",
  normativeValidation:"pending-engineer-review",
  actions,combinations,
});
const full=()=>study([
  combo("U-P","ULS",{G:1,Q:1,WPOS:1,WNEG:0}),
  combo("U-N","ULS",{G:1,Q:1,WPOS:0,WNEG:1}),
  combo("S-P","SLS-characteristic",{G:1,Q:1,WPOS:1,WNEG:0}),
  combo("S-N","SLS-characteristic",{G:1,Q:1,WPOS:0,WNEG:1}),
]);
const cases=ids.map(id=>({id}));
const actual=(d:ReturnType<typeof study>)=>d.combinations.map(c=>({
  id:c.id,factors:Object.fromEntries(c.terms.map(t=>[t.caseId,t.gamma*t.psi])),
}));
describe("M42-P1: matriz de ações ELU/ELS sem supor coeficientes normativos",()=>{
  it("reconhece quatro casos explícitos, vento alternativo e cobertura ELU/ELS",()=>{
    const d=full(),a=auditEngineeringCombinationCoverage(d,cases,actual(d));
    expect(a.allCasesCoveredForULSAndSLS).toBe(true);
    expect(a.coverageStatus).toBe("case-matrix-reviewed");
    expect(a.matrix).toHaveLength(4);
    expect(a.groups).toHaveLength(1);
    expect(a.groups[0].alternatives).toEqual(["WPOS","WNEG"]);
    expect(a.groups[0].missingULS).toEqual([]);
    expect(a.groups[0].missingSLS).toEqual([]);
    expect(a.matrix[0].includedCases).toEqual(["G","Q","WPOS"]);
    expect(a.matrix[0].explicitZeroCases).toEqual(["WNEG"]);
    expect(a.actionCoverage.find(x=>x.caseId==="WNEG")!.ulsCombinations).toEqual(["U-N"]);
    expect(a.normativeCompliance).toBe(false);
    expect(a.fabricationRelease).toBe(false);
    expect(a.releaseGate).toBe("NOT_READY_BLOCKED");
  });
  it("avisa sobre vento não analisado em ELU, mesmo quando o vetor contém zero explícito",()=>{
    const d=study([
      combo("U-P","ULS",{G:1,Q:1,WPOS:1}),
      combo("S-P","SLS-characteristic",{G:1,Q:1,WPOS:1}),
      combo("S-N","SLS-characteristic",{G:1,Q:1,WNEG:1}),
    ]);
    const a=auditEngineeringCombinationCoverage(d,cases,actual(d));
    expect(a.coverageStatus).toBe("review-required");
    expect(a.missingULS).toEqual(["WNEG"]);
    expect(a.missingSLS).toEqual([]);
    expect(a.groups[0].missingULS).toEqual(["WNEG"]);
    expect(a.warnings.join(",")).toContain("M42_CASE_MISSING_ULS");
  });
  it("avisa sobre ausência de ELS, mesmo existindo combinações ELU",()=>{
    const d=study([combo("U-P","ULS",{G:1,Q:1,WPOS:1}),
      combo("U-N","ULS",{G:1,Q:1,WNEG:1})]);
    const a=auditEngineeringCombinationCoverage(d,cases,actual(d));
    expect(a.missingSLS).toEqual(ids);
    expect(a.allCasesCoveredForULSAndSLS).toBe(false);
    expect(a.coverageStatus).toBe("review-required");
  });
  it("identifica cenários duplicados com IDs diferentes e evita falsa aprovação",()=>{
    const d=study([
      combo("U-1","ULS",{G:1,Q:1,WPOS:1}),
      combo("U-2","ULS",{G:1,Q:1,WPOS:1}),
      combo("S-1","SLS-frequent",{G:1,Q:1,WPOS:1}),
    ]);
    const a=auditEngineeringCombinationCoverage(d,cases,actual(d));
    expect(a.duplicateVectors).toEqual([{purpose:"ULS",first:"U-1",duplicate:"U-2"}]);
    expect(a.coverageStatus).toBe("review-required");
  });
  it("rejeita caso real ausente, fator alterado, vento simultâneo e grupo inválido",()=>{
    const d=full(),other=actual(d);
    other[0].factors.WPOS=0.9;
    expect(()=>auditEngineeringCombinationCoverage(d,cases,other)).toThrow("STALE_ENGINEERING_COMBINATIONS");
    expect(()=>auditEngineeringCombinationCoverage(d,cases.slice(0,3),actual(d)))
      .toThrow("ENGINEERING_COMBINATIONS");
    const invalid=full();
    invalid.combinations[0].terms.find(t=>t.caseId==="WNEG")!.gamma=1;
    expect(()=>auditEngineeringCombinationCoverage(invalid,cases,actual(invalid)))
      .toThrow("ENGINEERING_COMBINATIONS");
  });
  it("mantém fatores gamma psi declarados sem substituir zero por coeficiente arbitrário",()=>{
    const d=full();
    d.combinations[0].terms.find(x=>x.caseId==="Q")!.gamma=1.4;
    d.combinations[0].terms.find(x=>x.caseId==="Q")!.psi=0.7;
    const a=auditEngineeringCombinationCoverage(d,cases,actual(d));
    expect(a.matrix[0].factors.Q).toBeCloseTo(0.98,12);
    expect(a.matrix[0].explicitZeroCases).toEqual(["WNEG"]);
    expect(a.normativeFactorsVerified).toBe(false);
  });
});
