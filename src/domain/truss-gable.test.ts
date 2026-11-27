import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import {
  applyTrussToProject, fitPurlins, gableCount, trussLengthMm, steelTrussLines, tomTrussDefaults, trussEditorSchema, trussEnds, trussIssues, trussSummary,
  wallPlateCount, type TrussEditor,
} from "./truss-editor";
import { createTrussSiteScene } from "@/components/planning/truss-site-scene";
import { workshopTypes } from "@/lib/exports/cad-workshop";
import { createCadDrawing } from "@/lib/exports/cad";
import { createCompletePackage } from "@/lib/exports/complete-package";
import { packageTakeoff } from "@/lib/exports/package-source";

// Obra de outubro (planta de 20/10): as pontas apoiam direto na parede de oitão, sem tesoura.
const oitao = (t: TrussEditor, start: boolean, end: boolean): TrussEditor => ({ ...t, gableEnds: { start, end } });
const qty = (t: TrussEditor, prefix: string) => trussSummary(t).lines.find(l => l.item.startsWith(prefix));

describe("ponta apoiada na parede (oitão)", () => {
  it("obra salva antes (sem o campo) gera a mesma lista de materiais", () => {
    const old: Partial<TrussEditor> = tomTrussDefaults();
    delete old.gableEnds;
    const parsed = trussEditorSchema.parse(old);
    expect(parsed.gableEnds).toEqual({ start: false, end: false });
    expect(trussSummary(parsed).lines).toEqual(trussSummary(tomTrussDefaults()).lines);
    expect(trussSummary(parsed).lines.some(l => l.item.includes("oitão"))).toBe(false);
  });

  it("oitão nas duas pontas tira duas tesouras e mantém as terças", () => {
    const base: TrussEditor = { ...tomTrussDefaults(), trusses: 4, lengthMm: 15000 };
    const one = oitao(base, true, false);
    const two = oitao(base, true, true);
    expect(gableCount(one)).toBe(1);
    expect(steelTrussLines(two)).toEqual([1, 2]);
    // Terças: mesmos vãos e mesma quantidade de barras (vencem de parede a parede).
    expect(qty(two, "Terças")).toEqual(qty(base, "Terças"));
    // Tesouras: metade do aço de banzo/alma (4 → 2 tesouras).
    const s0 = trussSummary(base), s2 = trussSummary(two);
    expect(s2.steelTrusses).toBe(2);
    expect(s2.kg.chord).toBeCloseTo(s0.kg.chord / 2, 6);
    expect(s2.kg.web).toBeCloseTo(s0.kg.web / 2, 6);
    expect(s2.buy.chord).toBeLessThan(s0.buy.chord);
    // Sem tesoura não há ponta: menos chapas e chumbadores de tesoura.
    expect(trussEnds(two)).toHaveLength(4);
    expect(wallPlateCount(two)).toBe(2);
    expect(s2.wallPlates).toBe(2);
    // Cada terça é chumbada em cada oitão.
    expect(s2.gableAnchors).toBe(s2.purlins.length * 2);
    expect(qty(two, "Chumbador da terça no oitão")?.qty).toContain(`${s2.purlins.length * 2} un`);
    expect(s2.knownCents).toBeLessThan(s0.knownCents);
  });

  it("aplica no projeto: sem peças de tesoura no oitão, terças apoiadas na parede", () => {
    const t = oitao({ ...tomTrussDefaults(), trusses: 4, lengthMm: 15000 }, true, true);
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
    const p = applyTrussToProject(newProject(), t);
    const pieces = p.workspace.physicalStructure!.pieces;
    expect(pieces.some(x => x.id.startsWith("T1-"))).toBe(false);
    expect(pieces.some(x => x.id.startsWith("T4-"))).toBe(false);
    expect(pieces.some(x => x.id.startsWith("T2-"))).toBe(true);
    // Terças continuam de ponta a ponta.
    const purlins = pieces.filter(x => x.role === "purlin");
    expect(purlins).toHaveLength(trussSummary(t).purlins.length * 3);
    const prep = p.workspace.spatialPreparation!;
    const gableFaces = (prep.supportInterfaces ?? []).filter(f => f.side === "internal");
    expect(gableFaces).toHaveLength(trussSummary(t).purlins.length * 2);
    expect(gableFaces.every(f => f.kind === "existing-masonry")).toBe(true);
    for (const f of gableFaces) expect(prep.supports.some(s => s.nodeId === f.nodeId)).toBe(true);
    expect(p.technicalNotes).toContain("oitão");
  });

  it("Folha da Oficina manda fazer só as tesouras de aço", () => {
    const t = oitao({ ...tomTrussDefaults(), trusses: 5, lengthMm: 20000 }, true, true);
    expect(workshopTypes(t).reduce((s, x) => s + x.trusses, 0)).toBe(3);
  });

  it("3D mostra a parede de oitão e não mostra chapa de tesoura nela", () => {
    const base: TrussEditor = { ...tomTrussDefaults(), trusses: 4, lengthMm: 15000 };
    const site = createTrussSiteScene(oitao(base, true, true));
    const plain = createTrussSiteScene(base);
    expect(site.root.userData.gableCount).toBe(2);
    expect(plain.root.userData.gableCount).toBe(0);
    expect(site.root.userData.anchorCount).toBe(plain.root.userData.anchorCount - 2);
    site.dispose(); plain.dispose();
  });

  it("vale para duas águas e para qualquer tamanho de obra (barracão 12 x 20)", () => {
    const g: TrussEditor = { ...tomTrussDefaults(), roofKind: "two-slopes", spanMm: 12000, lengthMm: 20000, trusses: 5, highHeightMm: 700 };
    const t = oitao({ ...g, ...fitPurlins(g, trussLengthMm(g), 1500) }, true, true);
    const s = trussSummary(t);
    expect(s.steelTrusses).toBe(3);
    expect(trussEnds(t).filter(e => e.kind === "wall")).toHaveLength(6);
    const p = applyTrussToProject(newProject(), t);
    expect(p.workspace.physicalStructure!.pieces.filter(x => x.group === "TESOURA").every(x => /^T[234]-/.test(x.id))).toBe(true);
  });

  it("pranchas e pacote saem com o oitão desenhado e as travas mantidas", async () => {
    const p = applyTrussToProject(newProject(), oitao({ ...tomTrussDefaults(), trusses: 4, lengthMm: 15000 }, true, true));
    const cad = createCadDrawing(p, new Date("2026-11-27T10:00:00Z"), { format: "A3" });
    expect(cad.dxf).toContain("OITAO (PAREDE) - TERCAS CHUMBADAS");
    expect(cad.dxf).toContain("PRELIMINAR - NAO UTILIZAR PARA EXECUCAO OU CORTE");
    const report = packageTakeoff(p), stockByGroup = Object.fromEntries(report.groups.map(g => [g.key, 6000]));
    const pkg = await createCompletePackage(p, { issuedAt: new Date("2026-11-27T10:00:00Z"), stockByGroup });
    expect(pkg.manifest.fabricationRelease).toBe(false);
    expect(pkg.manifest.releaseGate).toBe("NOT_READY_BLOCKED");
  });
});
