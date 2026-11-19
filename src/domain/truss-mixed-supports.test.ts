import { afterEach, describe, expect, it, vi } from "vitest";
import { newProject } from "./models";
import {
  applyTrussToProject, columnCount, endSupportOf, tomTrussDefaults, trussEditorSchema, trussEnds, trussSummary,
  wallPlateCount, withEndSupports, type TrussEditor,
} from "./truss-editor";
import { resolvePhysicalStructure } from "./physical-structure";
import { reviewSupportInterfaces } from "./support-interface";
import { createTrussSiteScene } from "@/components/planning/truss-site-scene";
import { packageTakeoff } from "@/lib/exports/package-source";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { mixedPreparationReview } from "./mixed-adapter";
import { assessSupportReactions } from "./support-interface";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { CLADDING_ITEMS } from "./truss-analysis";
import { roofVariableLoad } from "./nbr6120-actions";
import { fallPercent } from "./truss-editor";

// Obra típica do Tom: duas águas sobre muro, mas o muro da DIREITA acaba na 3ª tesoura;
// da 4ª em diante a ponta direita apoia em pilar novo.
function muroAcabaNoMeio(): TrussEditor {
  const base: TrussEditor = { ...tomTrussDefaults(), roofKind: "two-slopes", spanMm: 8000, lengthMm: 10000, trusses: 6, supportZMm: 3000,
    tipHeightMm: 300, highHeightMm: 900, panelMm: 1000, purlinLines: 4, purlinStepMm: 1000 };
  return { ...base, lineSupports: withEndSupports(base, (line, side) => side === "right" && line >= 3 ? "column" : "wall") };
}

describe("apoios mistos muro/pilar no editor de tesoura", () => {
  it("projetos salvos antes continuam iguais (modo da obra vale para todas as pontas)", () => {
    for (const support of ["walls", "columns"] as const) {
      const old: Partial<TrussEditor> = { ...tomTrussDefaults(), support };
      delete old.lineSupports; delete old.supportModel;
      const parsed = trussEditorSchema.parse(old);
      expect(parsed.lineSupports).toEqual([]);
      expect(trussEnds(parsed).every(e => e.kind === (support === "columns" ? "column" : "wall"))).toBe(true);
      // Mesmas contagens da regra anterior: pilares 2 por tesoura; chapas de muro por água.
      expect(columnCount(parsed)).toBe(support === "columns" ? parsed.trusses * 2 : 0);
      expect(wallPlateCount(parsed)).toBe(support === "columns" ? 0 : parsed.trusses * (parsed.roofKind === "two-slopes" ? 2 : 1));
      const explicit = { ...parsed, lineSupports: withEndSupports(parsed, () => null) };
      expect(trussSummary(explicit).lines).toEqual(trussSummary(parsed).lines);
    }
  });

  it("muro acaba no meio: pilares só nas pontas em pilar, apoios e interfaces certos", () => {
    const t = muroAcabaNoMeio(), p = applyTrussToProject(newProject(), t);
    const model = resolvePhysicalStructure(p).model!, nodes = new Map(model.nodes.map(n => [n.id, n]));
    const columns = model.pieces.filter(q => q.role === "column");
    expect(columns.map(c => c.id).sort()).toEqual(["P4-D", "P5-D", "P6-D"]);
    for (const c of columns) { expect(nodes.get(c.start)!.z).toBe(0); expect(nodes.get(c.end)!.z).toBe(t.supportZMm); }
    const d = p.workspace.spatialPreparation!, faces = d.supportInterfaces!;
    expect(d.supports).toHaveLength(12);
    expect(faces.filter(f => f.kind === "new-steel-column").map(f => nodes.get(f.nodeId)!.z)).toEqual([0, 0, 0]);
    expect(faces.filter(f => f.kind === "existing-masonry")).toHaveLength(9);
    const dofsAt = (line: number, side: "A" | "B") => {
      const ys = [...new Set(model.nodes.map(n => n.y))].sort((a, b) => a - b);
      const f = faces.find(x => x.side === side && nodes.get(x.nodeId)!.y === ys[line])!;
      return d.supports.find(s => s.nodeId === f.nodeId)!.dofs;
    };
    // Linhas 1–3 (muro dos dois lados): direita desliza no vão; esquerda presa.
    for (const line of [0, 1, 2]) { expect(dofsAt(line, "B")[0]).toBe("free"); expect(dofsAt(line, "A")[0]).toBe("fixed"); }
    // Linhas 4–6: muro à esquerda preso, pilar engastado à direita.
    for (const line of [3, 4, 5]) { expect(dofsAt(line, "A")).toEqual(["fixed", "fixed", "fixed", "fixed", "free", "free"]); expect(dofsAt(line, "B")).toEqual(Array(6).fill("fixed")); }
    expect(p.technicalNotes).toContain("Apoios mistos");
  });

  it("orçamento: pilares, chapa de base e chapa de muro separados; massa bate com o pacote", () => {
    const t = { ...muroAcabaNoMeio(), anchor: { ...tomTrussDefaults().anchor, boltsPerSupport: 2, platePriceCents: 3000, boltPriceCents: 1500 } };
    const s = trussSummary(t);
    expect(s.columnCount).toBe(3);
    expect(s.basePlates).toBe(3);
    expect(s.wallPlates).toBe(9);
    expect(s.bolts).toBe(24);
    expect(s.kg.column).toBeCloseTo(3 * t.supportZMm / 1000 * t.column.kgPerM, 6);
    expect(s.lines.find(l => l.item.startsWith("Pilares"))!.qty).toContain("3 pilares");
    expect(s.lines.find(l => l.item.startsWith("Chapa de base"))!.qty).toBe("3 un (pilares)");
    expect(s.lines.find(l => l.item.startsWith("Chapa de ancoragem"))!.qty).toBe("9 un (muros)");
    expect(s.lines.find(l => l.item.startsWith("Chapa de base"))!.cents).toBe(9000);
    const p = applyTrussToProject(newProject(), t);
    expect(packageTakeoff(p).totals.massKg).toBeCloseTo(s.kg.total, 1);
  });

  it("3D: muro só no trecho que existe; chapas só nas pontas em muro", () => {
    const site = createTrussSiteScene(muroAcabaNoMeio());
    expect(site.root.userData).toMatchObject({ wallCount: 2, anchorCount: 9 });
    const right = site.root.children.find(c => c.name.startsWith("Muro direito"))!;
    expect(right.name).toContain("tesouras 1–3");
    site.dispose();
    // Obra de pilares com muro existente só à esquerda (cobertura encostada numa parede).
    const cols: TrussEditor = { ...tomTrussDefaults(), support: "columns" };
    const leaning = { ...cols, lineSupports: withEndSupports(cols, (_, side) => side === "left" ? "wall" : "column") };
    const scene = createTrussSiteScene(leaning);
    expect(scene.root.userData.wallCount).toBe(1);
    expect(columnCount(leaning)).toBe(leaning.trusses);
    scene.dispose();
  });

  it("muro sem conferência no local bloqueia; com conferência registrada libera os apoios", () => {
    const t = muroAcabaNoMeio(), p = applyTrussToProject(newProject(), t), model = resolvePhysicalStructure(p).model;
    const pending = reviewSupportInterfaces(p, p.workspace.spatialPreparation!, model).filter(i => i.code === "EXISTING_SUPPORT_PENDING");
    expect(pending).toHaveLength(9);
    const ok = applyTrussToProject(newProject(), { ...t, supportModel: { ...t.supportModel, wallSiteReview: "Tom, 20/11/2026 — cinta grauteada" } });
    expect(reviewSupportInterfaces(ok, ok.workspace.spatialPreparation!, resolvePhysicalStructure(ok).model)).toEqual([]);
    expect(ok.workspace.spatialPreparation!.supportInterfaces!.filter(f => f.kind === "existing-masonry").every(f => f.reviewStatus === "site-reviewed")).toBe(true);
  });
});

describe("cálculo real (PyNite) da obra mista, sem nenhuma declaração manual", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("aplica, calcula todas as combinações NBR 8681 e fecha o equilíbrio; ponta deslizante sem empuxo", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1");
    vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000");
    const t = muroAcabaNoMeio();
    const p = applyTrussToProject(newProject(), { ...t, supportModel: { ...t.supportModel, wallSiteReview: "Tom, 20/11/2026 — cinta grauteada" } });
    const d = p.workspace.spatialPreparation!;
    // Única pendência do editor: vento na cobertura (exige extrato da NBR 6123 do responsável).
    expect(p.technicalNotes).toContain("TRUSS_WIND_PENDING");
    expect(p.technicalNotes).not.toContain("TRUSS_ANALYSIS_NOT_PREPARED");
    expect(mixedPreparationReview(p, d, true).issues).toEqual([]);
    const prepared = await adaptLoadedMixedProject(p);
    const executed = await runLocalMixed(JSON.stringify(prepared.request));
    if (executed.status !== "completed" || executed.result.schema_version !== "jpn.mixed3d-result/2") throw Error(`análise não executou: ${JSON.stringify(executed).slice(0, 400)}`);
    const combos = Object.entries(executed.result.combinations);
    expect(combos.length).toBe(3);   // ELU só permanentes, ELU com SC principal, ELS rara
    for (const [, c] of combos) expect(c.equilibrium.relative_residual).toBeLessThan(1e-8);
    // Conferência à mão da combinação característica (G + SC): soma das reações verticais =
    // peso do aço (massa do pacote) + telha na superfície + sobrecarga em planta, área coberta com beiral.
    const rare = d.combinations.find(c => c.factors.PP === 1 && c.factors.TELHA === 1 && c.factors.SC === 1)!;
    const reaction = d.supports.reduce((sum, s) => sum + executed.result.combinations[rare.id].nodes[s.nodeId].reaction_force_n[2], 0) / 1000;
    const steelKn = packageTakeoff(p).totals.massKg! * 9.80665 / 1000;
    const planM2 = (t.spanMm + 2 * t.sheet.beyondTipMm - 2 * (t.gutter.supportMm + t.gutter.widthMm + t.gutter.clearanceMm)) * t.lengthMm / 1e6;
    const surface = Math.hypot(1, (t.highHeightMm - t.tipHeightMm) / ((t.spanMm / 2) - (t.gutter.supportMm + t.gutter.widthMm + t.gutter.clearanceMm)));
    const expected = steelKn + CLADDING_ITEMS[t.sheet.cladding].knM2 * surface * planM2 + roofVariableLoad(fallPercent(t)).qKnM2 * planM2;
    expect(reaction).toBeCloseTo(expected, 2);
    for (const s of d.supports.filter(x => x.dofs[0] === "free")) for (const [, c] of combos) expect(Math.abs(c.nodes[s.nodeId].reaction_force_n[0])).toBeLessThan(1e-6);
    const audits = assessSupportReactions(d.supportInterfaces!, executed.result);
    expect(new Set(audits.map(a => a.kind))).toEqual(new Set(["existing-masonry", "new-steel-column"]));
    expect(audits.every(a => a.normativeApproval === false)).toBe(true);
    expect(endSupportOf(t, 3, "right")).toBe("column");
  }, 120000);

  it("obra grande que não cabe no motor ainda gera a lista de materiais (cálculo vira pendência)", () => {
    const t: TrussEditor = { ...tomTrussDefaults(), roofKind: "two-slopes", spanMm: 12000, lengthMm: 20000, trusses: 5, panelMm: 250, purlinLines: 6, purlinStepMm: 600 };
    const p = applyTrussToProject(newProject(), t);
    expect(p.technicalNotes).toContain("TRUSS_ANALYSIS_NOT_PREPARED");
    expect(packageTakeoff(p).totals.massKg).toBeCloseTo(trussSummary(t).kg.total, 1);
  });
});
