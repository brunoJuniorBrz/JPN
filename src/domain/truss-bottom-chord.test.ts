import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { addTrussType, applyTrussToProject, blankTruss, bottomChordOf, tomTrussDefaults, trussEditorSchema, trussOfLine, trussPiecesComplete, trussSummary, type TrussEditor } from "./truss-editor";
import { packageTakeoff } from "@/lib/exports/package-source";
import { packageCutting } from "@/lib/exports/complete-package";

// Banzo inferior com perfil próprio (motivação: TCC-05 UFCG 2021, Pratt com
// banzo superior U 100x50x2,66 e inferior U 90x25x2,50; validation/tcc-2026-11).
const kgU = (h: number, b: number, t: number) => Number((t * (h + 2 * b - 2 * t) * 1e-6 * 7850).toFixed(3)); // linha média
const U90 = { designation: "U 90x25x2.50", kgPerM: kgU(90, 25, 2.5), barPriceCents: null, extraBars: 0 };
const U100 = { designation: "U 100x50x2.66", kgPerM: kgU(100, 50, 2.66), barPriceCents: null, extraBars: 0 };
const refs = JSON.parse(readFileSync("validation/tcc-2026-11/published-references.json", "utf8"));
const ufcg = refs.cases.find((c: { id: string }) => c.id === "TCC-05-UFCG-PEREIRA-2021");

function ufcgPratt(support: "columns" | "walls"): TrussEditor {
  const t = blankTruss();
  return { ...t, roofKind: "two-slopes", support, spanMm: 10000, lengthMm: 27000, trusses: 10, supportZMm: 6000,
    tipHeightMm: 600, highHeightMm: 1100, panelMm: 1000, countFrom: "low", diagonal: "to-low", purlinLines: 2, purlinStepMm: 5000,
    walls: support === "columns" ? { ...t.walls, lowMm: 0, highMm: 0 } : { ...t.walls, lowMm: 6000, highMm: 6000 },
    chord: U100, bottomChord: U90, web: U90 };
}
const lengthM = (t: TrussEditor, kind: string) => trussPiecesComplete(t).filter(p => p.kind === kind).reduce((s, p) => s + p.lengthMm, 0) / 1000;

describe("banzo inferior com perfil próprio", () => {
  it("projetos salvos sem o campo continuam iguais (inferior = superior)", () => {
    const old: Partial<TrussEditor> = { ...tomTrussDefaults() };
    delete old.bottomChord;
    const parsed = trussEditorSchema.parse(old);
    expect(parsed.bottomChord).toBeNull();
    expect(bottomChordOf(parsed)).toEqual(parsed.chord);
    const before = trussSummary(tomTrussDefaults());
    expect(trussSummary(parsed).kg).toEqual(before.kg);
    expect(trussSummary(parsed).bars).toEqual(before.bars);
    // Tipos salvos antes do campo também continuam válidos.
    const withType = addTrussType(parsed);
    const oldType: Partial<TrussEditor["types"][number]> = { ...withType.types[0] };
    delete oldType.bottomChord;
    expect(trussEditorSchema.parse({ ...withType, types: [oldType] }).types[0].bottomChord).toBeNull();
  });

  it("Pratt do TCC UFCG: aço por banzo correto e dentro de 3% do peso publicado", () => {
    const t = ufcgPratt("columns"), one = trussSummary({ ...t, trusses: 1 });
    const expectedChord = lengthM(t, "BS") * U100.kgPerM + lengthM(t, "BI") * U90.kgPerM;
    expect(one.kg.chord).toBeCloseTo(expectedChord, 6);
    const truss = one.kg.chord + one.kg.web, published = ufcg.publishedTrussMassKg_U.Pratt["10"];
    expect(Math.abs(truss / published - 1)).toBeLessThan(.03);
    // Sem o campo novo, qualquer perfil único para os dois banzos erra mais de 3%.
    for (const single of [U100, U90]) {
      const s = trussSummary({ ...t, trusses: 1, chord: single, bottomChord: null });
      expect(Math.abs((s.kg.chord + s.kg.web) / published - 1)).toBeGreaterThan(.03);
    }
  });

  for (const support of ["columns", "walls"] as const) it(`aplica no projeto com apoio em ${support === "columns" ? "pilares" : "muros"}: seções, rótulos, compra e corte`, () => {
    const t = ufcgPratt(support), p = applyTrussToProject(newProject(), t), s = trussSummary(t);
    const pieces = p.workspace.physicalStructure!.pieces, catalog = p.workspace.spatialPreparation!.physicalCatalog!;
    const sectionOf = (id: string) => catalog.sections.find(x => x.id === catalog.assignments.find(a => a.pieceId === id)!.sectionId)!;
    const bottom = pieces.filter(q => q.role === "bottomChord"), top = pieces.filter(q => q.role === "topChord");
    expect(bottom.length).toBeGreaterThan(0);
    for (const q of bottom) { expect(sectionOf(q.id).designation).toBe(U90.designation); expect(q.label).toContain(U90.designation); }
    for (const q of top) { expect(sectionOf(q.id).designation).toBe(U100.designation); expect(q.label).toContain(U100.designation); }
    // Uma seção de banzo por perfil (superior e inferior distintos).
    expect(catalog.sections.filter(x => x.id.startsWith("CHORD")).map(x => x.designation).sort()).toEqual([U100.designation, U90.designation].sort());
    expect(packageTakeoff(p).totals.massKg).toBeCloseTo(s.kg.total, 1);
    const report = packageTakeoff(p), stock = Object.fromEntries(report.groups.map(g => [g.key, 12000])); // pilar de 6 m não cabe em barra de 6 m com aparas
    const cut = packageCutting(p, { stockByGroup: stock });
    expect(cut.groups.map(g => g.profile.split(" · ")[0])).toEqual(expect.arrayContaining([U100.designation, U90.designation]));
    const chordRows = s.lines.filter(l => l.item.startsWith("Banzo superior") || l.item.startsWith("Banzo inferior"));
    expect(chordRows).toHaveLength(2);
    expect(chordRows.some(l => l.item.includes(U100.designation) && l.item.startsWith("Banzo superior"))).toBe(true);
    expect(chordRows.some(l => l.item.includes(U90.designation) && l.item.startsWith("Banzo inferior"))).toBe(true);
  });

  it("cada tipo de tesoura pode ter o seu banzo inferior", () => {
    const base = ufcgPratt("walls"), withType = addTrussType({ ...base, bottomChord: null });
    const t: TrussEditor = { ...withType, bottomChord: null, types: [{ ...withType.types[0], bottomChord: U90 }], lineTypes: ["T1", "T2", "T1", "T1", "T1", "T1", "T1", "T1", "T1", "T1"] };
    expect(bottomChordOf(trussOfLine(t, 0)).designation).toBe(U100.designation);
    expect(bottomChordOf(trussOfLine(t, 1)).designation).toBe(U90.designation);
    const all = trussSummary(t), oneLine = (i: number) => trussSummary({ ...trussOfLine(t, i), trusses: 1, types: [], lineTypes: [] }).kg.chord;
    expect(all.kg.chord).toBeCloseTo(9 * oneLine(0) + oneLine(1), 6);
  });
});
