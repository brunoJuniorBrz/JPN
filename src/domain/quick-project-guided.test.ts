import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";

describe("assistente visual — entrada real e preferências não estruturais",()=>{
  it("usa espaçamentos escolhidos, apresenta perfil apenas visual e registra preferências",()=>{
    const p=createQuickProject({
      typology:"mono",widthM:10,lengthM:20,heightM:4,slopePercent:10,
      location:"Capão Bonito / SP",client:"Tom",frameSpacingM:3,purlinSpacingM:1,panels:8,
      preferences:{enclosure:"partial",support:"columns",profileInterest:"lipped-channel"}
    });
    expect(p.planning?.typology).toBe("mono");
    expect(p.planning?.frameSpacingM).toBe(3);
    expect(p.planning?.purlinSpacingM).toBe(1);
    expect(p.planning?.panels).toBe(8);
    expect(p.location).toBe("Capão Bonito / SP");
    expect(p.commercialNotes).toContain("Parcialmente fechado");
    expect(p.commercialNotes).toContain("Pilares");
    expect(p.commercialNotes).toContain("U enrijecido");
    expect(p.commercialNotes).toContain("NÃO criam vínculos");
    expect(p.planning?.profiles.column.pricePerMeterCents).toBeNull();
    expect(p.planning?.profiles.column.steelGrade).toBe("");
    expect(p.planning?.profiles.column.data?.areaCm2).toBeNull();
    expect(p.technicalStatus).toBe("preliminary");
    expect(p.estimate.materials).toEqual([]);
  });
  it("preserva a entrada rápida anterior quando as escolhas não são informadas",()=>{
    const p=createQuickProject({typology:"gable",widthM:10,lengthM:20,heightM:4});
    expect(p.planning?.frameSpacingM).toBe(4);
    expect(p.planning?.purlinSpacingM).toBe(1.5);
    expect(p.planning?.panels).toBe(6);
    expect(p.roof.slopePercent).toBe(10);
  });
  it.each([{frameSpacingM:0.1},{purlinSpacingM:4},{panels:0}])("recusa ajuste fora dos limites sem produzir geometria",extra=>{
    expect(()=>createQuickProject({typology:"mono",widthM:10,lengthM:20,heightM:4,...extra})).toThrow(/distribuição visual/);
  });
});