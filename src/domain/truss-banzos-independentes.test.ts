import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import {
  addTrussType, applyTrussToProject, tomTrussDefaults,
  trussEditorSchema, trussOfLine, trussPiecesComplete, trussSummary,
} from "./truss-editor";
import { packageTakeoff } from "@/lib/exports/package-source";
import { cadModel } from "@/lib/exports/cad-model";
import { packageCutting } from "@/lib/exports/complete-package";

const inferior = { designation: "U 90x25 de ensaio", kgPerM: 2.68, barPriceCents: 12300, extraBars: 1 };

describe("banzos independentes, sem liberação estrutural", () => {
  it("projeto legado e tipo legado herdam o banzo superior sem migração destrutiva", () => {
    const old = addTrussType(tomTrussDefaults());
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.bottomChord;
    delete raw.types[0].bottomChord;
    const restored = trussEditorSchema.parse(raw);
    expect(restored.bottomChord).toBeNull();
    expect(restored.types[0].bottomChord).toBeNull();
    expect(trussSummary(restored).bars.chord).toBe(trussSummary(old).bars.chord);
    expect(trussSummary(restored).kg.total).toBeCloseTo(trussSummary(old).kg.total, 8);
  });

  for (const support of ["walls", "columns"] as const) {
    it(`usa perfis distintos em ${support}, com massa, orçamento, 3D, CAD e plano de corte rastreáveis`, () => {
      const base = tomTrussDefaults();
      const t = { ...base, support, stockMm: 12000, supportZMm: 6000, bottomChord: { ...inferior } };
      const p = applyTrussToProject(newProject(), t);
      const summary = trussSummary(t);
      const parts = trussPiecesComplete(t);
      const upper = parts.filter(x => x.kind === "BS").reduce((n, x) => n + x.lengthMm, 0);
      const lower = parts.filter(x => x.kind === "BI").reduce((n, x) => n + x.lengthMm, 0);
      const chordKg = t.trusses * (upper * t.chord.kgPerM + lower * inferior.kgPerM) / 1000;
      expect(summary.kg.chord).toBeCloseTo(chordKg, 8);
      expect(summary.buy.chord).toBe(summary.chordBreakdown.upperBars + summary.chordBreakdown.lowerBars + inferior.extraBars);
      expect(summary.lines.some(l => l.item.includes("Banzo inferior") && l.item.includes(inferior.designation))).toBe(true);
      expect(summary.lines.some(l => l.item.includes("Banzo superior") && l.item.includes(t.chord.designation))).toBe(true);
      const physical = p.workspace.physicalStructure!;
      const catalog = p.workspace.spatialPreparation!.physicalCatalog!;
      const sections = new Map(catalog.sections.map(x => [x.id, x.designation]));
      const assigned = new Map(catalog.assignments.map(x => [x.pieceId, x.sectionId]));
      const upperPieces = physical.pieces.filter(x => x.role === "topChord");
      const lowerPieces = physical.pieces.filter(x => x.role === "bottomChord");
      expect(upperPieces.length).toBeGreaterThan(0);
      expect(lowerPieces.length).toBeGreaterThan(0);
      expect(upperPieces.every(x => x.label.includes(t.chord.designation) && sections.get(assigned.get(x.id)! ) === t.chord.designation)).toBe(true);
      expect(lowerPieces.every(x => x.label.includes(inferior.designation) && sections.get(assigned.get(x.id)! ) === inferior.designation)).toBe(true);
      const cad = cadModel(p);
      expect(upperPieces.every(x => cad.profile(x.id) === t.chord.designation)).toBe(true);
      expect(lowerPieces.every(x => cad.profile(x.id) === inferior.designation)).toBe(true);
      const takeoff = packageTakeoff(p);
      const stock = Object.fromEntries(takeoff.groups.map(g => [g.key, 12000]));
      const cutting = packageCutting(p, { stockByGroup: stock });
      expect(cutting.groups.some(g => g.profile.startsWith(inferior.designation) && g.bars.length > 0)).toBe(true);
      expect(cutting.groups.some(g => g.profile.startsWith(t.chord.designation) && g.bars.length > 0)).toBe(true);
      expect(p.workspace.cutting.useFabrication).toBe(false);
    });
  }

  it("cada tipo guarda seu banzo inferior, sem afetar linhas de outros tipos", () => {
    const base = addTrussType(tomTrussDefaults());
    const t = {
      ...base,
      types: base.types.map(ty => ({ ...ty, bottomChord: { ...inferior } })),
      lineTypes: ["T1", "T2", "T1"],
    };
    expect(trussOfLine(t, 0).bottomChord).toBeNull();
    expect(trussOfLine(t, 1).bottomChord?.designation).toBe(inferior.designation);
    expect(trussOfLine(t, 2).bottomChord).toBeNull();
    const p = applyTrussToProject(newProject(), t);
    const byLine = (line: number) => p.workspace.physicalStructure!.pieces
      .filter(x => x.id.startsWith(`T${line}-`) && x.role === "bottomChord");
    expect(byLine(1).every(x => x.label.includes(t.chord.designation))).toBe(true);
    expect(byLine(2).every(x => x.label.includes(inferior.designation))).toBe(true);
    expect(byLine(3).every(x => x.label.includes(t.chord.designation))).toBe(true);
  });
});
