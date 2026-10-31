import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import examples from "../../../examples/perfis-3d.json";
import { emptyProfile, profileSchema, sectionDataSchema, roles, type ProfileSpec } from "@/domain/structure";
import { resolveSection, visualSectionSchema } from "@/domain/profile-section";
import { createSectionGeometry, pieceMatrix, scenePoint } from "./profile-geometry";
import { buildProfileScene, parseViewerMode, pieceIdFromHit, viewerQuality } from "./profile-scene";
import { planningExample } from "@/domain/planning-example";
import { preprojectExample } from "@/domain/preproject-example";
import { generateStructure } from "@/domain/calculations/structure";
import { buildTrussRequest } from "@/domain/analysis";
import { structureSignature } from "@/domain/calculations/project-basis";
import { projectCutting } from "@/domain/calculations/cutting";
import { emptySnapshot, migrateSnapshot } from "@/domain/models";

function profile(index: number): ProfileSpec {
  const { thicknessMm, expectedAreaMm2: _area, ...v } = examples.sections[index]; void _area;
  return { ...emptyProfile(), source: examples.notice, data: { ...sectionDataSchema.parse({}), thicknessMm: thicknessMm ?? null }, visualSection: visualSectionSchema.parse(v) };
}
function volume(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute("position"); let sum = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    sum += a.dot(b.cross(c)) / 6;
  }
  return Math.abs(sum);
}
function frontHit(geometry: THREE.BufferGeometry, x: number, y: number): boolean {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster(new THREE.Vector3(x / 1000, y / 1000, -1), new THREE.Vector3(0, 0, 1));
  const hit = ray.intersectObject(mesh).length > 0; material.dispose(); return hit;
}

describe("seções prismáticas de referência", () => {
  it.each(examples.sections.map((s, i) => [s.family, i] as const))("dimensões, volume e espessuras de %s", (_, index) => {
    const s = resolveSection(profile(index)).section!;
    const g = createSectionGeometry(s, 128), box = g.boundingBox!;
    expect(box.min.x).toBeCloseTo(-s.width / 2000, 7); expect(box.max.x).toBeCloseTo(s.width / 2000, 7);
    expect(box.min.y).toBeCloseTo(-s.height / 2000, 7); expect(box.max.y).toBeCloseTo(s.height / 2000, 7);
    expect(box.min.z).toBe(0); expect(box.max.z).toBe(1);
    // Independent analytical areas versus closed triangle-mesh volume.
    if (index === 2) {
      const polygonArea = 128 / 2 * Math.sin(2 * Math.PI / 128) * (50 ** 2 - 45 ** 2);
      expect(volume(g) * 1e6).toBeCloseTo(polygonArea, 2);
      expect(Math.abs(volume(g) * 1e6 / examples.sections[index].expectedAreaMm2 - 1)).toBeLessThan(.0005);
    } else expect(volume(g) * 1e6).toBeCloseTo(examples.sections[index].expectedAreaMm2, 2);
    if (s.family.endsWith("tube")) {
      expect(frontHit(g, 0, 0)).toBe(false);
      expect(frontHit(g, s.width / 2 - s.t / 2, 0)).toBe(true);
      expect(frontHit(g, s.width / 2 - s.t - .1, 0)).toBe(false);
      expect(frontHit(g, s.width / 2 + .1, 0)).toBe(false);
    } else if (s.family === "i") {
      expect(frontHit(g, 0, 0)).toBe(true); expect(frontHit(g, s.t / 2 + .1, 0)).toBe(false);
      expect(frontHit(g, 40, s.height / 2 - s.tf / 2)).toBe(true); expect(frontHit(g, 40, s.height / 2 - s.tf - .1)).toBe(false);
    } else {
      expect(frontHit(g, -s.width / 2 + s.t / 2, 0)).toBe(true);
      expect(frontHit(g, -s.width / 2 + s.t + .1, 0)).toBe(false);
      expect(frontHit(g, 0, -s.height / 2 + s.t / 2)).toBe(true);
      expect(frontHit(g, 0, -s.height / 2 + s.t + .1)).toBe(false);
    }
    g.dispose();
  });
  it("espelha a abertura U/C sem mudar volume ou dimensões", () => {
    const p = profile(4); p.visualSection = { ...p.visualSection!, family: "channel", heightMm: 160, flangeWidthMm: 60, opening: "negative-x" };
    const g = createSectionGeometry(resolveSection(p).section!);
    expect(frontHit(g, 28, 0)).toBe(true); expect(frontHit(g, -28, 0)).toBe(false); expect(volume(g)).toBeCloseTo(.00135, 8); g.dispose();
  });
  it.each([[1, 0, 0], [-1, 0, 0], [-1, .00000001, .00000001], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [3, 4, 5], [.000001, 1, -.000001]])("preserva extremos e base ortogonal em %j", (x, y, z) => {
    const a = new THREE.Vector3(7, 2, -3), b = a.clone().add(new THREE.Vector3(x, y, z)), m = pieceMatrix(a, b, 37);
    expect(new THREE.Vector3().applyMatrix4(m).distanceTo(a)).toBeLessThan(1e-12);
    expect(new THREE.Vector3(0, 0, 1).applyMatrix4(m).distanceTo(b)).toBeLessThan(1e-12);
    const localX = new THREE.Vector3().setFromMatrixColumn(m, 0), localY = new THREE.Vector3().setFromMatrixColumn(m, 1), axis = b.clone().sub(a).normalize();
    expect(localX.length()).toBeCloseTo(1, 12); expect(localY.length()).toBeCloseTo(1, 12);
    expect(localX.dot(axis)).toBeCloseTo(0, 12); expect(localX.dot(localY)).toBeCloseTo(0, 12); expect(m.determinant()).toBeCloseTo(a.distanceTo(b), 10);
  });
  it("mantém orientação perto da vertical e aplica giro axial com sinal definido", () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(0, 2, 0);
    const zero = pieceMatrix(a, new THREE.Vector3(2, 0, 0)), rotated = pieceMatrix(a, new THREE.Vector3(2, 0, 0), 90);
    expect(new THREE.Vector3(1, 0, 0).transformDirection(zero).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-12);
    expect(new THREE.Vector3(1, 0, 0).transformDirection(rotated).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-12);
    const x = new THREE.Vector3(1, 0, 0).transformDirection(pieceMatrix(a, b));
    for (const epsilon of [-1e-8, 1e-8]) expect(new THREE.Vector3(1, 0, 0).transformDirection(pieceMatrix(a, b.clone().add(new THREE.Vector3(epsilon, 0, epsilon)))).distanceTo(x)).toBeLessThan(1e-7);
    expect(scenePoint({ x: 1000, y: 2000, z: 3000 }).toArray()).toEqual([1, 3, -2]);
    expect(() => pieceMatrix(a, a)).toThrow();
  });
  it("recusa dados incompletos, incompatíveis, não finitos e vazios eliminados", () => {
    expect(resolveSection(emptyProfile()).section).toBeNull();
    const incomplete = profile(0); incomplete.visualSection = visualSectionSchema.parse({ family: "rectangular-tube" }); expect(resolveSection(incomplete).warning).toContain("incompletas");
    for (const index of [0, 1, 2, 4, 5]) { const p = profile(index); p.data!.thicknessMm = 500; expect(resolveSection(p).section).toBeNull(); }
    const p = profile(3); p.visualSection = visualSectionSchema.parse({ ...p.visualSection, webThicknessMm: 120 }); expect(resolveSection(p).section).toBeNull();
    p.visualSection = visualSectionSchema.parse({ ...p.visualSection, webThicknessMm: 6, flangeThicknessMm: 100 }); expect(resolveSection(p).section).toBeNull();
    const mismatch = profile(0); mismatch.data!.kind = "i"; expect(resolveSection(mismatch).warning).toContain("diverge");
    for (const n of [NaN, Infinity, -5, 0]) { const invalid = profile(0); invalid.data!.thicknessMm = n; expect(resolveSection(invalid).section).toBeNull(); expect(profileSchema.safeParse(invalid).success).toBe(false); }
    expect(visualSectionSchema.safeParse({ family: "square-tube", sideMm: -1 }).success).toBe(false);
  });
});

describe("cena compartilhada e contrato original", () => {
  function model() { const p = planningExample(); for (const role of roles) p.planning!.profiles[role] = profile(0); return generateStructure(p).model!; }
  it("instancia uma seção em comprimentos diferentes, seleciona IDs e preserva a câmera ao alternar grupos", () => {
    const m = model(), original = JSON.stringify(m), s = buildProfileScene(m);
    expect(s.cache.size).toBe(1); expect(s.instances.size).toBe(123);
    const first = s.instances.get("T1-BS1")!;
    expect(pieceIdFromHit({ object: first.mesh, instanceId: first.index })).toBe("T1-BS1");
    for (const mode of ["profiles", "mixed", "structural"] as const) {
      s.setMode(mode); expect(s.root.children[1].visible).toBe(mode !== "structural");
      expect(s.targets().some(x => x instanceof THREE.InstancedMesh)).toBe(mode !== "structural");
      expect(s.targets().some(x => x instanceof THREE.LineSegments)).toBe(mode !== "profiles");
    }
    s.highlight("T1-BS1"); const color = new THREE.Color(); first.mesh.getColorAt(first.index, color); expect(color.getHex()).toBe(0xff9b36);
    s.highlight("P1"); first.mesh.getColorAt(first.index, color); expect(color.getHex()).toBe(first.color.getHex());
    const matrix = new THREE.Matrix4(); first.mesh.getMatrixAt(first.index, matrix);
    const piece = m.pieces.find(p => p.id === "T1-BS1")!;
    expect(new THREE.Vector3(0, 0, 1).applyMatrix4(matrix).distanceTo(scenePoint(m.nodes.find(n => n.id === piece.end)!))).toBeLessThan(1e-6);
    const spies = [...s.cache.values(), first.mesh, first.mesh.material as THREE.Material].map(r => vi.spyOn(r, "dispose"));
    s.dispose(); s.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); expect(s.cache.size).toBe(0);
    expect(JSON.stringify(m)).toBe(original);
  });
  it("mantém linhas selecionáveis quando faltam dimensões", () => {
    const m = model(); m.pieces[0].profile = emptyProfile(); const s = buildProfileScene(m); s.setMode("profiles");
    expect(s.fallbackCount).toBe(1); expect(s.warnings.get(m.pieces[0].id)).toContain("não cadastradas");
    const lines = s.targets().find(x => x instanceof THREE.LineSegments)!;
    expect(pieceIdFromHit({ object: lines, index: 0 })).toBe(m.pieces[0].id); expect(pieceIdFromHit({ object: lines, index: 99999 })).toBeNull(); s.dispose();
  });
  it("raycast de sólido instanciado retorna o ID original através da parede do tubo", () => {
    const m = model(); m.pieces = [m.pieces[0]]; const s = buildProfileScene(m); s.setMode("profiles"); s.root.updateMatrixWorld(true);
    const item = s.instances.get(m.pieces[0].id)!, matrix = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, matrix);
    const origin = new THREE.Vector3(.048, 0, -.1).applyMatrix4(matrix), direction = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(s.targets(), false);
    expect(hits[0].object).toBe(item.mesh); expect(pieceIdFromHit(hits[0])).toBe(m.pieces[0].id); s.dispose();
  });
  it("milhares de barras compartilham buffers; qualidade e modos inválidos têm fallback", () => {
    const m = model(); m.pieces = Array.from({ length: 3000 }, (_, i) => ({ ...m.pieces[i % m.pieces.length], id: `synthetic-${i}` }));
    const s = buildProfileScene(m, viewerQuality(m.pieces.length).segments); expect(s.cache.size).toBe(1); expect(s.instances.size).toBe(3000); expect(s.root.children[1].children.length).toBe(1); s.dispose();
    expect(viewerQuality(100, 2).pixelRatio).toBe(2); expect(viewerQuality(100, 8, 2).segments).toBe(16); expect(viewerQuality(100).pixelRatio).toBe(2.25);
    expect(parseViewerMode("mixed")).toBe("mixed"); expect(parseViewerMode("unknown")).toBe("structural");
  });
  it("abre projetos antigos e persiste metadados opcionais sem alterar quantitativos, corte ou entradas do solver", () => {
    const p = preprojectExample(), old = JSON.stringify(p), m = generateStructure(p).model!, request = buildTrussRequest(p), cutting = projectCutting(p);
    expect(migrateSnapshot({ ...emptySnapshot(), projects: [p] }).projects[0]).toEqual(p);
    for (const [i, role] of roles.entries()) { const shape = profile(i); p.planning!.profiles[role].visualSection = shape.visualSection; p.planning!.profiles[role].data!.thicknessMm = shape.data!.thicknessMm; }
    const next = generateStructure(p).model!;
    expect(next.nodes).toEqual(m.nodes); expect(next.pieces.map(({ profile: _profile, ...piece }) => { void _profile; return piece; })).toEqual(m.pieces.map(({ profile: _profile, ...piece }) => { void _profile; return piece; }));
    expect(next.totalLengthM).toBe(m.totalLengthM); expect(next.knownMassKg).toBe(m.knownMassKg); expect(projectCutting(p).groups.map(g => g.bars)).toEqual(cutting.groups.map(g => g.bars));
    p.workspace.analysis!.signature = structureSignature(p); expect(buildTrussRequest(p)).toEqual(request);
    expect(migrateSnapshot({ ...emptySnapshot(), projects: [p] }).projects[0]).toEqual(p); expect(JSON.parse(old).planning.profiles.column.visualSection).toBeUndefined();
  });
});
