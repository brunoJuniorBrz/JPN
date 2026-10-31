import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { mixedReferenceProject } from "./examples/mixed-project";
import { adaptMixedProject } from "./mixed-adapter";
import { newSpatialPreparation } from "./spatial-preparation";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { mixedStations } from "./mixed-analysis";
import { parseBackup, serializeBackup } from "@/infrastructure/persistence/local";
import { emptySnapshot } from "./models";

it("adapta geometria JPN com tipos inequívocos, preserva IDs/unidades e não exige flexão em axiais", async () => {
  const p = mixedReferenceProject(), before = JSON.stringify(p), result = await adaptMixedProject(p);
  expect(result.request.nodes).toHaveLength(132); expect(result.mapping.members).toHaveLength(243);
  expect(generateStructure(p).model!.pieces).toHaveLength(207);
  expect(result.request.members.some(m => m.kind === "axial")).toBe(true);
  expect(result.request.members.some(m => m.kind === "frame")).toBe(true);
  expect(result.request.members.filter(m => m.kind === "axial").every(m => !("material" in m) && !("section" in m))).toBe(true);
  expect(result.request.members.filter(m => m.kind === "axial")).toHaveLength(36);
  expect(result.request.nodal_loads[0].fz_n).toBe(-1000);
  expect(JSON.stringify(p)).toBe(before);
  expect(parseBackup(serializeBackup({ ...emptySnapshot(), projects: [p] })).data.projects[0].workspace.spatialPreparation).toEqual(p.workspace.spatialPreparation);
  if (process.env.JPN_EXPORT_MIXED_FIXTURE === "1") writeFileSync("engine/examples/mixed-adapted-roof.json", JSON.stringify(result.request, null, 2) + "\n");
  const axialGroup = mixedReferenceProject(), d = axialGroup.workspace.spatialPreparation!;
  d.groups.web = { ...d.groups.web, elementKind: "axial", connection: "axial", gGpa: null, nu: null, iyCm4: null, izCm4: null, jCm4: null, rotationDeg: null };
  const onlyEA = await adaptMixedProject(axialGroup);
  expect(onlyEA.request.materials.some(m => m.id === "MAT-web")).toBe(false);
});
it("não infere tipo físico a partir de ligação articulada ou axial legada", async () => {
  const p = mixedReferenceProject(); delete p.workspace.spatialPreparation!.groups.web.elementKind;
  await expect(adaptMixedProject(p)).rejects.toThrow(/ELEMENT_KIND/);
  p.workspace.spatialPreparation!.groups.web.elementKind = "frame";
  p.workspace.spatialPreparation!.groups.web.connection = "axial";
  await expect(adaptMixedProject(p)).rejects.toThrow(/FRAME_PROPERTIES|CONTRADICTION/);
});
it("recusa contradições por peça, propriedades pendentes, conectividade obsoleta e apoios repetidos", async () => {
  const p = mixedReferenceProject(), d = p.workspace.spatialPreparation!;
  const connections = structuredClone(d.memberConnections);
  const piece = generateStructure(p).model!.pieces.find(p => p.role === "web")!;
  d.memberConnections = [{ pieceId: piece.id, start: "pinned", end: "axial" }];
  await expect(adaptMixedProject(p)).rejects.toThrow(/CONTRADICTION/);
  d.memberConnections = connections; d.groups.column.jCm4 = null;
  await expect(adaptMixedProject(p)).rejects.toThrow(/FRAME_PROPERTIES/);
  d.groups.column.jCm4 = 16000; d.connectivity!.geometrySignature = "obsolete";
  await expect(adaptMixedProject(p)).rejects.toThrow(/outra geometria/);
  d.connectivity!.geometrySignature = d.geometrySignature;
  d.supports.push(d.supports[0]); await expect(adaptMixedProject(p)).rejects.toThrow(/DUPLICATE_SUPPORT/);
});
it("mantém a obra incompleta bloqueada e invalida revisão quando as hipóteses físicas mudam", async () => {
  const p = createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4 }); p.workspace.spatialPreparation = newSpatialPreparation(p);
  await expect(adaptMixedProject(p)).rejects.toThrow(/PREPARATION|PROPERTIES|ELEMENT_KIND|SUPPORTS/);
  const complete = mixedReferenceProject(), a = await adaptMixedProject(complete);
  complete.workspace.spatialPreparation!.loads[0].fzKn = -2;
  expect((await adaptMixedProject(complete)).input_sha256).not.toBe(a.input_sha256);
  complete.planning!.frameSpacingM = 3; await expect(adaptMixedProject(complete)).rejects.toThrow(/STALE_GEOMETRY/);
});
it("recupera esforços locais por estática com sinais do contrato, sem inventar flexão em axial", () => {
  expect(mixedStations({ kind: "axial", axial_n: 1, extension_m: .1, length_m: 2 })).toBeNull();
  const s = mixedStations({ kind: "frame", length_m: 2, end_actions_local: [0, 0, 1000, 0, -2000, 0, 0, 0, -1000, 0, 0, 0] })!;
  expect(s[0]).toMatchObject({ vz_n: -1000, my_nm: 2000 }); expect(s[4]).toMatchObject({ x_m: 2, my_nm: 0 });
});
