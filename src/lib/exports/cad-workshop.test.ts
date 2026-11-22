import { describe, expect, it } from "vitest";
import { newProject } from "@/domain/models";
import { applyTrussToProject, blankTruss, tomTrussDefaults } from "@/domain/truss-editor";
import { createCadDrawing } from "./cad";
import { cm, pieceName, workshopTypes } from "./cad-workshop";

const textOf = (sheet: { items: unknown[] }) => JSON.stringify(sheet.items);

describe("Folha da Oficina", () => {
  it("é a primeira folha e fala em centímetros, com nomes por extenso", () => {
    const { sheets } = createCadDrawing(applyTrussToProject(newProject(), tomTrussDefaults()), new Date("2026-11-22T10:00:00Z"), { format: "A3" });
    expect(sheets[0].name).toBe("OFICINA");
    const t = textOf(sheets[0]);
    for (const s of ["fazer 3 iguais", "Montante 16: 80 cm · 3 pç", "Diagonal 1: 27 cm · 3 pç", "Banzo de cima: 598 + 130,5 cm · 3 vezes",
      "emenda a 598 cm da ponta", "12 pedaços de 500 cm", "Banzos U 100x40x2.65: 8 barras", "Necessária conferência por engenheiro"])
      expect(t).toContain(s);
    // Sem jargão de software na folha da oficina.
    for (const s of ["Y=", "X=", "seção=", "BS1", "M16", "cotas em mm"]) expect(t).not.toContain(s);
    // O índice continua listando todas as folhas, a oficina primeiro.
    expect(textOf(sheets.at(-1)!)).toContain("Folha da oficina");
  });

  it("duas águas: peças espelhadas somam, montante do meio conta uma vez por tesoura", () => {
    const t = { ...blankTruss(), roofKind: "two-slopes" as const, spanMm: 12000, lengthMm: 20000, trusses: 5 };
    const [type] = workshopTypes(t);
    const ridge = type.cut.filter(r => r.name.startsWith("Montante")).at(-1)!;
    expect(ridge.qty).toBe(5);
    expect(type.cut.find(r => r.name === "Montante 1")!.qty).toBe(10);
  });

  it("centímetro de obra: meio centímetro e vírgula", () => {
    expect([cm(75), cm(5980), cm(523), cm(527.4)]).toEqual(["7,5", "598", "52,5", "52,5"]);
    expect(pieceName("BS2")).toBe("Banzo de cima (pedaço 2)");
    expect(pieceName("D7")).toBe("Diagonal 7");
  });
});
