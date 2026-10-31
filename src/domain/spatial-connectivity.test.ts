import { describe, expect, it } from "vitest";
import { discretizeGeometry, inspectConnectivity, type ConnectivityDeclaration } from "./spatial-connectivity";
import { emptyProfile, type StructureModel } from "./structure";
import { adaptSpatialProject } from "./geometric-physical-adapter";
import { spatialAdapterExample } from "./examples/spatial-adapter-example";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { newSpatialPreparation } from "./spatial-preparation";
import { parseBackup, serializeBackup } from "@/infrastructure/persistence/local";
import { emptySnapshot } from "./models";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalSpatialInput } from "./spatial-analysis";

function tee(): StructureModel {
  return { units: "mm", nodes: [{ id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 4000, y: 0, z: 0 }, { id: "C", x: 2000, y: 0, z: 0 }, { id: "D", x: 2000, y: 1000, z: 0 }],
    pieces: [{ id: "BEAM", role: "topChord", start: "A", end: "B", lengthMm: 4000, profile: emptyProfile(), massKg: null },
      { id: "BRANCH", role: "web", start: "C", end: "D", lengthMm: 1000, profile: emptyProfile(), massKg: null }],
    groups: [], frameCount: 0, frameSpacingM: 0, purlinRows: 0, purlinSpacingM: 0, projectedAreaM2: 0, roofAreaM2: 0, totalLengthM: 5, knownMassKg: 0, massComplete: false };
}
const declaration = (m: StructureModel): ConnectivityDeclaration => ({ version: 1, geometrySignature: "test", reviewSource: "Explicit mathematical test: continuous frame at C",
  junctions: inspectConnectivity(m).junctions.map(j => ({ nodeId: j.nodeId, pieceIds: j.pieceIds, decision: "connect" })) });

describe("geometric connectivity without inferred physical joints", () => {
  it.each([NaN, Infinity, -Infinity])("rejects nonfinite original length metadata (%s)", length => {
    const m = tee(), d = declaration(m); m.pieces[0].lengthMm = length;
    expect(() => discretizeGeometry(m, d, "test")).toThrow(/inválid/);
  });
  it("rejects an unsupported geometry unit at the runtime boundary", () => {
    const m = tee(), d = declaration(m); Object.assign(m, { units: "m" });
    expect(() => discretizeGeometry(m, d, "test")).toThrow(/unidade|mm/i);
  });
  it("rejects duplicate/orphan decisions, generated ID collisions and too-short cuts", () => {
    const m = tee(), d = declaration(m);
    expect(() => discretizeGeometry(m, { ...d, junctions: [...d.junctions, d.junctions[0]] }, "test")).toThrow(/duplicadas/);
    expect(() => discretizeGeometry(m, { ...d, junctions: [...d.junctions, { ...d.junctions[0], nodeId: "ORPHAN" }] }, "test")).toThrow(/inexistente/);
    m.pieces[1].id = "BEAM:S1";
    expect(() => discretizeGeometry(m, declaration(m), "test")).toThrow(/colisão/);
    const short = tee(); short.nodes[2].x = .005; short.nodes[3].x = .005;
    expect(() => discretizeGeometry(short, declaration(short), "test")).toThrow(/0,01 mm/);
  });
  it("splits at an original interior node, preserving IDs, orientation and lengths", () => {
    const model = tee(), before = JSON.stringify(model), d = declaration(model), result = discretizeGeometry(model, d, "test");
    expect(result.members.map(m => [m.id, m.originalId, m.start, m.end, m.t0, m.t1])).toEqual([
      ["BEAM:S1", "BEAM", "A", "C", 0, .5], ["BEAM:S2", "BEAM", "C", "B", .5, 1], ["BRANCH", "BRANCH", "C", "D", 0, 1],
    ]);
    expect(result.members.filter(m => m.originalId === "BEAM").reduce((s, m) => s + m.lengthMm, 0)).toBe(4000);
    expect(JSON.stringify(model)).toBe(before);
    model.pieces[0].start = "B"; model.pieces[0].end = "A";
    expect(discretizeGeometry(model, declaration(model), "test").members.slice(0, 2).map(m => [m.start, m.end])).toEqual([["B", "C"], ["C", "A"]]);
  });
  it("blocks missing, stale, independent or mismatched declarations", () => {
    const m = tee(), d = declaration(m);
    expect(() => discretizeGeometry(m, { ...d, junctions: [] }, "test")).toThrow(/C/);
    expect(() => discretizeGeometry(m, d, "changed")).toThrow(/outra geometria/);
    expect(() => discretizeGeometry(m, { ...d, junctions: [{ ...d.junctions[0], decision: "separate" }] }, "test")).toThrow(/independente/);
    expect(() => discretizeGeometry(m, { ...d, junctions: [{ ...d.junctions[0], pieceIds: ["BEAM", "wrong"] }] }, "test")).toThrow(/C/);
  });
  it("rejects overlapping members, coincident IDs and crossing without an original node", () => {
    const m = tee(); m.pieces[1] = { ...m.pieces[1], start: "A", end: "C", lengthMm: 2000 };
    expect(() => inspectConnectivity(m)).toThrow(/sobrepostas/);
    const n = tee(); n.nodes[3] = { ...n.nodes[3], x: 2000, y: -1000 }; n.nodes[2].y = 1000; n.pieces[1].lengthMm = 2000;
    expect(() => inspectConnectivity(n)).toThrow(/sem nó original/);
    const c = tee(); c.nodes.push({ ...c.nodes[0], id: "OTHER" });
    expect(() => inspectConnectivity(c)).toThrow(/coincidentes/);
  });
  it("detects near-parallel crossings and rejects orphan nodes without merging", () => {
    const m = tee();
    m.nodes[2] = { id: "C", x: 0, y: .0002, z: 0 }; m.nodes[3] = { id: "D", x: 4000, y: -.0002, z: 0 }; m.pieces[1].lengthMm = Math.hypot(4000, .0004);
    expect(() => inspectConnectivity(m)).toThrow(/sem nó original/);
    const n = tee(); n.nodes.push({ id: "ORPHAN", x: 1000, y: 1000, z: 1000 });
    expect(() => inspectConnectivity(n)).toThrow(/órfãos/);
  });
  it("rejects conflicting duplicated supports, even if one declaration is all free", async () => {
    const p = spatialAdapterExample(), d = p.workspace.spatialPreparation!;
    d.supports.push({ nodeId: d.supports[0].nodeId, dofs: ["free", "free", "free", "free", "free", "free"] });
    await expect(adaptSpatialProject(p)).rejects.toThrow(/repetidas/);
  });
  it("blocks incomplete 10 × 20 m quick roof and compiles a separate fully declared frame fixture", async () => {
    const incomplete = createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4 });
    incomplete.workspace.spatialPreparation = newSpatialPreparation(incomplete);
    await expect(adaptSpatialProject(incomplete)).rejects.toThrow(/PROPERTIES/);
    const project = spatialAdapterExample(), before = JSON.stringify(project), result = await adaptSpatialProject(project), visual = generateStructure(project).model!;
    expect(visual.pieces).toHaveLength(207); expect(visual.nodes.length).toBeGreaterThan(100);
    expect(result.request.members.length).toBeGreaterThan(200);
    expect(result.request.members.length).toBeGreaterThan(visual.pieces.length);
    expect(result.request.nodes.map(n => n.id)).toEqual(visual.nodes.map(n => n.id));
    expect(result.request.materials[0].e_pa).toBe(200e9); expect(result.request.sections[0].area_m2).toBe(.01);
    expect(result.request.nodal_loads[0].fz_n).toBe(-1000);
    expect(result.request.members.every(m => [...m.release_start, ...m.release_end].every(v => !v))).toBe(true);
    expect(new Set(result.mapping.members.map(m => m.originalId)).size).toBe(207);
    expect(JSON.stringify(project)).toBe(before);
    expect(parseBackup(serializeBackup({ ...emptySnapshot(), projects: [project] })).data.projects[0].workspace.spatialPreparation).toEqual(project.workspace.spatialPreparation);
    // Reproducible bridge artifact consumed by independent Python tests. Never
    // generated as a side effect of the production UI or attached to user data.
    if (process.env.JPN_EXPORT_ADAPTER_FIXTURES === "1") {
      writeFileSync("engine/examples/spatial-adapted-roof.json", JSON.stringify(result.request, null, 2) + "\n");
      writeFileSync("examples/spatial-adapter-project.json", JSON.stringify(project, null, 2) + "\n");
      writeFileSync("examples/spatial-adapter-mapping.json", JSON.stringify(result.mapping, null, 2) + "\n");
      const m = tee(), mapping = discretizeGeometry(m, declaration(m), "test");
      const request = { ...result.request,
        nodes: mapping.nodes.map(n => ({ id: n.id, x_m: n.x / 1000, y_m: n.y / 1000, z_m: n.z / 1000 })),
        members: mapping.members.map(s => ({ ...result.request.members[0], id: s.id, start: s.start, end: s.end })),
        supports: [{ node: "A", restrained: [true, true, true, true, true, true] }],
        nodal_loads: [{ ...result.request.nodal_loads[0], node: "C", fx_n: 0, fy_n: 0, fz_n: -1000 }],
      };
      writeFileSync("engine/examples/spatial-adapted-tee.json", JSON.stringify(request, null, 2) + "\n");
    } else {
      expect(canonicalSpatialInput(JSON.parse(readFileSync("engine/examples/spatial-adapted-roof.json", "utf8")))).toBe(canonicalSpatialInput(result.request));
      expect(JSON.parse(readFileSync("examples/spatial-adapter-mapping.json", "utf8"))).toEqual(result.mapping);
    }
    const changed = structuredClone(project); changed.workspace.spatialPreparation!.loads[0].fzKn = -2;
    expect((await adaptSpatialProject(changed)).input_sha256).not.toBe(result.input_sha256);
    changed.planning!.frameSpacingM = 3;
    await expect(adaptSpatialProject(changed)).rejects.toThrow(/STALE_GEOMETRY/);
  });
  it("does not turn axial declarations into rigid frames or two spherical pins into fake torsion restraint", async () => {
    const p = spatialAdapterExample(); p.workspace.spatialPreparation!.groups.web.connection = "axial";
    await expect(adaptSpatialProject(p)).rejects.toThrow(/AXIAL/);
    p.workspace.spatialPreparation!.groups.web.connection = "pinned";
    await expect(adaptSpatialProject(p)).rejects.toThrow(/torção/);
  });
  it("preserves only declared original end releases when subdividing a continuous frame", async () => {
    const p = spatialAdapterExample(), geometry = generateStructure(p).model!;
    const d = p.workspace.spatialPreparation!, cut = inspectConnectivity(geometry).junctions.find(j => j.interiorPieceIds.length)!;
    const id = cut.interiorPieceIds[0]; d.memberConnections = [{ pieceId: id, start: "pinned", end: "rigid" }];
    const r = await adaptSpatialProject(p), segments = r.mapping.members.filter(m => m.originalId === id);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) {
      const member = r.request.members.find(m => m.id === s.id)!;
      expect(member.release_start).toEqual([false, false, false, s.originalStart, s.originalStart, s.originalStart]);
      expect(member.release_end).toEqual([false, false, false, false, false, false]);
    }
  });
});
