import { describe, expect, it } from "vitest";
import { emptySnapshot, newProject } from "./models";
import { applyTrussToProject, tomTrussDefaults, trussEditorSchema, trussLengthMm, trussPiecesComplete, trussSummary, withFall, type TrussEditor } from "./truss-editor";

const twoSlopes = (bottomChord: TrussEditor["bottomChord"]): TrussEditor => {
  const t = tomTrussDefaults();
  return trussEditorSchema.parse(withFall({ ...t, roofKind: "two-slopes", walls: { ...t.walls, highMm: t.walls.lowMm }, bottomChord, stationsMm: null }, 10));
};

describe("banzo inferior em duas águas", () => {
  it("contínuo: uma linha de beiral a beiral, emendada a cada chordSpliceMm", () => {
    const t = twoSlopes("continuous"), L = trussLengthMm(t);
    const bi = trussPiecesComplete(t).filter(p => p.kind === "BI");
    expect(bi[0].a).toEqual([0, 0]); expect(bi.at(-1)!.b).toEqual([2 * L, 0]);
    expect(bi.every(p => p.lengthMm <= t.chordSpliceMm + 1e-6)).toBe(true);
    expect(bi.reduce((s, p) => s + p.lengthMm, 0)).toBeCloseTo(2 * L, 6);
    expect(bi.length).toBe(Math.ceil(2 * L / t.chordSpliceMm));
  });
  it("dividido: duas metades espelhadas que se encontram na cumeeira", () => {
    const t = twoSlopes("split"), L = trussLengthMm(t);
    const bi = trussPiecesComplete(t).filter(p => p.kind === "BI");
    expect(bi.some(p => p.id.startsWith("E-") && Math.abs(Math.max(p.a[0], p.b[0]) - L) < 1e-6)).toBe(true);
    expect(bi.some(p => p.id.startsWith("D-") && Math.abs(Math.min(p.a[0], p.b[0]) - L) < 1e-6)).toBe(true);
    expect(bi.reduce((s, p) => s + p.lengthMm, 0)).toBeCloseTo(2 * L, 6);
  });
  it("contínuo nunca compra mais barras de banzo que dividido; padrão é contínuo", () => {
    expect(trussEditorSchema.parse({ ...tomTrussDefaults(), bottomChord: undefined }).bottomChord).toBe("continuous");
    expect(trussSummary(twoSlopes("continuous")).buy.chord).toBeLessThanOrEqual(trussSummary(twoSlopes("split")).buy.chord);
  });
  it("uma água: a opção não muda nada (pacote 8×10 do Tom)", () => {
    const a = trussPiecesComplete({ ...tomTrussDefaults(), bottomChord: "continuous" });
    const b = trussPiecesComplete({ ...tomTrussDefaults(), bottomChord: "split" });
    expect(a).toEqual(b);
  });
});

describe("rascunho ao vivo (gerado em memória)", () => {
  const base = newProject(emptySnapshot().settings);
  it("rascunho em memória é idêntico ao aplicado e não altera o projeto original", () => {
    const before = JSON.stringify(base), t = { ...tomTrussDefaults(), highHeightMm: 900 };
    const draft = applyTrussToProject(base, t), applied = applyTrussToProject(base, trussEditorSchema.parse(t));
    expect(JSON.stringify(base)).toBe(before);
    expect(draft.workspace.physicalStructure!.nodes).toEqual(applied.workspace.physicalStructure!.nodes);
    expect(draft.workspace.physicalStructure!.pieces).toEqual(applied.workspace.physicalStructure!.pieces);
    expect(trussSummary(draft.workspace.trussEditor!).kg.total).toBeCloseTo(trussSummary(applied.workspace.trussEditor!).kg.total, 9);
  });
  it("cada atualização do rascunho do exemplo 8×10 leva menos de 50 ms", () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = { ...tomTrussDefaults(), highHeightMm: 800 + i * 5 }, start = performance.now();
      const draft = applyTrussToProject(base, t); trussSummary(draft.workspace.trussEditor!);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(50);
  });
});
