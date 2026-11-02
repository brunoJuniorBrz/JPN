import { describe, expect, it } from "vitest";
import { emptyPhysicalGroup, type PhysicalGroup } from "./physical-declaration";
import { elasticMemberReference } from "./resistance-elastic-reference";
import { emptyProfile, type StructurePiece } from "./structure";
import { resistancePreparationSchema } from "./resistance-preparation";

const piece: StructurePiece = {
  id: "T1-BS1", role: "topChord", start: "N1", end: "N2",
  lengthMm: 2000, profile: emptyProfile(), massKg: null,
};
const group = (): PhysicalGroup => ({
  ...emptyPhysicalGroup(),
  steelGrade: "Aço sintético", materialSource: "Ensaio de referência", materialRevision: "R1",
  sectionSource: "Seção analítica sintética", sectionRevision: "R1", rotationDeg: 0,
  eGpa: 200, areaCm2: 10, iyCm4: 100, izCm4: 25,
});
const declaration = () => resistancePreparationSchema.parse({
  pieceId: piece.id, family: "rolled", fyMpa: 250, fuMpa: 400,
  bucklingYM: 2, bucklingZM: 3, lateralRestraintM: 2,
  source: "Dados sintéticos independentes", revision: "R1",
  sectionProperties: { wyCm3: 20, wzCm3: 10 },
  restraintDescription: "Comprimentos efetivos KyLy=2 m, KzLz=3 m explicitamente declarados",
  normativeReference: "",
});

describe("referências analíticas elásticas NÃO normativas", () => {
  it("converte cm²/cm⁴/MPa/GPa e confere escoamento e Euler por fórmulas fechadas", () => {
    const input = declaration(), physical = group();
    const original = JSON.stringify({ piece, input, physical });
    const result = elasticMemberReference(piece, physical, input);
    expect(result.status).toBe("reference-only");
    expect(result.approved).toBe(false);
    const r = result.reference!;
    // Independent SI arithmetic: A=.001 m², Iy=1e-6 m⁴, Iz=2.5e-7 m⁴.
    expect(r.grossYieldReferenceKn).toBeCloseTo(250, 10);
    expect(r.eulerYKn).toBeCloseTo(Math.PI ** 2 * 200_000_000_000 * 0.000001 / 4 / 1000, 10);
    expect(r.eulerZKn).toBeCloseTo(Math.PI ** 2 * 200_000_000_000 * 0.00000025 / 9 / 1000, 10);
    expect(r.radiusYMm).toBeCloseTo(Math.sqrt(.000001 / .001) * 1000, 10);
    expect(r.radiusZMm).toBeCloseTo(Math.sqrt(.00000025 / .001) * 1000, 10);
    expect(r.slendernessY).toBeCloseTo(2 / Math.sqrt(.000001 / .001), 10);
    expect(r.slendernessZ).toBeCloseTo(3 / Math.sqrt(.00000025 / .001), 10);
    expect(JSON.stringify({ piece, input, physical })).toBe(original);
    expect(result.issues.some(issue => /NÃO RESISTÊNCIAS DE CÁLCULO/.test(issue))).toBe(true);
  });
  it("Euler varia com quadrado do comprimento efetivo e com a inércia, sem alterar fy*A", () => {
    const input = declaration(), physical = group();
    const base = elasticMemberReference(piece, physical, input).reference!;
    input.bucklingYM = 4;
    const twice = elasticMemberReference(piece, physical, input).reference!;
    expect(twice.eulerYKn).toBeCloseTo(base.eulerYKn / 4, 10);
    expect(twice.slendernessY).toBeCloseTo(base.slendernessY * 2, 10);
    expect(twice.grossYieldReferenceKn).toBeCloseTo(base.grossYieldReferenceKn, 10);
    physical.iyCm4 = 400;
    const fourI = elasticMemberReference(piece, physical, input).reference!;
    expect(fourI.eulerYKn).toBeCloseTo(twice.eulerYKn * 4, 10);
  });
  it("bloqueia dados ausentes, inconsistentes ou de peça diferente sem valores falsos", () => {
    const input = declaration(), physical = group();
    const a = elasticMemberReference(piece, physical, null);
    expect(a.status).toBe("pending");
    expect(a.reference).toBeNull();
    input.pieceId = "T2-BS1";
    expect(elasticMemberReference(piece, physical, input).reference).toBeNull();
    input.pieceId = piece.id;
    input.fuMpa = 200;
    expect(elasticMemberReference(piece, physical, input).issues).toContain("Resistência última fu menor que escoamento fy.");
    input.fuMpa = 400;
    physical.iyCm4 = null;
    expect(elasticMemberReference(piece, physical, input).reference).toBeNull();
    physical.iyCm4 = 100;
    physical.sectionRevision = "";
    expect(elasticMemberReference(piece, physical, input).reference).toBeNull();
    physical.sectionRevision = "R1";
    input.bucklingZM = Number.MIN_VALUE;
    expect(elasticMemberReference(piece, physical, input).reference).toBeNull();
  });
  it("perfis formados a frio permanecem não verificados mesmo com referências de Euler", () => {
    const input = declaration();
    input.family = "cold-formed";
    const output = elasticMemberReference(piece, group(), input);
    expect(output.approved).toBe(false);
    expect(output.status).toBe("reference-only");
    expect(output.issues.join(" ")).toMatch(/flambagem local, distorcional/);
  });
});
