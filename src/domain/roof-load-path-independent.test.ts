import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { structureSignature } from "./calculations/project-basis";
import { distributeRoofActions } from "./roof-load-path";
import { generateStructure } from "./calculations/structure";

/**
 * Independent closed-form reference. Does not call the roof region generator,
 * tributary strip implementation, or the structural solver to calculate
 * expected area, force or moment.
 */
const closeRelative = (actual: number, expected: number, relative = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relative * Math.max(1, Math.abs(expected)));

describe("M21 independent roof load-path analytic sweep", () => {
  const falls = ["width-positive", "width-negative", "length-positive", "length-negative"] as const;
  const projections = ["horizontal", "roof-surface"] as const;
  const directions = [[0, 0, -1], [0.6, 0, -0.8]] as const;

  for (const fall of falls) for (const typology of ["mono", "gable"] as const)
    for (const projection of projections) for (const direction of directions)
      for (const overhang of [false, true]) {
        const name = `${fall} | ${typology} | ${projection} | dir ${direction.join(",")} | overhang ${overhang}`;
        it(name, () => {
          const width = 6.4, length = 9.7, lowHeight = 3.2, slope = 0.125;
          const start = overhang ? 0.45 : 0;
          const end = overhang ? 0.85 : 0;
          const pressure = 0.137;
          const project = createQuickProject({
            typology, widthM: width, lengthM: length, heightM: lowHeight, slopePercent: slope * 100,
          });
          project.roof.fall = fall;
          project.planning!.overhangStartM = start;
          project.planning!.overhangEndM = end;
          project.planning!.purlinSpacingM = 1.5;
          const original = JSON.stringify(project);
          const method = {
            version: 1 as const, method: "parallel-purlin-strips" as const,
            geometrySignature: structureSignature(project),
          };
          const action = {
            caseId: "AUDIT", knM2: pressure, projection, direction: [...direction] as [number,number,number],
            source: "Independent analytical sweep", revision: "1",
            loadPath: "Declared planar sheeting to purlin strips, then solver elements",
          };
          const trace = distributeRoofActions(project, [action], method);
          const result = trace.actions[0];
          const transverse = fall.startsWith("width") ? width : length;
          const longitudinal = fall.startsWith("width") ? length : width;
          const surfaceFactor = projection === "roof-surface" ? Math.hypot(1, slope) : 1;
          const expectedArea = transverse * (longitudinal + start + end) * surfaceFactor;
          const expectedForce = direction.map(d => d * 1000 * pressure * expectedArea);
          const rise = slope * transverse / (typology === "gable" ? 2 : 1);
          const center = [
            fall.startsWith("width") ? width / 2 : (width - start + end) / 2,
            fall.startsWith("width") ? (length - start + end) / 2 : length / 2,
            lowHeight + rise / 2,
          ];
          const expectedMoment = [
            center[1] * expectedForce[2] - center[2] * expectedForce[1],
            center[2] * expectedForce[0] - center[0] * expectedForce[2],
            center[0] * expectedForce[1] - center[1] * expectedForce[0],
          ];

          closeRelative(result.areaM2, expectedArea);
          closeRelative(result.distributedAreaM2, expectedArea);
          result.distributedForceN.forEach((actual, i) => closeRelative(actual, expectedForce[i]));
          result.distributedMomentNm.forEach((actual, i) => closeRelative(actual, expectedMoment[i]));

          // Independently verify loads that are actually forwarded to solver segments.
          const members = new Map(generateStructure(project).model!.pieces.map(piece => [piece.id, piece]));
          const assembled = [0, 0, 0];
          for (const load of result.loads) {
            const member = members.get(load.pieceId)!;
            expect(member).toBeDefined();
            expect(member.role).toBe("purlin");
            const memberLength = member.lengthMm / 1000;
            load.forcePerLengthNM.forEach((q, i) => assembled[i] += q * memberLength);
          }
          assembled.forEach((actual, i) => closeRelative(actual, expectedForce[i]));
          expect(JSON.stringify(project)).toBe(original);
        });
      }
});
