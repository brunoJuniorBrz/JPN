import { describe, expect, it } from "vitest";
import { createQuickProject } from "@/domain/quick-project";
import { generateStructure } from "@/domain/calculations/structure";
import { dimensionLabels, presentationDimensions } from "./presentation-capture";
import { presentationEnvelope, roofElevation, roofPlaneCorners, initialPresentationOptions } from "./presentation-scene";

describe("client presentation layer is derived, not structural input", () => {
  it("builds exactly one planar water for mono with unchanged model lengths", () => {
    const p = createQuickProject({ typology: "mono", widthM: 8, lengthM: 12, heightM: 3, slopePercent: 10 });
    const structure = generateStructure(p).model!, json = JSON.stringify(structure);
    const e = presentationEnvelope(p.roof, p.planning)!;
    const planes = roofPlaneCorners(e);
    expect(planes).toHaveLength(1);
    expect(roofElevation(e,0,0)).toBeCloseTo(3.8);
    expect(roofElevation(e,8,0)).toBeCloseTo(3);
    expect(planes[0][0].x).toBe(0);
    expect(planes[0][2].x).toBe(8);
    expect(planes[0][0].y).toBeCloseTo(3.835);
    expect(JSON.stringify(structure)).toBe(json);
    expect(initialPresentationOptions.showCar).toBe(true);
  });
  it("constructs two planar waters with common ridge and accurate dimensions", () => {
    const p = createQuickProject({typology:"gable",widthM:10,lengthM:20,heightM:4,slopePercent:10});
    const e = presentationEnvelope(p.roof,p.planning)!, planes=roofPlaneCorners(e);
    expect(planes).toHaveLength(2);
    expect(e.highHeightM).toBeCloseTo(4.5);
    expect(planes[0][1].x).toBeCloseTo(5);
    expect(planes[1][0].x).toBeCloseTo(5);
    expect(planes[0][1].y).toBeCloseTo(planes[1][0].y,8);
    expect(planes[0][1].z).toBeCloseTo(planes[1][0].z,8);
    expect(dimensionLabels(presentationDimensions(e))).toEqual([
      "Vão 10 m", "Comprimento 20 m", "Altura baixa 4 m", "Altura máxima 4,5 m",
    ]);
  });
  it("keeps projection consistent when roof falls along length and overhangs", () => {
    const p=createQuickProject({typology:"mono",widthM:8,lengthM:15,heightM:3,slopePercent:20});
    p.roof.fall="length-negative";p.planning!.overhangStartM=1.2;p.planning!.overhangEndM=.7;
    const e=presentationEnvelope(p.roof,p.planning)!;
    expect(e.acrossWidth).toBe(false);
    const corners=roofPlaneCorners(e)[0];
    expect(corners[0].x).toBeCloseTo(-1.2);
    expect(corners[2].x).toBeCloseTo(8.7);
    expect(corners[0].z).toBeCloseTo(0);
    expect(corners[1].z).toBeCloseTo(-15);
    expect(corners[0].y).toBeCloseTo(3.035);
    expect(corners[1].y).toBeCloseTo(6.035);
  });
});
