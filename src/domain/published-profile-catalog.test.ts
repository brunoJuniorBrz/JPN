import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { roles } from "./structure";
import { resolveSection } from "./profile-section";
import { PUBLISHED_PROFILE_CATALOG, catalogEntryById, planningProfileFromCatalog } from "./published-profile-catalog";

describe("catálogo técnico regional sem preços", () => {
  it("registra 56 bitolas com fontes públicas e preserva os cinco pedidos exatos como pendentes", () => {
    expect(PUBLISHED_PROFILE_CATALOG).toHaveLength(56);
    expect(new Set(PUBLISHED_PROFILE_CATALOG.map(p => p.id)).size).toBe(56);
    expect(PUBLISHED_PROFILE_CATALOG.every(p => p.consultedAt === "2026-11-01" && p.massSourceUrl.startsWith("https://") && p.dimensionSourceUrl.startsWith("https://") && p.massKgM > 0)).toBe(true);
    for (const i of [1,2,3,4,5]) expect(catalogEntryById("P" + String(i).padStart(3, "0"))).toBeUndefined();
    expect(catalogEntryById("P027")?.massKgM).toBe(18.782667);
    expect(catalogEntryById("P032")?.massKgM).toBe(12.656167);
    expect(catalogEntryById("P044")?.massKgM).toBe(5.71);
    expect(catalogEntryById("P053")?.massKgM).toBe(5.68);
  });
  it("checa massa geométrica aproximada sem substituir a massa publicada", () => {
    const flagged = PUBLISHED_PROFILE_CATALOG.filter(p => p.requiresReview).map(p => p.id);
    expect(flagged).toEqual(["P006", "P047", "P051", "P057"]);
    for (const p of PUBLISHED_PROFILE_CATALOG) {
      expect(p.approximateMassKgM).toBeGreaterThan(0);
      expect(p.differencePercent > 5).toBe(p.requiresReview);
      expect(p.differencePercent).toBeCloseTo(Math.abs(p.massKgM - p.approximateMassKgM) / p.approximateMassKgM * 100, 8);
    }
  });
  it("importa geometria 3D e massa, mas nunca inventa A/I/J/E, aço, barra comercial ou preço", () => {
    for (const p of PUBLISHED_PROFILE_CATALOG) {
      const plan = planningProfileFromCatalog(p);
      expect(plan.massKgM).toBe(p.massKgM);
      expect(plan.steelGrade).toBe("");
      expect(plan.stockLengthM).toBeNull();
      expect(plan.pricePerMeterCents).toBeNull();
      expect(plan.data?.areaCm2).toBeNull();
      expect(plan.data?.elasticModulusGpa).toBeNull();
      expect(plan.data?.iyCm4).toBeNull();
      expect(plan.data?.izCm4).toBeNull();
      expect(plan.source).toContain(p.massSourceUrl);
      expect(plan.source).toContain(p.dimensionSourceUrl);
      expect(resolveSection(plan).section).not.toBeNull();
    }
  });
  it("alimenta massa de levantamento da obra original sem transformar o exemplo em obra calculada", () => {
    const project = createQuickProject({ typology:"gable",widthM:10,lengthM:20,heightM:4 });
    const profile = planningProfileFromCatalog(catalogEntryById("P027")!);
    for (const role of roles) project.planning!.profiles[role] = structuredClone(profile);
    const result = generateStructure(project);
    expect(result.model).not.toBeNull();
    const pieces = result.model!.pieces;
    expect(result.model!.massComplete).toBe(true);
    expect(result.model!.knownMassKg).toBeCloseTo(pieces.reduce((sum,p) => sum + p.lengthMm / 1000 * profile.massKgM!, 0), 6);
    expect(project.workspace.spatialPreparation).toBeUndefined();
    expect(profile.data?.areaCm2).toBeNull();
  });
});
