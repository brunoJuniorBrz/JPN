import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { emptyPlanning } from "./structure";
import { applyTrussToProject, blankTruss, purlinPositions, stations, tomTrussDefaults, trussIssues, trussPieces, trussPiecesComplete, roofPurlinPositions, trussSummary, withFall, fallPercent, trussEditorSchema, trussDefaultsFor } from "./truss-editor";
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
    expect(trussIssues({ ...t, purlinStepMm: 1400 }).some(i => i.message.includes("ajustada"))).toBe(true);
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

  it("obra do dia a dia: muros, ancoragem, telha em 2 peças, folga e obra nova", () => {
    const t = tomTrussDefaults();
    // Dado salvo antes destes campos continua abrindo (defaults).
    const old = JSON.parse(JSON.stringify(t));
    delete old.roofKind; delete old.walls; delete old.anchor; delete old.supportZMm; delete old.gutter.lowSideMm; delete old.gutter.highSideMm; delete old.gutter.budgeted; delete old.gutter.pricePerMCents;
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

  it("duas águas simétricas: duas faces XYZ, cumeeira única e apoios pendentes", () => {
    const original = tomTrussDefaults();
    const t = trussEditorSchema.parse({ ...original, roofKind: "two-slopes", purlinStepMm: 600 });
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
    const L = 3250, parts = trussPiecesComplete(t);
    expect(parts.some(p => p.id.startsWith("E-"))).toBe(true);
    expect(parts.some(p => p.id.startsWith("D-"))).toBe(true);
    expect(parts.filter(p => p.kind === "M" && p.a[0] === L)).toHaveLength(1);
    const purlins = roofPurlinPositions(t);
    expect(new Set(purlins.map(p => p.xMm)).size).toBe(purlins.length);
    expect(purlins.filter(p => Math.abs(p.xMm - L) < 1e-6)).toHaveLength(1);
    const project = applyTrussToProject(newProject(), t);
    const faces = project.workspace.spatialPreparation!.physicalRoofFaces!.faces;
    expect(faces.map(f => f.id)).toEqual(["AGUA-E", "AGUA-D"]);
    const nodes = new Map(project.workspace.physicalStructure!.nodes.map(n => [n.id, n]));
    expect(faces.every(f => f.outer.every(v => Number.isFinite(v[2])))).toBe(true);
    expect(project.workspace.physicalStructure!.pieces.filter(p => p.role === "purlin")).toHaveLength((t.trusses - 1) * purlins.length);
    const supports = project.workspace.spatialPreparation!.supports;
    expect(supports).toHaveLength(t.trusses * 2);
    expect(supports.every(s => s.dofs.every(d => d === "pending"))).toBe(true);
    const supportX = [...new Set(supports.map(s => nodes.get(s.nodeId)!.x))].sort((a, b) => a - b);
    expect(supportX).toEqual([750, 7250]);
    const two = trussSummary(t), one = trussSummary(original);
    expect(two.sheets).toBe(one.sheets * 2);
    expect(two.plates).toBe(t.trusses * 2);
    expect(two.kg.total).toBeCloseTo(two.kg.chord + two.kg.web + two.kg.purlin, 7);
    expect(project.workspace.trussEditor?.roofKind).toBe("two-slopes");
  });

  it("calha: só entra no orçamento quando habilitada, conta dois beirais e preço declarado", () => {
    const t = tomTrussDefaults(), base = trussSummary(t);
    const priced = trussSummary({ ...t, gutter: { ...t.gutter, budgeted: true, pricePerMCents: 2400 } });
    expect(priced.knownCents - base.knownCents).toBe(2400 * 10);
    const dualInput = { ...t, roofKind: "two-slopes" as const, purlinStepMm: 600 };
    const dual = trussSummary({ ...dualInput, gutter: { ...t.gutter, budgeted: true, pricePerMCents: 2400 } });
    const notBudgeted = trussSummary(dualInput);
    expect(dual.knownCents - notBudgeted.knownCents).toBe(2400 * 20);
    expect(trussSummary({ ...t, gutter: { ...t.gutter, budgeted: true, pricePerMCents: null } }).missing).toContain("Calha (m)");
  });

  it("obra independente 12×20 em duas águas: dimensões, preços vazios e terças por geometria", () => {
    const project = newProject();
    project.roof = { ...project.roof, widthM: 12, lengthM: 20, slopePercent: 10 };
    project.planning = { ...emptyPlanning(), typology: "gable" };
    const t = trussDefaultsFor(project);
    expect(t.roofKind).toBe("two-slopes");
    expect(t.spanMm).toBe(12000);
    expect(t.lengthMm).toBe(20000);
    expect(t.trusses).toBe(5); // Cinco quadros geométricos: segmentos de terça de 5 m, sem dimensionamento.
    expect(t.purlinLines).toBe(7);
    expect(t.chord.barPriceCents).toBeNull();
    expect(t.sheet.pricePerMCents).toBeNull();
    expect(t.laborPerM2Cents).toBeNull();
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
    expect(trussSummary(t).bars.purlin).toBeGreaterThan(0);
    const built = applyTrussToProject(project, t);
    expect(built.workspace.spatialPreparation!.physicalRoofFaces!.faces).toHaveLength(2);
    expect(built.workspace.spatialPreparation!.supports).toHaveLength(10);
    expect(built.workspace.spatialPreparation!.supports.every(x => x.dofs.every(d => d === "pending"))).toBe(true);
    expect(built.workspace.physicalStructure!.pieces.filter(p => p.role === "purlin")).toHaveLength(4 * 13);
  });

  it("outras dimensões preservam geometria e não importam preços do Tom", () => {
    for (const [widthM, lengthM] of [[6, 8], [8, 10], [12, 20]] as const) {
      const project = newProject();
      project.roof = { ...project.roof, widthM, lengthM, slopePercent: 10 };
      const t = trussDefaultsFor(project);
      expect(t.roofKind).toBe("one-slope");
      expect(t.spanMm).toBe(widthM * 1000);
      expect(t.lengthMm).toBe(lengthM * 1000);
      expect(t.purlinLines).toBeGreaterThanOrEqual(2);
      expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
      expect(trussSummary(t).knownCents).toBe(0);
    }
  });

  it("não inventa emenda estrutural para terça maior que barra comercial", () => {
    const t = { ...blankTruss(), lengthMm: 20000, trusses: 2 };
    expect(trussIssues(t)).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "erro", message: expect.stringContaining("excede a barra comercial") }),
    ]));
    expect(() => applyTrussToProject(newProject(), t)).toThrow(/emenda/);
  });
});
