import { describe, expect, it } from "vitest";
import { projectSchema } from "./models";
import { calculateEstimate } from "./calculations/estimate";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { resolveSection } from "./profile-section";
import { profiles3DDemo } from "./profiles-3d-demo";
import { SHOWCASE_IDS, SHOWCASE_KINDS, showcaseProject } from "./showcase-projects";

describe("Novas demonstrações com proposta e modelo 3D", () => {
  for (const kind of SHOWCASE_KINDS) {
    it(`${kind}: projeto completo com sólidos, quantitativos e orçamento sem pendências`, () => {
      const p = projectSchema.parse(showcaseProject(kind));
      expect(p.id).toBe(SHOWCASE_IDS[kind]);
      expect(p.isExample).toBe(true);
      expect(p.planning?.profiles.column.visualSection).toBeDefined();
      for (const profile of Object.values(p.planning!.profiles)) {
        const section = resolveSection(profile);
        expect(section.warning).toBe("");
        expect(section.section).not.toBeNull();
        expect(profile.source).toMatch(/SINTÉTICOS/);
      }
      const result = generateStructure(p);
      expect(result.model).not.toBeNull();
      expect(result.model!.pieces.length).toBeGreaterThan(100);
      expect(result.model!.pieces.every(piece => resolveSection(piece.profile).section !== null)).toBe(true);
      expect(p.estimate.materials.filter(line => line.source === "takeoff")).toHaveLength(5);
      expect(p.estimate.materials.filter(line => line.source === "takeoff").every(line => line.quantityOrigin?.signature === structureSignature(p))).toBe(true);
      const budget = calculateEstimate(p);
      expect(budget.pending).toEqual([]);
      expect(budget.materialsCents).toBeGreaterThan(0);
      expect(budget.laborCents).toBeGreaterThan(0);
      expect(budget.expensesCents).toBeGreaterThan(0);
      expect(budget.saleCents).toBeGreaterThan(budget.totalCostCents);
      expect(p.commercialNotes).toMatch(/SIMULADOS/);
    });
  }
  it("a demonstração geométrica reutiliza os vãos da obra, sem substituir dados comerciais", () => {
    const p = showcaseProject("cobertura");
    p.roof.lengthM = 16;
    const before = structuredClone(p);
    const result = generateStructure(p).model!;
    const demo = profiles3DDemo(p);
    expect(demo.pieces.length).toBe(result.pieces.length);
    expect(demo.roofAreaM2).toBe(result.roofAreaM2);
    expect(p).toEqual(before);
  });
});
