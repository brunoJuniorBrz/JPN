import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { createSpatialHandoff, spatialCoordination } from "./spatial-coordination";
import { newSpatialPreparation } from "./spatial-preparation";
import { structureSignature } from "./calculations/project-basis";

describe("ponte de coordenação sem inferir cálculo estrutural", () => {
  const project = () => createQuickProject({ typology:"gable", widthM:10, lengthM:20, heightM:4 });
  it("organiza todas as pendências e deixa conectividade bloqueada para o motor futuro", () => {
    const p=project(), state=spatialCoordination(p);
    expect(state.steps.map(s=>s.id)).toEqual(["geometry","properties","supports","connections","loads","topology"]);
    expect(state.recorded).toBe(1); // visual geometry exists; no physical inputs supplied
    expect(state.review.geometry?.pieces.length).toBeGreaterThan(200);
    expect(state.review.contacts.length).toBeGreaterThan(0);
    expect(state.steps.find(s=>s.id==="topology")?.status).toBe("blocked");
    expect(state.steps.find(s=>s.id==="properties")?.status).toBe("pending");
    expect(state.analysisReady).toBe(false);
  });
  it("exports editable physical declarations and source geometry without making a solver request", () => {
    const p=project(), before=structuredClone(p);
    const payload=createSpatialHandoff(p);
    expect(payload.schema_version).toBe("jpn.spatial-handoff/1");
    expect(payload.technical_status).toBe("preliminary_not_analyzed");
    expect(payload.analysis_ready).toBe(false);
    expect(payload.approved_for_fabrication).toBe(false);
    expect(payload.geometry?.units).toBe("mm");
    expect(payload.geometry?.members.length).toBeGreaterThan(200);
    expect(payload.geometry?.nodes.length).toBeGreaterThan(100);
    expect(payload.geometry?.members[0]).toHaveProperty("axis_length_mm");
    expect(payload.geometry?.members[0]).not.toHaveProperty("massKg");
    expect(payload.geometry?.members[0]).not.toHaveProperty("price");
    expect(payload.preparation.groups.column.eGpa).toBeNull();
    expect(payload.preparation.supports).toEqual([]);
    expect(payload.review.detected_contacts.length).toBeGreaterThan(0);
    expect(p).toEqual(before);
  });
  it("detects stale drafts after geometry changes without dropping user data", () => {
    const p=project();p.workspace.spatialPreparation=newSpatialPreparation(p);
    p.workspace.spatialPreparation.groups.column.materialSource="Ficha técnica informada";
    const old=structureSignature(p);
    p.planning!.frameSpacingM=2.5;
    const payload=createSpatialHandoff(p);
    expect(payload.project.geometry_stale).toBe(true);
    expect(payload.project.geometry_signature).not.toBe(old);
    expect(payload.project.preparation_signature).toBe(old);
    expect(payload.review.issues.some(i=>i.code==="STALE_GEOMETRY")).toBe(true);
    expect(payload.preparation.groups.column.materialSource).toBe("Ficha técnica informada");
    expect(payload.analysis_ready).toBe(false);
  });
});
