import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { applyTrussToProject, blankTruss, purlinPositions, stations, tomTrussDefaults, trussIssues, trussPieces, trussSummary, withFall, fallPercent, trussEditorSchema } from "./truss-editor";
import { spatialPreparationReview } from "./spatial-preparation";
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

  it("painel de 60 cm mantém terças nos nós e quantidade comercial do editor", () => {
    const t = { ...tomTrussDefaults(), panelMm: 600 };
    const purlins = purlinPositions(t), nodes = stations(t);
    expect(purlins).toHaveLength(t.purlinLines);
    expect(purlins.every(p => p.onNode && nodes.includes(p.sMm))).toBe(true);
    expect(purlins.some(p => Math.abs(p.shiftMm) > 10)).toBe(true);
    expect(trussIssues(t).some(i => i.message.includes("fora de nó"))).toBe(true);
    const summary = trussSummary(t);
    expect(summary.bars.web).toBe(8);
    expect(summary.bars.webFullHeight).toBe(13);
    const project = applyTrussToProject(newProject(), { ...t, fullHeightBudget: true });
    expect(project.workspace.physicalStructure!.pieces.filter(p => p.role === "purlin"))
      .toHaveLength((t.trusses - 1) * t.purlinLines);
  });

  it("não aplica linhas de terça duplicadas ou que não cabem no vão", () => {
    const t = { ...tomTrussDefaults(), purlinStepMm: 6000 };
    expect(trussIssues(t).some(i => i.level === "erro")).toBe(true);
    expect(() => applyTrussToProject(newProject(), t)).toThrow();
  });

  it("mantém workspace legado sem campo trussEditor", async () => {
    const { emptyWorkspace, workspaceSchema } = await import("./workspace");
    const old = emptyWorkspace();
    expect("trussEditor" in old).toBe(false);
    expect(workspaceSchema.parse(old)).toEqual(old);
  });

  it("orçamento: medida cheia e itens sem preço", () => {
    const t = tomTrussDefaults(), real = trussSummary(t), full = trussSummary({ ...t, fullHeightBudget: true });
    expect(full.lines[1].qty).toBe("14 barras");
    expect(real.lines[1].qty).toBe("9 barras");
    expect(real.missing).toEqual(expect.arrayContaining([`Banzos ${t.chord.designation}`]));
    // telha 75,9 m x R$ 44 + parafusos + insumos + mão de obra
    expect(real.knownCents).toBe(333960 + real.screws * 60 + 110000 + 400000);
  });

  it("obra do dia a dia: muros, ancoragem, telha em 2 peças, folga e obra nova", () => {
    const t = tomTrussDefaults();
    // Dado salvo antes destes campos continua abrindo (defaults).
    const old = JSON.parse(JSON.stringify(t));
    delete old.walls; delete old.anchor; delete old.supportZMm; delete old.gutter.lowSideMm; delete old.gutter.highSideMm; delete old.gutter.budgeted;
    delete old.sheet.piecesPerSlope; delete old.sheet.overlapMm; delete old.chord.extraBars; delete old.web.extraBars; delete old.purlin.extraBars;
    expect(trussEditorSchema.parse(old)).toEqual(t);

    const two = trussSummary({ ...t, sheet: { ...t.sheet, piecesPerSlope: 2, overlapMm: 250 } }), one = trussSummary(t);
    expect(two.sheets).toBe(one.sheets * 2);
    expect(two.sheetLengthMm).toBe(Math.ceil((one.sheetLengthMm + 250) / 2 / 10) * 10);
    expect(two.screws).toBe(one.screws);

    const extra = trussSummary({ ...t, web: { ...t.web, extraBars: 1 }, chord: { ...t.chord, extraBars: 2 } });
    expect(extra.buy).toEqual({ chord: one.bars.chord + 2, web: one.bars.web + 1, purlin: one.bars.purlin });
    expect(extra.lines[0].qty).toBe(`${one.bars.chord + 2} barras (+2 folga)`);

    const priced = trussSummary({ ...t, anchor: { ...t.anchor, boltsPerSupport: 2, platePriceCents: 3000, boltPriceCents: 1500 } });
    expect(priced.plates).toBe(3);
    expect(priced.bolts).toBe(6);
    expect(priced.knownCents - one.knownCents).toBe(3 * 3000 + 6 * 1500);

    const p = applyTrussToProject(newProject(), { ...t, supportZMm: 3200 });
    const supports = p.workspace.spatialPreparation!.supports;
    expect(supports).toHaveLength(6);
    expect(supports.every(s => s.dofs.every(d => d === "pending"))).toBe(true);
    const nodes = new Map(p.workspace.physicalStructure!.nodes.map(n => [n.id, n]));
    expect(supports.every(s => nodes.get(s.nodeId)!.z === 3200)).toBe(true);
    const review = spatialPreparationReview(p, p.workspace.spatialPreparation!);
    expect(JSON.stringify(review)).not.toContain("ORPHAN_SUPPORT");

    const blank = blankTruss();
    expect(trussIssues(blank).filter(i => i.level === "erro")).toEqual([]);
    expect(trussSummary(blank).knownCents).toBe(0);
  });
});
