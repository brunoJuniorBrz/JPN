import { describe, expect, it } from "vitest";
import { declaredBasis, legacyAxisAmbiguity, legacyOffsetDeg, LocalAxesError, pyniteZeroRollBasis, referenceBasis, refuseAmbiguousLegacyAxes, verifyLocalAxes, wrapDegrees, type Basis, type V3 } from "./local-axes";

const O: V3 = [0, 0, 3];
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const orthonormalRightHanded = (r: Basis) => {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(dot(r[i], r[j])).toBeCloseTo(i === j ? 1 : 0, 12);
  expect(dot(r[0], cross(r[1], r[2]))).toBeCloseTo(1, 12);
};
const directions: V3[] = [[6, 0, 0], [-6, 0, 0], [0, 6, 0], [0, -6, 0], [0, 0, 4], [0, 0, -4], [6, 0, .6], [0, 6, .6], [0, -6, .6], [5.2, 3, .6], [-4.2, 4.2, -.6], [1, 2, 3], [0, 6, 6e-5]];
const end = (d: V3): V3 => [O[0] + d[0], O[1] + d[1], O[2] + d[2]];

describe("jpn-z-up/1 reference", () => {
  it("is orthonormal, right-handed, with horizontal y and upward z for every non-vertical member", () => {
    for (const d of directions) {
      const r = referenceBasis(O, end(d)); orthonormalRightHanded(r);
      if (Math.hypot(d[0], d[1]) > 0) { expect(Math.abs(r[1][2])).toBeLessThan(1e-15); expect(r[2][2]).toBeGreaterThan(0); }
    }
    const exact = (d: V3, rows: number[][]) => referenceBasis(O, end(d)).forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - rows[i][j])).toBe(0)));
    exact([6, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    exact([0, 0, 4], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]);
    exact([0, 0, -4], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]);
  });
  it("keeps the physical section when the ends of a non-vertical member are swapped", () => {
    for (const d of directions.filter(d => Math.hypot(d[0], d[1]) > 0)) {
      const forward = referenceBasis(O, end(d)), backward = referenceBasis(end(d), O);
      backward[2].forEach((v, i) => expect(v).toBeCloseTo(forward[2][i], 12));
      backward[1].forEach((v, i) => expect(v).toBeCloseTo(-forward[1][i], 12));
    }
  });
  it("rolls y and z by the right-hand rule about x", () => {
    const r = declaredBasis(O, end([6, 0, 0]), 90);
    r[1].forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 12)); r[2].forEach((v, i) => expect(v).toBeCloseTo([0, -1, 0][i], 12));
    for (const d of directions) for (const roll of [0, 17, -45, 90, 180]) orthonormalRightHanded(declaredBasis(O, end(d), roll));
  });
  it("refuses a member within one degree of vertical that is not exactly vertical", () => {
    expect(() => referenceBasis(O, end([.01, 0, 4]))).toThrow(/AXIS_REFERENCE_NEAR_VERTICAL/);
    expect(() => referenceBasis(O, O)).toThrow(/INVALID_GEOMETRY/);
    expect(() => referenceBasis(O, end([.1, 0, 4]))).not.toThrow();
  });
});

describe("legacy /1 and /2 ambiguity", () => {
  const model = (d: V3, iy = 8e-6, iz = 1e-6) => ({
    nodes: [{ id: "A", x_m: O[0], y_m: O[1], z_m: O[2] }, { id: "B", x_m: end(d)[0], y_m: end(d)[1], z_m: end(d)[2] }],
    members: [{ id: "M", start: "A", end: "B", kind: "frame" as const, section: "S", rotation_deg: 0 }], sections: [{ id: "S", iy_m4: iy, iz_m4: iz }] });
  it("the library's zero-roll basis is orthonormal and right-handed in every branch", () => { for (const d of directions) orthonormalRightHanded(pyniteZeroRollBasis(O, end(d))); });
  it("accepts orientations whose physical section does not depend on the global direction", () => {
    for (const d of [[6, 0, 0], [-6, 0, 0], [0, 6, 0], [0, -6, 0], [0, 0, 4], [0, 0, -4], [6, 0, .6], [-6, 0, -.6], [5.2, 3, 0], [-4.2, 4.2, 0]] as V3[]) {
      const offset = legacyOffsetDeg(O, end(d));
      expect(Math.min(Math.abs(offset), Math.abs(Math.abs(offset) - 180))).toBeLessThan(1e-9);
      expect(legacyAxisAmbiguity(model(d))).toEqual([]);
    }
  });
  it("flags every member whose strong axis the Y-up branches would turn", () => {
    // Rafter spanning in Y, skewed purlin, and a 0.06 mm level error on a Y beam.
    for (const d of [[0, 6, .6], [0, -6, .6], [5.2, 3, .6], [-4.2, 4.2, -.6], [0, 6, 6e-5]] as V3[]) {
      expect(legacyAxisAmbiguity(model(d))).toEqual(["M"]);
      expect(() => refuseAmbiguousLegacyAxes(model(d))).toThrow(LocalAxesError);
    }
    expect(Math.abs(legacyOffsetDeg(O, end([0, 6, .6])))).toBeCloseTo(90, 9);
    expect(legacyAxisAmbiguity(model([.01, 0, 4]))).toEqual(["M"]);
  });
  it("never flags equal principal inertias or axial bars", () => {
    expect(legacyAxisAmbiguity(model([0, 6, .6], 4e-6, 4e-6))).toEqual([]);
    const axial = model([0, 6, .6]); expect(legacyAxisAmbiguity({ ...axial, members: [{ id: "X", start: "A", end: "B", kind: "axial" as const }] })).toEqual([]);
  });
});

describe("verification of the axes reported by the solver", () => {
  const d: V3 = [5.2, 3, .6], roll = 17;
  const request = { local_axes: "jpn-z-up/1", nodes: [{ id: "A", x_m: O[0], y_m: O[1], z_m: O[2] }, { id: "B", x_m: end(d)[0], y_m: end(d)[1], z_m: end(d)[2] }],
    members: [{ id: "M", start: "A", end: "B", kind: "frame" as const, section: "S", rotation_deg: roll }], sections: [{ id: "S", iy_m4: 8e-6, iz_m4: 1e-6 }] };
  const offset = legacyOffsetDeg(O, end(d));
  const honest = () => ({ convention: "jpn-z-up/1", members: { M: { declared_rotation_deg: roll, reference_offset_deg: offset, solver_rotation_deg: wrapDegrees(roll + offset), global_to_local: declaredBasis(O, end(d), roll).map(r => [...r]) } } });
  it("accepts exactly the declared basis", () => expect(() => verifyLocalAxes(request, honest())).not.toThrow());
  it("rejects a swapped, rotated, missing, extra or relabelled basis", () => {
    const swapped = honest(); swapped.members.M.global_to_local = [swapped.members.M.global_to_local[0], swapped.members.M.global_to_local[2], swapped.members.M.global_to_local[1].map(v => -v)];
    const legacy = honest(); legacy.members.M.global_to_local = pyniteZeroRollBasis(O, end(d)).map(r => [...r]);
    const roll0 = honest(); roll0.members.M.declared_rotation_deg = 0;
    const sent = honest(); sent.members.M.solver_rotation_deg += 1;
    const extra = honest() as ReturnType<typeof honest> & { members: Record<string, unknown> }; extra.members.Z = extra.members.M;
    for (const bad of [swapped, legacy, roll0, sent, extra, { ...honest(), members: {} }, { ...honest(), convention: "pynite-y-up" }])
      expect(() => verifyLocalAxes(request, bad as ReturnType<typeof honest>)).toThrow(/AXIS_REALISATION_FAILED/);
    expect(() => verifyLocalAxes({ ...request, local_axes: "other" }, honest())).toThrow(/AXIS_REALISATION_FAILED/);
  });
});
