import { describe, expect, it } from "vitest";
import { SP_FIRE_RULESET } from "./fire-rules-sp";
import { assessSpFireScreening, findSpGeometricScenario, type FireScreeningInput } from "./fire-feasibility-sp";
const sample = (overrides: Partial<FireScreeningInput> = {}): FireScreeningInput => ({
  widthM: 25, lengthM: 30, context: "new-building", legalHeightM: 12,
  occupancy: "J-2", footprintConfirmed: true, mezzanineAreaM2: 0, additionalBuiltAreaM2: 0, ...overrides,
});

describe("Missão 19: triagem conservadora de incêndio/SP", () => {
  it("possui fontes oficiais, identificador e marca falta de validação profissional", () => {
    expect(SP_FIRE_RULESET.id).toMatch(/sp-69118/);
    expect(SP_FIRE_RULESET.reviewedByFireProfessional).toBe(false);
    expect(SP_FIRE_RULESET.sources[0].url).toMatch(/al\.sp\.gov\.br/);
  });
  it("750 m² e 12 m estão na faixa geométrica da Tabela 5", () => {
    const r = assessSpFireScreening(sample());
    expect(r.geometryAreaM2).toBe(750);
    expect(r.screeningBuiltAreaM2).toBe(750);
    expect(r.areaBand).toBe("up-to-750");
    expect(r.heightBand).toBe("up-to-12");
    expect(r.table).toBe("5");
    expect(r.status).toBe("preliminary-band");
    expect(r.hydrants.status).not.toBe("not-required");
  });
  it("750,01 m² muda a faixa e seleciona J-2 para a tabela 6J-1", () => {
    const r = assessSpFireScreening(sample({ widthM: 25, lengthM: 30.0004 }));
    expect(r.screeningBuiltAreaM2).toBe(750.01);
    expect(r.table).toBe("6J-1");
    expect(r.hydrants.status).toBe("requires-it-review");
  });
  it("12,01 m muda faixa mesmo com 750 m²", () => {
    const r = assessSpFireScreening(sample({ legalHeightM: 12.01 }));
    expect(r.heightBand).toBe("over-12");
    expect(r.table).toBe("6J-1");
    expect(r.status).toBe("technical-review");
  });
  it("J-1, J-2, J-3 e J-4 usam as tabelas apropriadas; nunca declaram isenção", () => {
    for (const [occupation, table] of [["J-1", "6J-1"], ["J-2", "6J-1"], ["J-3", "6J-2"], ["J-4", "6J-2"]] as const) {
      const r = assessSpFireScreening(sample({ occupancy: occupation, lengthM: 40 }));
      expect(r.table).toBe(table);
      expect(r.hydrants.status).not.toBe("not-assessed");
      expect(r.hydrants.note).toMatch(/nenhuma/i);
    }
  });
  it("outras ocupações exigem tabela específica; não inventa medidas", () => {
    const r = assessSpFireScreening(sample({ occupancy: "G-4", lengthM: 40 }));
    expect(r.table).toBe("specific-table-pending");
    expect(r.hydrants.status).toBe("professional-review-required");
  });
  it("não transforma uma cobertura aberta em área regulamentar", () => {
    const r = assessSpFireScreening(sample({ context: "open-roof" }));
    expect(r.screeningBuiltAreaM2).toBeNull();
    expect(r.status).toBe("technical-review");
    expect(r.table).toBe("undetermined");
  });
  it("não assume que altura do telhado é altura legal", () => {
    const r = assessSpFireScreening(sample({ legalHeightM: null }));
    expect(r.heightBand).toBe("undetermined");
    expect(r.table).toBe("undetermined");
    expect(r.status).toBe("missing-information");
  });
  it("sem ocupação não simula classificação técnica", () => {
    const r = assessSpFireScreening(sample({ occupancy: null }));
    expect(r.missing.join(" ")).toMatch(/Divisão/);
    expect(r.table).toBe("undetermined");
  });
  it("mezanino entra no somatório conservador e altera a faixa", () => {
    const r = assessSpFireScreening(sample({ mezzanineAreaM2: 100 }));
    expect(r.screeningBuiltAreaM2).toBe(850);
    expect(r.areaBand).toBe("over-750");
    expect(r.mezzanineDefinition).toBe("within-one-third");
  });
  it("mezanino acima de 1/3 não recebe enquadramento automático", () => {
    const r = assessSpFireScreening(sample({ mezzanineAreaM2: 251 }));
    expect(r.mezzanineDefinition).toBe("above-one-third");
    expect(r.status).toBe("technical-review");
  });
  it("mezanino igual a 1/3 está no limite da definição preliminar", () => {
    const r = assessSpFireScreening(sample({ mezzanineAreaM2: 250 }));
    expect(r.mezzanineDefinition).toBe("within-one-third");
  });
  it("outras áreas construídas fazem diferença, sem aplicar deduções automaticamente", () => {
    const r = assessSpFireScreening(sample({ additionalBuiltAreaM2: 20 }));
    expect(r.screeningBuiltAreaM2).toBe(770);
  });
  it("exige declaração explícita de zero para mezanino e demais áreas", () => {
    const r = assessSpFireScreening(sample({ mezzanineAreaM2: null, additionalBuiltAreaM2: null }));
    expect(r.screeningBuiltAreaM2).toBeNull();
    expect(r.status).toBe("missing-information");
  });
  it("não assume que toda projeção é área da obra", () => {
    const r = assessSpFireScreening(sample({ footprintConfirmed: false }));
    expect(r.screeningBuiltAreaM2).toBeNull();
  });
  it("não confunde classificação econômica com as tabelas da edificação", () => {
    expect(assessSpFireScreening(sample()).economicActivityRisk.status).toBe("not-assessed");
  });
  it("sugere geometria apenas com terreno, recuos e área operacional mínima declarados", () => {
    const r = findSpGeometricScenario(sample({ widthM: 25, lengthM: 40,
      terrain: { widthM: 30, lengthM: 50, setbackSideM: 2, setbackFrontM: 3, setbackRearM: 3 }, minimumOperationalAreaM2: 600 }));
    expect(r).not.toBeNull();
    expect(r!.estimatedScreeningAreaM2).toBeLessThanOrEqual(750);
    expect(r!.geometricAreaM2).toBeGreaterThanOrEqual(600);
    expect(r!.note).toMatch(/NÃO representa/);
  });
  it("não propõe alternativa que inviabilize a área mínima", () => {
    expect(findSpGeometricScenario(sample({ widthM: 25, lengthM: 40,
      terrain: { widthM: 30, lengthM: 50, setbackSideM: 2, setbackFrontM: 3, setbackRearM: 3 },
      minimumOperationalAreaM2: 900 }))).toBeNull();
  });
  it("não propõe alternativa sem recuos, sem contexto ou sem confirmação de área", () => {
    const i = sample({ widthM: 25, lengthM: 40, terrain: { widthM: 30, lengthM: 50 }, minimumOperationalAreaM2: 600 });
    expect(findSpGeometricScenario(i)).toBeNull();
    expect(findSpGeometricScenario({ ...i, context: "unknown" })).toBeNull();
    expect(findSpGeometricScenario({ ...i, footprintConfirmed: false })).toBeNull();
  });
  it("recusa geometria inválida e números não finitos", () => {
    const r = assessSpFireScreening(sample({ widthM: Number.NaN }));
    expect(r.geometryAreaM2).toBeNull();
    expect(r.status).toBe("missing-information");
    expect(findSpGeometricScenario(sample({ widthM: 25, lengthM: 40,
      terrain: { widthM: 30, lengthM: 50, setbackSideM: -1, setbackFrontM: 3, setbackRearM: 3 },
      minimumOperationalAreaM2: 600 }))).toBeNull();
  });
});
