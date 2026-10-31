import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { resolveSection } from "./profile-section";
import { roles } from "./structure";
import { projectSchema } from "./models";

describe("Entrada rápida de pré-projetos", () => {
  for (const typology of ["mono", "gable"] as const) {
    it(`gera ${typology} com sólidos 3D e nenhum dado resistente ou preço inventado`, () => {
      const project = createQuickProject({ typology, widthM: 10, lengthM: 20, heightM: 4 });
      expect(projectSchema.parse(project)).toEqual(project);
      expect(project.planning?.typology).toBe(typology);
      expect(project.technicalNotes).toMatch(/sem cálculo de vento/);
      expect(project.client).toMatch(/a informar/);
      expect(project.estimate.materials).toEqual([]);
      expect(project.estimate.labor).toEqual([]);
      const structure = generateStructure(project);
      expect(structure.model?.pieces.length).toBeGreaterThan(100);
      for (const role of roles) {
        const profile = project.planning!.profiles[role];
        expect(resolveSection(profile).section).not.toBeNull();
        expect(profile.source).toMatch(/sintética/);
        expect(profile.massKgM).toBeNull();
        expect(profile.stockLengthM).toBeNull();
        expect(profile.pricePerMeterCents).toBeNull();
        expect(profile.steelGrade).toBe("");
        expect(profile.data?.areaCm2).toBeNull();
        expect(profile.data?.elasticModulusGpa).toBeNull();
      }
    });
  }
  it("mantém largura e comprimento informados e aceita personalização posterior", () => {
    const project = createQuickProject({ typology: "mono", widthM: 8.5, lengthM: 17, heightM: 3.4, slopePercent: 12, client: "Cliente", name: "Oficina" });
    expect(project.name).toBe("Oficina");
    expect(project.client).toBe("Cliente");
    expect(project.roof.widthM).toBe(8.5);
    expect(project.roof.lengthM).toBe(17);
    expect(project.roof.slopePercent).toBe(12);
    const before = generateStructure(project).model!;
    project.planning!.frameSpacingM = 3;
    expect(generateStructure(project).model!.frameCount).toBeGreaterThan(before.frameCount);
  });
  it("rejeita medidas incompletas ou exageradas sem criar um projeto falso", () => {
    for (const input of [{ widthM: 0 }, { lengthM: 101 }, { heightM: 1 }, { slopePercent: 45 }, { widthM: Number.NaN }]) {
      expect(() => createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4, ...input })).toThrow();
    }
  });
});
