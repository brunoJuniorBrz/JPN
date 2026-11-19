import { describe, expect, it } from "vitest";
import { newProject } from "@/domain/models";
import { applyTrussToProject, tomTrussDefaults } from "@/domain/truss-editor";
import { createCadDrawing } from "./cad";
import {spatialPreparationReview} from "@/domain/spatial-preparation";
import {createCompletePackage,compactMemorialWarnings} from "./complete-package";
import {packageTakeoff} from "./package-source";

describe("CAD preliminar do editor de tesoura", () => {
  for (const roofKind of ["one-slope", "two-slopes"] as const) {
    it("desenha muros e calhas esquemáticos no corte " + roofKind, () => {
      const base = tomTrussDefaults();
      const t = { ...base, roofKind, purlinStepMm: roofKind === "two-slopes" ? 600 : base.purlinStepMm };
      const project = applyTrussToProject(newProject(), t);
      expect(project.workspace.spatialPreparation?.supports.every(s => s.dofs.every(d => d !== "pending"))).toBe(true);
      expect(project.workspace.spatialPreparation?.supportInterfaces?.every(f => f.kind === "existing-masonry" && f.reviewStatus === "hypothesis")).toBe(true);
      const drawing = createCadDrawing(project, new Date("2026-11-18T10:00:00Z"), { format: "A3" });
      expect(drawing.sheets.some(page => page.name === "BASES")).toBe(true);
      expect(drawing.dxf).toContain("MURO BAIXO (ESQUEMA)");
      expect(drawing.dxf).toContain("CALHA 1 - ESQUEMA");
      if (roofKind === "two-slopes") expect(drawing.dxf).toContain("CALHA 2 - ESQUEMA");
      expect(drawing.dxf).toContain("PENDENTE: MUROS E CALHAS");
      expect(drawing.dxf).toContain("PRELIMINAR - NAO UTILIZAR PARA EXECUCAO OU CORTE");
    });
  }
  it("memorial compacto conserva cada pendência na rastreabilidade e compra difere do corte", async () => {
    const t={...tomTrussDefaults(),fullHeightBudget:true};
    const p=applyTrussToProject(newProject(),t);
    expect(spatialPreparationReview(p,p.workspace.spatialPreparation!).issues.some(i=>i.code==="STALE_GEOMETRY")).toBe(false);
    const report=packageTakeoff(p),stockByGroup=Object.fromEntries(report.groups.map(g=>[g.key,6000]));
    const generated=await createCompletePackage(p,{issuedAt:new Date("2026-11-18T10:00:00Z"),stockByGroup});
    const raw=generated.files.find(f=>f.name==="rastreabilidade/pendencias-completas.txt");
    expect(raw).toBeDefined();
    // Muro existente sem conferência no local continua pendente (e bloqueia o cálculo).
    expect(new TextDecoder().decode(raw!.bytes)).toContain("EXISTING_SUPPORT_PENDING:");
    expect(compactMemorialWarnings(Array.from({length:117},(_,i)=>`MEMBER_PENDING: Peça T${i} sem vínculo.`))).toHaveLength(1);
    expect(generated.manifest.fabricationRelease).toBe(false);
    expect(generated.manifest.releaseGate).toBe("NOT_READY_BLOCKED");
    const cad=createCadDrawing(p,new Date("2026-11-18T10:00:00Z"),{format:"A3"});
    expect(cad.dxf).toContain("compra por medida cheia 14 barras");
    expect(cad.dxf).toContain("corte geométrico real 9 barras");
  });

});
