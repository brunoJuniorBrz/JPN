import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { applyTrussToProject, purlinPositions, stations, tomTrussDefaults, trussIssues, trussPieces, trussSummary, withFall, fallPercent, trussEditorSchema } from "./truss-editor";
import { packageTakeoff } from "@/lib/exports/package-source";
import { packageCutting } from "@/lib/exports/complete-package";

describe("editor de tesoura por estações", () => {
  it("reproduz a tesoura do croqui do Tom (8 x 10 m) sem código", () => {
    const t = tomTrussDefaults(), s = trussSummary(t);
    expect(trussEditorSchema.parse(t)).toEqual(t);
    expect(s.trussLengthMm).toBe(7250);
    expect(s.fallPercent).toBeCloseTo(10, 9);
    const st = stations(t);
    expect(st).toHaveLength(16);
    expect(st.slice(0, 3)).toEqual([0, 250, 750]);
    expect(st.at(-1)! - st.at(-2)!).toBe(500);
    const pieces = trussPieces(t);
    expect(pieces.find(p => p.mark === "M1")!.lengthMm).toBeCloseTo(75, 9);
    expect(pieces.find(p => p.mark === "M16")!.lengthMm).toBeCloseTo(800, 9);
    expect(Math.round(pieces.find(p => p.mark === "D15")!.lengthMm)).toBe(943); // Tom: 94 cm
    expect(purlinPositions(t).map(p => p.sMm)).toEqual([0, 1250, 2750, 4250, 5750, 7250]);
    expect(purlinPositions(t).every(p => p.onNode)).toBe(true);
    expect(s.bars).toEqual({ chord: 8, web: 9, webFullHeight: 14, purlin: 12 });
    expect(s.sheets).toBe(10);
    expect(s.sheetLengthMm).toBe(7590);
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
  });

  it("grava no projeto e o pacote CAD corta exatamente as mesmas barras", () => {
    const t = tomTrussDefaults(), p = applyTrussToProject(newProject(), t);
    expect(p.workspace.trussEditor).toEqual(t);
    const report = packageTakeoff(p), stock = Object.fromEntries(report.groups.map(g => [g.key, 6000]));
    const cut = packageCutting(p, { stockByGroup: stock });
    const bars = Object.fromEntries(cut.groups.map(g => [g.profile.split(" · ")[0], g.bars.length]));
    const s = trussSummary(t);
    expect(bars).toEqual({ [t.chord.designation]: s.bars.chord, [t.web.designation]: s.bars.web, [t.purlin.designation]: s.bars.purlin });
    expect(p.workspace.physicalStructure!.pieces.filter(q => q.role === "purlin")).toHaveLength(12);
  });

  it("ajuste ponto a ponto, caída e diagonal invertida", () => {
    const t = tomTrussDefaults();
    const moved = { ...t, stationsMm: stations(t).map(s => s === 3750 ? 3700 : s) };
    expect(stations(moved)).toContain(3700);
    expect(stations(moved)).not.toContain(3750);
    const fall = withFall(t, 12);
    expect(fallPercent(fall)).toBeCloseTo(12, 6);
    expect(fall.tipHeightMm).toBe(75);
    const flipped = { ...t, flippedPanels: [14] };
    const d = trussPieces(flipped).find(p => p.mark === "D15")!;
    expect(d.a[0]).toBeGreaterThan(d.b[0]);
    expect(trussPieces({ ...t, diagonal: "none" }).some(p => p.kind === "D")).toBe(false);
    expect(trussIssues({ ...t, purlinStepMm: 1400 }).some(i => i.message.includes("fora de nó"))).toBe(true);
    expect(trussIssues({ ...t, highHeightMm: 50 }).some(i => i.level === "erro")).toBe(true);
    expect(() => applyTrussToProject(newProject(), { ...t, highHeightMm: 50 })).toThrow();
  });

  it("orçamento: medida cheia e itens sem preço", () => {
    const t = tomTrussDefaults(), real = trussSummary(t), full = trussSummary({ ...t, fullHeightBudget: true });
    expect(full.lines[1].qty).toBe("14 barras");
    expect(real.lines[1].qty).toBe("9 barras");
    expect(real.missing).toEqual(expect.arrayContaining([`Banzos ${t.chord.designation}`]));
    // telha 75,9 m x R$ 44 + parafusos + insumos + mão de obra
    expect(real.knownCents).toBe(333960 + real.screws * 60 + 110000 + 400000);
  });
});
