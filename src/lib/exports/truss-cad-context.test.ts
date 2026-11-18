import { describe, expect, it } from "vitest";
import { newProject } from "@/domain/models";
import { applyTrussToProject, tomTrussDefaults } from "@/domain/truss-editor";
import { createCadDrawing } from "./cad";

describe("CAD preliminar do editor de tesoura", () => {
  for (const roofKind of ["one-slope", "two-slopes"] as const) {
    it("desenha muros e calhas esquemáticos no corte " + roofKind, () => {
      const base = tomTrussDefaults();
      const t = { ...base, roofKind, purlinStepMm: roofKind === "two-slopes" ? 600 : base.purlinStepMm };
      const project = applyTrussToProject(newProject(), t);
      expect(project.workspace.spatialPreparation?.supports.every(s => s.dofs.every(d => d === "pending"))).toBe(true);
      const drawing = createCadDrawing(project, new Date("2026-11-18T10:00:00Z"), { format: "A3" });
      expect(drawing.sheets.some(page => page.name === "BASES")).toBe(true);
      expect(drawing.dxf).toContain("MURO BAIXO (ESQUEMA)");
      expect(drawing.dxf).toContain("CALHA 1 - ESQUEMA");
      if (roofKind === "two-slopes") expect(drawing.dxf).toContain("CALHA 2 - ESQUEMA");
      expect(drawing.dxf).toContain("PENDENTE: MUROS E CALHAS");
      expect(drawing.dxf).toContain("PRELIMINAR - NAO UTILIZAR PARA EXECUCAO OU CORTE");
    });
  }
});
