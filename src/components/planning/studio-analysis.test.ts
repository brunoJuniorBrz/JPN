import { describe, expect, it } from "vitest";
import { pieceExtremes, type StudioAnalysis } from "./studio-analysis";

const base = (members: Record<string, unknown>): StudioAnalysis => ({
  state: "current", ready: true, health: "", job: null, error: "", combinations: ["ELU-1"], combo: "ELU-1",
  result: { combinations: { "ELU-1": { members, nodes: {} } } } as unknown as StudioAnalysis["result"],
  mapping: [{ id: "P1:0", originalId: "P1", start: "A", end: "B" }, { id: "P1:1", originalId: "P1", start: "B", end: "C" }, { id: "T1:0", originalId: "T1", start: "C", end: "D" }],
  resistance: null, layerKind: "none", layer: null, scaleInput: "",
});

describe("pieceExtremes (inspetor F2)", () => {
  it("junta os segmentos da peça e pega N com sinal e |V|, |M| máximos em kN", () => {
    const analysis = base({ "P1:0": { kind: "frame" }, "P1:1": { kind: "frame" } });
    const stations: Record<string, { n_n: number; vy_n: number; vz_n: number; my_nm: number; mz_nm: number }[]> = {
      "P1:0": [{ n_n: -1200, vy_n: 300, vz_n: 400, my_nm: 0, mz_nm: 1500 }],
      "P1:1": [{ n_n: -2500, vy_n: 0, vz_n: 100, my_nm: 3000, mz_nm: 4000 }],
    };
    const out = pieceExtremes(analysis, "P1", id => stations[id]);
    expect(out).toEqual({ nKn: -2.5, vKn: 0.5, mKnM: 5, segments: ["P1:0", "P1:1"] });
  });

  it("peça só axial não inventa cortante nem momento", () => {
    const analysis = base({ "T1:0": { kind: "axial", axial_n: 4200 } });
    expect(pieceExtremes(analysis, "T1", () => null)).toEqual({ nKn: 4.2, vKn: null, mKnM: null, segments: ["T1:0"] });
  });

  it("sem combinação ativa ou peça fora do modelo analisado não retorna valores", () => {
    expect(pieceExtremes({ ...base({}), combo: "ELS-9" }, "P1", () => null)).toBeNull();
    expect(pieceExtremes(base({}), "X9", () => null)).toBeNull();
  });
});
