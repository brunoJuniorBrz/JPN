import { describe, expect, it } from "vitest";
import { newProject } from "@/domain/models";
import { declaredStructureSchema } from "@/domain/declared-structure";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { physicalRoofFacesSchema } from "@/domain/physical-roof-faces";
import { reviewRoofSlope } from "./package-dimension-review";

function projectWithFaces(
  candidates: { id: string; x0: number; x1: number; slope: number; support?: boolean }[],
) {
  const project = newProject();
  project.workspace.physicalStructure = declaredStructureSchema.parse({
    schema_version: "jpn.declared-structure/1",
    source: "declared",
    units: "mm",
    provenance: "Regressão de associação de faces em planta",
    revision: "REVIEW-1",
    nodes: [
      { id: "A", x: 100, y: 500, z: 3100 },
      { id: "B", x: 900, y: 500, z: 3900 },
    ],
    pieces: [{ id: "BS", role: "topChord", start: "A", end: "B" }],
  });
  const draft = newSpatialPreparation(project);
  draft.physicalRoofFaces = physicalRoofFacesSchema.parse({
    schema_version: "jpn.physical-roof-faces/1",
    units: "mm",
    source: "Regressão CAD",
    revision: "REVIEW-1",
    faces: candidates.map(f => {
      const z = (x: number) => 3000 + (x - f.x0) * f.slope;
      return {
        id: f.id,
        source: "Geometria de teste; não é apoio estrutural presumido",
        revision: "REVIEW-1",
        supportPieceIds: f.support ? ["BS"] : [],
        outer: [
          [f.x0, 0, z(f.x0)],
          [f.x1, 0, z(f.x1)],
          [f.x1, 1000, z(f.x1)],
          [f.x0, 1000, z(f.x0)],
          [f.x0, 0, z(f.x0)],
        ],
        holes: [],
      };
    }),
  });
  project.workspace.spatialPreparation = draft;
  return project;
}

describe("associação de banzos a faces para revisão de inclinação", () => {
  it("não relaciona banzo interior a uma face vizinha, independentemente da ordem", () => {
    const project = projectWithFaces([
      { id: "VIZINHA", x0: 1000, x1: 2000, slope: -1 },
      { id: "CORRETA", x0: 0, x1: 1000, slope: 1 },
    ]);
    expect(reviewRoofSlope(project)).toMatchObject([
      { pieceId: "BS", faceId: "CORRETA", status: "CONFERIDO" },
    ]);
  });

  it("prioriza a face declarada, mesmo quando uma sobreposição vem primeiro", () => {
    const project = projectWithFaces([
      { id: "SOBREPOSTA", x0: 0, x1: 1000, slope: 0 },
      { id: "DECLARADA", x0: 0, x1: 1000, slope: 1, support: true },
    ]);
    expect(reviewRoofSlope(project)).toMatchObject([
      { pieceId: "BS", faceId: "DECLARADA", status: "CONFERIDO" },
    ]);
  });

  it("não inventa relação quando duas faces coincidem em planta sem declaração", () => {
    const project = projectWithFaces([
      { id: "FACE-A", x0: 0, x1: 1000, slope: 0 },
      { id: "FACE-B", x0: 0, x1: 1000, slope: 1 },
    ]);
    expect(reviewRoofSlope(project)).toEqual([]);
  });
});
