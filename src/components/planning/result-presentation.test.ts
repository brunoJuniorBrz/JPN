import { describe, expect, it } from "vitest";
import { planningExample } from "@/domain/planning-example";
import { generateStructure } from "@/domain/calculations/structure";
import { roleLabels } from "@/domain/structure";
import { groupMaterialsForDisplay, summarizePending, locatePending, locatePendingGroup } from "./result-presentation";

describe("result presentation is derived, never engineering data", () => {
  it("groups equal profiles, preserves every length and ID, and does not mutate the model", () => {
    const model = generateStructure(planningExample()).model!;
    const original = JSON.stringify(model);
    const grouped = groupMaterialsForDisplay(model.groups);
    const originalRows = model.groups.flatMap(group => group.pieceIds);
    const groupedRows = grouped.flatMap(group => group.rows.flatMap(row => row.pieceIds));
    expect(grouped.length).toBeLessThanOrEqual(model.groups.length);
    expect(groupedRows.sort()).toEqual(originalRows.sort());
    expect(grouped.reduce((sum, group) => sum + group.quantity, 0)).toBe(model.pieces.length);
    expect(grouped.reduce((sum, group) => sum + group.totalLengthM, 0)).toBeCloseTo(model.totalLengthM, 7);
    expect(grouped.every(group => group.rows.every(row => row.lengthMm > 0))).toBe(true);
    expect(JSON.stringify(model)).toBe(original);
  });

  it("does not merge commercially or physically different steel definitions", () => {
    const source = generateStructure(planningExample()).model!.groups[0];
    const a = {...source, key: "a", lengthMm: 2000, totalLengthM: 4, pieceIds: ["A","B"], massKg: null};
    const b = {...source, key: "b", lengthMm: 3000, totalLengthM: 3, pieceIds: ["C"], massKg: null};
    const c = {...source, key: "c", profile: {...source.profile, steelGrade: "ANOTHER-GRADE"}, lengthMm: 4000, totalLengthM: 4, pieceIds: ["D"], massKg: 15};
    const grouped = groupMaterialsForDisplay([a,b,c]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].quantity).toBe(3);
    expect(grouped[0].totalLengthM).toBe(7);
    expect(grouped[0].massKg).toBeNull();
    expect(grouped[0].rows.map(row => row.lengthMm)).toEqual([2000,3000]);
    expect(grouped[1].quantity).toBe(1);
    expect(grouped[1].massKg).toBe(15);
  });

  it("condenses fifteen repetitive notices without losing their original content", () => {
    const notices = Object.values(roleLabels).flatMap(role => [
      `${role}: classe do aço não informada.`,
      `${role}: massa por metro desconhecida.`,
      `${role}: comprimento comercial não informado.`,
    ]);
    const grouped = summarizePending(notices);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].text).toContain("5 grupos");
    expect(grouped[0].count).toBe(15);
    expect(grouped[0].sources).toHaveLength(15);
    expect(new Set(grouped[0].sources)).toEqual(new Set(notices));
  });

  it("routes known profile issues to the exact group without altering notices", () => {
    expect(locatePending("Terças: massa por metro desconhecida.")).toEqual({ step: 2, role: "purlin" });
    expect(locatePending("Informe a largura da cobertura.")).toEqual({ step: 1 });
    expect(locatePending("Informe o espaçamento máximo entre tesouras.")).toEqual({ step: 2 });
    expect(locatePending("Verificar estabilidade global.")).toBeNull();
  });

  it("routes grouped multi-role notices to structure without choosing an arbitrary profile", () => {
    const notices = Object.values(roleLabels).flatMap(role => [
      `${role}: classe do aço não informada.`,
      `${role}: massa por metro desconhecida.`,
      `${role}: comprimento comercial não informado.`,
    ]);
    const grouped = summarizePending(notices);
    expect(locatePendingGroup(grouped[0])).toEqual({ step: 2 });
    expect(locatePendingGroup({ text: "mixed", count: 2, sources: [
      "Terças: massa por metro desconhecida.", "Informe a largura da cobertura.",
    ] })).toBeNull();
    expect(locatePendingGroup({ text: "unknown", count: 1, sources: ["Falha normativa não suportada"] })).toBeNull();
  });

  it("leaves unrelated structural warnings visible and distinct", () => {
    const x = ["Verificar estabilidade global", "Ligação de pilar não revisada",
      "Pilares: massa por metro desconhecida."];
    const grouped = summarizePending(x);
    expect(grouped.flatMap(group => group.sources).sort()).toEqual([...x].sort());
    expect(grouped.some(group => group.text === "Verificar estabilidade global")).toBe(true);
  });
});
