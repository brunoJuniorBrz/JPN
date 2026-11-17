import { describe, expect, it } from "vitest";
import { sheetTakeoff, tomJpnComparison } from "./tom-jpn-comparison";

describe("Tom × JPN — quantitativo próprio vs orçamento do Alan (estimativa, sem aprovação estrutural)", () => {
  it("reconstrói ~99,7 m² líquidos, não o retângulo envolvente de 76,8 m² nem a área bruta", () => {
    const s = sheetTakeoff();
    expect(s.areaM2).toBeCloseTo(99.71, 2);
    expect(s.faces.map(f => f.sheets)).toEqual([9, 6, 6, 5, 2, 2]);
  });
  it("telhas no comprimento inclinado + avanço na calha: mesmo total linear, peças mais longas que as do Alan", () => {
    const s = sheetTakeoff();
    expect(s.linearM).toBeCloseTo(107.65, 2);
    expect(s.faces[0].lengthM).toBeCloseTo(5.52, 2); // Alan pediu 5,38
    expect(s.faces[0].purlinLines).toBe(5);
    expect(s.faces[1].purlinLines).toBe(3);
  });
  it("plano de corte: terças fecham em 20 barras como no Alan; peças de tesoura + avulsas pedem 8 barras", () => {
    const c = tomJpnComparison();
    expect(c.purlins.bars).toBe(20);
    expect(c.trusses.bars).toBe(8);
    expect(c.trusses.netM).toBeGreaterThan(36); // 6 barras do Alan = 36 m
  });
  it("mantém bloqueios e expõe itens que o orçamento do Alan deixou zerados", () => {
    const c = tomJpnComparison();
    expect(c.structuralApproval).toBe(false);
    expect(c.fabricationRelease).toBe(false);
    expect(c.rows.filter(r => r.alanCents === 0 && r.jpnCents > 0).map(r => r.item)).toHaveLength(2);
    expect(c.flashing.meters).toBeCloseTo(67.8, 1);
    expect(c.alanMaterialCents).toBe(803775);
  });
});
