/**
 * Linha de trabalho do Tom (respostas de 21/11/2026):
 * barra inteira de 6 m cortada na oficina; U 4" R$ 185; telha inteira por fileira;
 * sobra reaproveitada na mesma obra; terça emendada sobre a tesoura;
 * terça a 1,50 m, no máximo 1,80 m (2,00 m "aguenta, mas fica barulhenta").
 */
import { describe, expect, it } from "vitest";
import { newProject } from "@/domain/models";
import {
  MAX_PURLIN_STEP_MM, MIN_CHORD_PIECE_MM, applyTrussToProject, blankTruss, fitPurlins, purlinPositions,
  tomTrussDefaults, trussIssues, trussLengthMm, trussPieces, trussSummary, withEndSupports,
} from "./truss-editor";
import { createCadDrawing } from "@/lib/exports/cad";

const chords = (t: ReturnType<typeof blankTruss>) =>
  trussPieces(t).filter(p => p.kind === "BI" || p.kind === "BS").map(p => Math.round(p.lengthMm));

describe("linha de trabalho do Tom", () => {
  it("obra nova nasce no padrão do Tom: calha 40, caída 10 %, terça 1,50 m, preços dele", () => {
    const t = blankTruss();
    expect([t.gutter.supportMm, t.gutter.widthMm, t.gutter.clearanceMm]).toEqual([150, 400, 200]);
    expect(Math.round((t.highHeightMm - t.tipHeightMm) / trussLengthMm(t) * 100)).toBe(10);
    expect(t.purlinStepMm).toBe(1500);
    const gaps = purlinPositions(t).map(p => p.sMm).sort((a, b) => a - b).map((s, i, a) => i ? s - a[i - 1] : 0).slice(1);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(MAX_PURLIN_STEP_MM);
    expect([t.stockMm, t.chord.barPriceCents, t.sheet.piecesPerSlope]).toEqual([6000, 18500, 1]);
    expect(t.consumablesCents).toBeNull();
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
  });

  it("terça acima de 1,80 m avisa; 1,50 m não", () => {
    const t = tomTrussDefaults();
    expect(trussIssues(t).some(i => /1,80 m/.test(i.message))).toBe(false);
    const wide = { ...t, ...fitPurlins(t, trussLengthMm(t), 2000) };
    expect(trussIssues(wide).some(i => i.level === "aviso" && /barulhenta/.test(i.message))).toBe(true);
  });

  it("emenda do banzo não deixa toco: volta para o montante e não aumenta barras", () => {
    // Banzo de 6,00 m numa barra de 6 m: antes 5980 + 20 mm.
    const t = { ...blankTruss(), support: "columns" as const, spanMm: 6000 };
    const pieces = chords(t);
    expect(Math.min(...pieces)).toBeGreaterThanOrEqual(MIN_CHORD_PIECE_MM);
    expect(pieces.slice(0, 2)).toEqual([5500, 500]);
    expect(trussSummary(t).buy.chord).toBe(7);
  });

  it("obra antiga/exemplo do Tom: mesma emenda e mesma lista", () => {
    const t = tomTrussDefaults();
    expect(chords(t)).toEqual([5980, 1270, 5980, 1306]);
    expect(trussSummary(t).buy).toEqual({ chord: 8, web: 9, purlin: 12, column: 0 });
  });

  it("pranchas: terças cotadas no eixo delas, extensão sem o muro e cotas com nome", () => {
    const base = { ...blankTruss(), support: "columns" as const };
    const t = { ...base, lineSupports: withEndSupports(base, (_l, side) => side === "left" ? "column" : "wall") };
    const p = applyTrussToProject(newProject(), t);
    const { dxf } = createCadDrawing(p, new Date("2026-11-21T10:00:00Z"), { format: "A3" });
    expect(dxf).toContain("PILAR 3000");
    expect(dxf).toMatch(/BEIRAL \d+/);
    // Corte: extensão = cobertura (6000 + 300 de beiral), sem somar meia espessura do muro.
    expect(dxf).toContain("\n6300\n");
    expect(dxf).not.toContain("\n6375\n");
    // Elevação lateral mostra o muro esquemático onde as tesouras apoiam.
    expect((dxf.match(/MURO ALTO \(ESQUEMA\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
