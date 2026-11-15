import { expect, it } from "vitest";
import { acceptOverlay, buildResultOverlay, deformedSegments, overlayColors, studioModelFromPhysical, type LayerInput } from "./studio-result-layers";

const H = "a".repeat(64), R = "b".repeat(64);
const frame = (stations: { x_m: number; n_n: number; vy_n: number; vz_n: number; t_nm: number; my_nm: number; mz_nm: number }[]) => ({ kind: "frame", length_m: 4, stations, end_actions_local: [0, 0, 0, 0, 0, 0] });
const input = (): LayerInput => ({
  inputSha256: H, resultSha256: R, combinationId: "ELU1", solver: { name: "PyNiteFEA", version: "3.2.1" },
  mapped: [{ id: "P1#1", originalId: "P1", start: "A", end: "B" }, { id: "P1#2", originalId: "P1", start: "B", end: "C" }, { id: "P2", originalId: "P2", start: "C", end: "D" }],
  nodes: { A: { translation_m: [0, 0, 0], reaction_force_n: [0, 0, 12000] }, B: { translation_m: [0.003, 0, -0.004], reaction_force_n: [0, 0, 0] },
    C: { translation_m: [0, 0.001, -0.002], reaction_force_n: [0, 0, 0] }, D: { translation_m: [0, 0, 0], reaction_force_n: [0, 0, 0] } },
  members: {
    "P1#1": frame([{ x_m: 0, n_n: -5000, vy_n: 100, vz_n: -2000, t_nm: 0, my_nm: 0, mz_nm: 50 }, { x_m: 2, n_n: -5000, vy_n: 100, vz_n: 0, t_nm: 0, my_nm: 8000, mz_nm: 0 }]),
    "P1#2": frame([{ x_m: 0, n_n: -4000, vy_n: 0, vz_n: 3000, t_nm: 0, my_nm: -9000, mz_nm: 0 }]),
    P2: { kind: "axial", axial_n: 7000 },
  } as never,
  utilizationByPiece: { P1: 0.62, P2: 1.4 },
});
const model = { pieces: [{ id: "P1" }, { id: "P2" }] };

it("modelo físico vira modelo do Studio sem inventar perfil, massa ou cobertura (viga = linha de banzo superior)", () => {
  const m = studioModelFromPhysical({ units: "mm", nodes: [{ id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 1000, y: 0, z: 0 }], pieces: [{ id: "V1", start: "A", end: "B", lengthMm: 1000, role: "beam" }] });
  expect(m.pieces[0]).toMatchObject({ id: "V1", role: "topChord", start: "A", end: "B", massKg: null });
  expect(m.pieces[0].profile.section).toBe(""); expect(m.massComplete).toBe(false); expect(m.knownMassKg).toBe(0);
});

it("camadas: maior valor por peça original, em kN/kN·m/mm, vinculadas ao hash e à combinação; nunca aprovação", () => {
  const value = (kind: Parameters<typeof buildResultOverlay>[0]) => Object.fromEntries(buildResultOverlay(kind, input()).pieces.map(p => [p.pieceId, p.value]));
  expect(value("bending-moment")).toEqual({ P1: 9 });   // P2 is axial-only: no invented moment
  expect(value("shear")).toEqual({ P1: 3 });
  expect(value("axial")).toEqual({ P1: -5, P2: 7 });
  expect(value("reaction")).toEqual({ P1: 12 });
  expect(value("displacement").P1).toBeCloseTo(5, 9);                  // |(0.003,0,-0.004)| = 5 mm
  expect(value("verification")).toEqual({ P1: 0.62, P2: 1.4 });
  const o = buildResultOverlay("axial", input());
  expect(o.binding).toMatchObject({ inputSha256: H, resultSha256: R, combinationId: "ELU1" });
  expect(o.computedStructuralApproval).toBe(false); expect(o.fabricationRelease).toBe(false);
  expect(buildResultOverlay("verification", { ...input(), utilizationByPiece: undefined }).pieces).toEqual([]);   // no verification run: nothing painted
});

it("camada recusada: hash de outra revisão, peça inexistente, valor não finito — nada é desenhado", () => {
  const o = buildResultOverlay("shear", input());
  expect(acceptOverlay(o, model, H)).toEqual({ ok: true });
  const stale = acceptOverlay(o, model, "c".repeat(64)); expect(stale.ok).toBe(false);
  if (!stale.ok) expect(stale.issues.map(i => i.code)).toEqual(["OVERLAY_STALE"]);
  const orphan = acceptOverlay(o, { pieces: [{ id: "P2" }] }, H); expect(orphan.ok).toBe(false);
  if (!orphan.ok) expect(orphan.issues.map(i => i.code)).toContain("OVERLAY_ORPHAN_PIECE");
  const bad = buildResultOverlay("shear", input()); bad.pieces[0].value = Number.NaN;
  const nf = acceptOverlay(bad, model, H); expect(nf.ok).toBe(false);
  if (!nf.ok) expect(nf.issues.map(i => i.code)).toContain("OVERLAY_NONFINITE");
});

it("deformada: coordenadas de cena (x, z, -y) em metros; escala 0 reproduz a geometria; nó sem resultado é erro", () => {
  const nodes = [{ id: "A", x_m: 0, y_m: 0, z_m: 0 }, { id: "B", x_m: 4, y_m: 2, z_m: 3 }], members = [{ id: "m", start: "A", end: "B" }];
  const t = { A: [0, 0, 0] as [number, number, number], B: [0.001, 0.002, -0.003] as [number, number, number] };
  expect(deformedSegments({ nodes, members, translations: t, scale: 0 })).toEqual([{ a: [0, 0, -0], b: [4, 3, -2] }]);
  const d = deformedSegments({ nodes, members, translations: t, scale: 100 })[0];
  expect(d.b[0]).toBeCloseTo(4.1, 9); expect(d.b[1]).toBeCloseTo(2.7, 9); expect(d.b[2]).toBeCloseTo(-2.2, 9);
  expect(() => deformedSegments({ nodes, members, translations: { A: t.A }, scale: 1 })).toThrow("DEFORMED_NODE");
  expect(() => deformedSegments({ nodes, members, translations: t, scale: Number.NaN })).toThrow("DEFORMED_SCALE");
});

it("rampa de cores: menor valor azul, maior vermelho; verificação mantém 1,0 como limite", () => {
  const c = overlayColors(buildResultOverlay("axial", input()));
  expect(c.colors.P1).not.toBe(c.colors.P2); expect(c.max).toBe(7); expect(c.min).toBe(5);
  expect(overlayColors(buildResultOverlay("verification", { ...input(), utilizationByPiece: { P1: 0.3 } })).max).toBe(1);   // colour ramp ceiling
  expect(overlayColors(buildResultOverlay("verification", { ...input(), utilizationByPiece: { P1: 0.3 } })).valueMax).toBe(0.3);   // the legend shows the real value
});
