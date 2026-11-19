import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { planningExample } from "./planning-example";
import { generateStructure } from "./calculations/structure";
import { emptyPlanning } from "./structure";
import { auditPhysicalRoofCoverage } from "./physical-roof-coverage";
import { structureSignature } from "./calculations/project-basis";
import { resolvePhysicalStructure } from "./physical-structure";
import { applyTrussToProject, blankTruss, purlinPositions, stations, tomTrussDefaults, trussIssues, trussPieces, trussPiecesComplete, roofPurlinPositions, trussSummary, withFall, fallPercent, trussEditorSchema, trussDefaultsFor, suggestedTrussCount, trussReplacementImpact, columnCount, tipOffsetMm, trussLengthMm
} from "./truss-editor";
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
    expect(full.lines[1].qty).toBe("14 barras · corte real 9");
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
    expect(extra.buy).toEqual({ chord: one.bars.chord + 2, web: one.bars.web + 1, purlin: one.bars.purlin, column: 0 });
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
  it("obra independente do exemplo e projeto 12×20 de duas águas com espaçamentos declarados", () => {
    const empty = blankTruss(), example = tomTrussDefaults();
    expect(empty.spanMm).not.toBe(example.spanMm);
    expect(empty.sheet.pricePerMCents).toBeNull();
    expect(empty.laborPerM2Cents).toBeNull();
    expect(trussIssues(empty).filter(i => i.level === "erro")).toEqual([]);
    const p = newProject();
    p.roof = { ...p.roof, widthM: 12, lengthM: 20, slopePercent: 10 };
    p.planning = { ...emptyPlanning(), typology: "gable", frameSpacingM: 5, purlinSpacingM: 1.2 };
    const t = trussDefaultsFor(p);
    expect(t.roofKind).toBe("two-slopes");
    expect([t.spanMm, t.lengthMm, t.trusses]).toEqual([12000, 20000, 5]);
    expect(t.purlinLines).toBe(6);
    expect(purlinPositions(t)).toHaveLength(t.purlinLines);
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
    expect(trussSummary(t).knownCents).toBe(0);
    expect(applyTrussToProject(p, t).workspace.trussEditor?.spanMm).toBe(12000);
  });

  it("não inventa apoios para trecho de terça maior que a barra disponível", () => {
    const p = newProject();
    p.roof = { ...p.roof, widthM: 12, lengthM: 20, slopePercent: 10 };
    const t = trussDefaultsFor(p);
    expect(t.trusses).toBe(suggestedTrussCount(20000,t.stockMm)); // proposta comercial; não dimensionamento
    expect(trussIssues({ ...t, trusses: 3 }).some(i => i.level === "erro" && i.message.includes("excede a barra comercial"))).toBe(true);
    expect(() => applyTrussToProject(p, { ...t, trusses: 3 })).toThrow(/excede a barra comercial/);
  });

  it("assinatura atual e terças físicas vinculadas à superfície de uma ou duas águas", () => {
    for(const roofKind of ["one-slope","two-slopes"] as const){
      const t={...tomTrussDefaults(),roofKind,purlinStepMm:roofKind==="two-slopes"?600:1500};
      const p=applyTrussToProject(newProject(),t),prep=p.workspace.spatialPreparation!;
      expect(prep.geometrySignature).toBe(structureSignature(p));
      expect(spatialPreparationReview(p,prep).issues.some(i=>i.code==="STALE_GEOMETRY")).toBe(false);
      expect(prep.physicalRoofFaces!.faces.every(f=>f.supportPieceIds.length>0)).toBe(true);
      const checked=auditPhysicalRoofCoverage(prep.physicalRoofFaces!,resolvePhysicalStructure(p).model!);
      expect(checked.associatedPieceIds).toHaveLength(p.workspace.physicalStructure!.pieces.filter(piece=>piece.role==="purlin").length);
      expect(prep.supports.every(s=>s.dofs.every(d=>d==="pending"))).toBe(true);
    }
  });

  it("12x20 duas águas gera mais de 250 nós sem habilitar fabricação", () => {
    const t={...tomTrussDefaults(),roofKind:"two-slopes" as const,spanMm:12000,lengthMm:20000,
      trusses:5,panelMm:250,purlinLines:6,purlinStepMm:600};
    const p=applyTrussToProject(newProject(),t);
    expect(p.workspace.physicalStructure!.nodes.length).toBeGreaterThan(250);
    expect(p.workspace.cutting.useFabrication).toBe(false);
    expect(p.workspace.spatialPreparation!.supports.every(s=>s.dofs.every(d=>d==="pending"))).toBe(true);
  });

});

describe("aviso antes de substituir a estrutura", () => {
  it("obra completa gerada: lista pilares, tesouras e terças que vão sumir", () => {
    const impact = trussReplacementImpact(planningExample());
    expect(impact.replaces).toBe(true);
    expect(impact.source).toBe("generated");
    expect(impact.lines.some(l => l.startsWith("Pilares: "))).toBe(true);
    expect(impact.lines.some(l => l.startsWith("Terças: "))).toBe(true);
  });
  it("obra criada pelo próprio editor: nada a avisar", () => {
    const p = applyTrussToProject(newProject(), tomTrussDefaults());
    expect(trussReplacementImpact(p)).toEqual({ replaces: false, source: null, lines: [] });
    expect(trussReplacementImpact(newProject()).replaces).toBe(false);
  });
  it("modelo declarado com peças de outra origem: avisa só essas", () => {
    const p = applyTrussToProject(newProject(), tomTrussDefaults());
    const s = p.workspace.physicalStructure!;
    s.pieces.push({ id: "VIGA1", role: "beam", start: s.nodes[0].id, end: s.nodes[1].id, label: "Viga de borda", group: "VIGAS" });
    expect(trussReplacementImpact(p).lines).toEqual(["Vigas: 1"]);
  });
});

describe("tesoura sobre pilares (obra completa)", () => {
  it("obra gerada abre com apoio em pilares, mesma quantidade de pilares e alturas da obra", () => {
    const project = planningExample(), generated = generateStructure(project).model!;
    const t = trussDefaultsFor(project);
    expect(t.support).toBe("columns");
    expect(tipOffsetMm(t)).toBe(0);
    expect(trussLengthMm(t)).toBe(t.spanMm);
    expect(t.tipHeightMm).toBe(Math.round(project.planning!.trussDepthM! * 1000));
    expect(t.supportZMm).toBe(Math.round(project.roof.lowHeightM! * 1000) - t.tipHeightMm);
    expect(columnCount(t)).toBe(generated.pieces.filter(p => p.role === "column").length);
  });
  it("Aplicar mantém pilares (recriados nas pontas das tesouras), apoios nas bases e massa igual ao resumo", () => {
    const project = planningExample(), t = trussDefaultsFor(project), s = trussSummary(t);
    const next = applyTrussToProject(project, t), ps = next.workspace.physicalStructure!;
    const nodes = new Map(ps.nodes.map(n => [n.id, n]));
    const cols = ps.pieces.filter(p => p.role === "column");
    expect(cols).toHaveLength(t.trusses * 2);
    for (const c of cols) { expect(nodes.get(c.start)!.z).toBe(0); expect(nodes.get(c.end)!.z).toBe(t.supportZMm); }
    const supports = next.workspace.spatialPreparation!.supports;
    expect(supports).toHaveLength(t.trusses * 2);
    expect(supports.every(x => nodes.get(x.nodeId)!.z === 0 && x.dofs.every(d => d === "pending"))).toBe(true);
    expect(packageTakeoff(next).totals.massKg).toBeCloseTo(s.kg.total, 1);
    expect(s.lines.some(l => l.item.startsWith(`Pilares ${t.column.designation}`))).toBe(true);
    expect(s.lines.some(l => l.item.startsWith("Chapa de base"))).toBe(true);
    // Depois de aplicado, a obra é do editor: não pede confirmação de novo.
    expect(trussReplacementImpact(next).replaces).toBe(false);
  });
  it("muros continuam sendo o padrão e não ganham pilares", () => {
    const t = tomTrussDefaults();
    expect(t.support).toBe("walls");
    expect(columnCount(t)).toBe(0);
    expect(applyTrussToProject(newProject(), t).workspace.physicalStructure!.pieces.some(p => p.role === "column")).toBe(false);
  });
});
