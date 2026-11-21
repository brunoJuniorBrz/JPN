import { describe, expect, it } from "vitest";
import { m34abProject } from "./test-support/m34ab-fixtures";
import { declaredStructureSchema } from "./declared-structure";
import { physicalFacadesSchema } from "./physical-facades";
import {
  declaredFacadeTractionSignature,
  distributeDeclaredFacadeTractions,
} from "./declared-facade-traction";

/**
 * M41-P3: independent static oracle for an asymmetric 3-column facade.
 * Synthetic externally supplied pressures are NOT NBR 6123 coefficients.
 * Wall 6 m wide x 4 m high; columns at u=0,2,6 m.
 * p=+600 Pa over [0,2] m and p=-300 Pa over [2,6] m.
 * Net force is zero, but the couple is Mz=-14,400 N.m.
 */
function facadeFixture() {
  const p = m34abProject();
  p.workspace.physicalStructure = declaredStructureSchema.parse({
    schema_version: "jpn.declared-structure/1",
    source: "declared",
    units: "mm",
    revision: "M41 independent asymmetric facade oracle",
    provenance: "Synthetic geometry; no assumed material capacity or restraints",
    nodes: [0, 2000, 6000].flatMap((y, i) => [
      { id: `B${i}`, x: 8000, y, z: 0 },
      { id: `T${i}`, x: 8000, y, z: 4000 },
    ]),
    pieces: [
      { id: "C0", role: "column", start: "B0", end: "T0" },
      { id: "C2", role: "column", start: "B1", end: "T1" },
      { id: "C6", role: "column", start: "B2", end: "T2" },
    ],
  });
  const source = "M41 synthetic field survey";
  const revision = "asymmetric-pressure-20261121";
  p.workspace.spatialPreparation!.physicalFacades = physicalFacadesSchema.parse({
    schema_version: "jpn.physical-facades/1",
    units: "mm",
    source,
    revision,
    facades: [{
      id: "EAST", kind: "wall", outward: "+X", enclosure: "cladded",
      source, revision, enclosureSource: "Explicitly clad synthetic wall",
      supportPieceIds: ["C0", "C2", "C6"],
      outer: [[8000,0,0],[8000,6000,0],[8000,6000,4000],[8000,0,4000],[8000,0,0]],
      openings: [],
    }],
  });
  p.workspace.spatialPreparation!.cases = [
    { id: "WIND-POS", source: "Synthetic external pressure case" },
    { id: "WIND-NEG", source: "Synthetic reversed pressure case" },
  ];
  return p;
}

describe("M41-P3: asymmetric pressure couple and reversed cases", () => {
  it("conserves the global couple independently of zero net force and reverses exactly", () => {
    const project = facadeFixture();
    const zone = (sign: number) => ({
      facadeId: "EAST",
      netPressurePa: 0,
      source: "Synthetic pressures only",
      revision: "asymmetric-pressure-20261121",
      calculationBasis: "Piecewise externally declared pressures, not an ABNT design",
      profile: [
        { startM: 0, endM: 2, netPressurePa: sign * 600 },
        { startM: 2, endM: 6, netPressurePa: sign * -300 },
      ],
    });
    const result = distributeDeclaredFacadeTractions(project, {
      schema_version: "jpn.declared-facade-traction/1",
      normativeValidation: "pending-engineer-review",
      physicalSignature: declaredFacadeTractionSignature(project),
      cases: [
        { id: "WIND-POS", incidenceDeg: 0, reference: "External positive/negative pressure test", zones: [zone(1)] },
        { id: "WIND-NEG", incidenceDeg: 180, reference: "External reversed pressure test", zones: [zone(-1)] },
      ],
    });
    const [a, b] = result.cases;
    for (const c of [a, b]) {
      c.forceN.forEach(v => expect(v).toBeCloseTo(0, 8));
      expect(c.momentNm[0]).toBeCloseTo(0, 8);
      expect(c.momentNm[1]).toBeCloseTo(0, 8);
      expect(c.zones[0].areaM2).toBeCloseTo(24, 8);
      c.zones[0].distributedForceN.forEach((v, i) =>
        expect(v).toBeCloseTo(c.zones[0].expectedForceN[i], 8));
      c.zones[0].distributedMomentNm.forEach((v, i) =>
        expect(v).toBeCloseTo(c.zones[0].expectedMomentNm[i], 8));
    }
    expect(a.momentNm[2]).toBeCloseTo(-14400, 8);
    expect(b.momentNm[2]).toBeCloseTo(14400, 8);
    expect(a.loads.map(l => l.pieceId)).toEqual(["C0", "C2", "C6"]);
    a.loads.forEach((l, i) => expect(l.forcePerLengthNM[0]).toBeCloseTo([-600, 0, 600][i], 8));
    b.loads.forEach((l, i) =>
      expect(l.forcePerLengthNM[0]).toBeCloseTo(-a.loads[i].forcePerLengthNM[0], 8));
    expect(result.windNormativeReady).toBe(false);
    expect(result.computedStructuralApproval).toBe(false);
    expect(result.fabricationRelease).toBe(false);
    expect(result.releaseGate).toBe("NOT_READY_BLOCKED");
  });
});
