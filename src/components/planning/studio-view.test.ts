import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planningExample } from "@/domain/planning-example";
import { generateStructure } from "@/domain/calculations/structure";
import { visualSectionSchema } from "@/domain/profile-section";
import { roles, sectionDataSchema } from "@/domain/structure";
import { createQuickProject } from "@/domain/quick-project";
import examples from "../../../examples/perfis-3d.json" with { type: "json" };
import { buildProfileScene, roleColors } from "./profile-scene";
import { pieceMatrix, scenePoint } from "./profile-geometry";
import { createPresentationScene, initialPresentationOptions, presentationEnvelope, roofPlaneCorners } from "./presentation-scene";
import { reliefPolyline, reliefProfiles, ridgeCapGeometry, roofReliefGeometry, VISUAL_EAVE_OVERHANG_M } from "./roof-relief";
import { createCameraRig } from "./studio-stage";
import { reviewResultOverlay, type ResultOverlay } from "./studio-result-overlay";
import { easeInOut, finishedRoleColor, interpolatePose, matchingOrthoHalfHeight, sectionPlane, steelFinishes, steelFinishMaterial, studioViews, viewPose } from "./studio-view";

function project() {
  const p = planningExample();
  roles.forEach((role, i) => {
    const { thicknessMm, expectedAreaMm2: _a, ...v } = examples.sections[i]; void _a;
    p.planning!.profiles[role].visualSection = visualSectionSchema.parse(v);
    p.planning!.profiles[role].data = { ...sectionDataSchema.parse({}), thicknessMm: thicknessMm ?? null };
  });
  return p;
}
const finite = (g: THREE.BufferGeometry) => Array.from(g.getAttribute("position").array).every(Number.isFinite);
function triangleArea(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position"), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let area = 0;
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); area += b.sub(a).cross(c.sub(a)).length() / 2; }
  return area;
}

describe("coordinate transform and piece orientation stay exact", () => {
  it("maps project millimetres (Z up) to scene metres (Y up, z = -Y)", () => {
    expect(scenePoint({ x: 1000, y: 2000, z: 3000 }).toArray()).toEqual([1, 3, -2]);
  });
  it("keeps every instance on its two physical nodes and its real length", () => {
    const model = generateStructure(project()).model!, scene = buildProfileScene(model, 8);
    const nodes = new Map(model.nodes.map(n => [n.id, scenePoint(n)]));
    expect(scene.solidCount).toBe(model.pieces.length);
    for (const piece of model.pieces) {
      const item = scene.instances.get(piece.id)!, matrix = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, matrix);
      const start = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix), end = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix);
      // Instance matrices are float32 on the GPU: 0.01 mm is the honest bound.
      expect(start.distanceTo(nodes.get(piece.start)!)).toBeLessThan(1e-5);
      expect(end.distanceTo(nodes.get(piece.end)!)).toBeLessThan(1e-5);
      expect(Math.abs(start.distanceTo(end) * 1000 - piece.lengthMm)).toBeLessThan(.02);
      expect((item.mesh.userData.ids as string[])[item.index]).toBe(piece.id);
    }
    scene.dispose();
  });
  it("produces a proper rotation with uniform section scale for inclined and reversed bars", () => {
    for (const [a, b, roll] of [[[0, 0, 0], [3, 1, -2], 0], [[1, 2, 3], [-4, 2.5, 3], 37], [[0, 0, 0], [0, 5, 0], 90], [[2, 0, 0], [-2, 0, 0], 0]] as const) {
      const m = pieceMatrix(new THREE.Vector3(...a), new THREE.Vector3(...b), roll);
      const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(); m.extractBasis(x, y, z);
      expect(x.length()).toBeCloseTo(1, 12); expect(y.length()).toBeCloseTo(1, 12);
      expect(Math.abs(x.dot(y))).toBeLessThan(1e-12); expect(Math.abs(x.dot(z))).toBeLessThan(1e-12);
      expect(x.clone().cross(y).dot(z)).toBeGreaterThan(0); // no mirrored (inside-out) solids
    }
  });
});

describe("studio rendering state never touches the structural model", () => {
  it("finish, ghost, visibility and highlight leave model, matrices and IDs unchanged", () => {
    const model = generateStructure(project()).model!, before = JSON.stringify(model), scene = buildProfileScene(model, 8);
    const snapshot = () => model.pieces.map(p => { const item = scene.instances.get(p.id)!, m = new THREE.Matrix4(); item.mesh.getMatrixAt(item.index, m); return m.toArray().join(","); }).join("|");
    scene.setMode("profiles"); const matrices = snapshot(), id = model.pieces[0].id;
    for (const finish of steelFinishes) { scene.setFinish(finish); expect(scene.material.metalness).toBe(steelFinishMaterial[finish].metalness); }
    scene.highlight(id); scene.setGhost(true);
    expect(scene.ghostActive()).toBe(true); expect(scene.material.transparent).toBe(true); expect(scene.material.opacity).toBeLessThan(.3);
    expect(scene.focusMesh.geometry).toBe(scene.instances.get(id)!.mesh.geometry);
    scene.setVisibility(new Set(["purlin"]));
    expect(scene.ghostActive()).toBe(model.pieces[0].role === "purlin");
    scene.setVisibility(new Set(roles)); scene.setGhost(false); scene.highlight("");
    expect(scene.ghostActive()).toBe(false); expect(scene.material.transparent).toBe(false); expect(scene.material.opacity).toBe(1);
    expect(snapshot()).toBe(matrices); expect(JSON.stringify(model)).toBe(before);
    scene.dispose();
  });
  it("ghost is not offered for line-only structural mode and analysis colours override finishes", () => {
    const model = generateStructure(project()).model!, scene = buildProfileScene(model, 8), id = model.pieces[0].id;
    scene.highlight(id); scene.setGhost(true); expect(scene.ghostActive()).toBe(false); // structural mode
    scene.setMode("profiles"); scene.highlight(""); scene.setFinish("galvanized");
    const other = model.pieces[1], item = scene.instances.get(other.id)!, colour = new THREE.Color();
    item.mesh.getColorAt(item.index, colour); expect(colour.getHex()).toBe(finishedRoleColor(roleColors[other.role], "galvanized").getHex());
    scene.setColors({ [other.id]: 0x123456 }); item.mesh.getColorAt(item.index, colour); expect(colour.getHex()).toBe(0x123456);
    scene.setFinish("raw"); item.mesh.getColorAt(item.index, colour); expect(colour.getHex()).toBe(0x123456);
    scene.dispose();
  });
  it("releases every GPU resource it created", () => {
    const model = generateStructure(project()).model!, scene = buildProfileScene(model, 8); let disposed = 0;
    const geometries = new Set<THREE.BufferGeometry>(); scene.root.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) geometries.add(g); });
    for (const g of geometries) g.addEventListener("dispose", () => disposed++);
    scene.dispose(); scene.dispose();
    expect(disposed).toBe(geometries.size); expect(scene.root.children).toHaveLength(0); expect(scene.instances.size).toBe(0);
  });
});

describe("procedural roof relief is finite, bounded and visual only", () => {
  const p = createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4, slopePercent: 10 }), envelope = presentationEnvelope(p.roof, p.planning)!, planes = roofPlaneCorners(envelope);
  it.each(["trapezoidal", "sandwich", "standing"] as const)("%s: finite ribs within the declared rib height, resting above the purlins", finish => {
    const lift = .07, profile = reliefProfiles[finish];
    for (const corners of planes) {
      const g = roofReliefGeometry(corners, finish, lift);
      expect(finite(g)).toBe(true); expect(g.getAttribute("position").count % 3).toBe(0); expect(g.userData.visualOnly).toBe(true);
      const [a, b, , d] = corners, along = d.clone().sub(a).normalize(), slope = b.clone().sub(a).normalize();
      const normal = slope.clone().cross(along).normalize(); if (normal.y < 0) normal.negate();
      const position = g.getAttribute("position"), v = new THREE.Vector3(); let low = Infinity, high = -Infinity, sMin = Infinity, sMax = -Infinity;
      for (let i = 0; i < position.count; i++) { v.fromBufferAttribute(position, i).sub(a); const h = v.dot(normal); low = Math.min(low, h); high = Math.max(high, h); const s = v.dot(along); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); }
      expect(high).toBeCloseTo(lift + profile.heightM, 5); expect(low).toBeCloseTo(lift - profile.thicknessM, 5); // float32 vertex buffers
      expect(sMin).toBeCloseTo(0, 5); expect(sMax).toBeCloseTo(a.distanceTo(d), 5);
      // Developed area is at least the flat water (plus the visual eave) and never an order of magnitude more.
      const flat = (a.distanceTo(b) + VISUAL_EAVE_OVERHANG_M) * a.distanceTo(d);
      expect(triangleArea(g)).toBeGreaterThan(flat * .999); expect(triangleArea(g)).toBeLessThan(flat * (finish === "sandwich" ? 2.4 : 1.5));
      g.dispose();
    }
  });
  it("without eave overhang a flat-profile span reproduces the exact water area", () => {
    const corners = planes[0], g = roofReliefGeometry(corners, "standing", 0, 0), flat = corners[0].distanceTo(corners[1]) * corners[0].distanceTo(corners[3]);
    const ribs = Math.ceil(corners[0].distanceTo(corners[3]) / reliefProfiles.standing.pitchM);
    expect(triangleArea(g)).toBeGreaterThan(flat); expect(triangleArea(g)).toBeLessThan(flat * 1.2); expect(g.userData.ribs).toBe(ribs);
  });
  it("polyline is monotonic, starts at 0 and ends exactly at the eave length", () => {
    for (const profile of Object.values(reliefProfiles)) for (const length of [.1, 3.33, 20.75]) {
      const line = reliefPolyline(profile, length);
      expect(line[0][0]).toBe(0); expect(line.at(-1)).toEqual([length, 0]);
      for (let i = 1; i < line.length; i++) expect(line[i][0]).toBeGreaterThanOrEqual(line[i - 1][0]);
    }
    expect(() => reliefPolyline(reliefProfiles.trapezoidal, 0)).toThrow(); expect(() => reliefPolyline(reliefProfiles.trapezoidal, NaN)).toThrow();
  });
  it("ridge cap exists only where two waters share a ridge and sits above the ribs", () => {
    expect(planes).toHaveLength(2);
    const cap = ridgeCapGeometry(planes[0], planes[1], "trapezoidal", .05)!;
    expect(finite(cap)).toBe(true); expect(cap.boundingBox!.max.y).toBeCloseTo(planes[0][1].y + .05 + reliefProfiles.trapezoidal.heightM + .006, 5);
    const apart = planes[1].map(v => v.clone().add(new THREE.Vector3(.5, 0, 0)));
    expect(ridgeCapGeometry(planes[0], apart, "trapezoidal")).toBeNull();
  });
  it("disposes each replaced roof sheet and ridge cap exactly once", () => {
    const view = createPresentationScene(envelope, initialPresentationOptions, () => {});
    const disposeCounts = new Map<THREE.BufferGeometry, number>();
    const observe = () => view.root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.geometry?.userData.visualOnly) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      if (disposeCounts.has(geometry)) return;
      disposeCounts.set(geometry, 0);
      geometry.addEventListener("dispose", () => disposeCounts.set(geometry, disposeCounts.get(geometry)! + 1));
    });
    observe();
    for (const roofFinish of ["sandwich", "standing", "trapezoidal"] as const) {
      view.update({ ...initialPresentationOptions, roofFinish });
      observe();
    }
    view.dispose();
    view.dispose(); // unmount/cleanup must also be idempotent
    expect(disposeCounts.size).toBeGreaterThan(6);
    for (const calls of disposeCounts.values()) expect(calls).toBe(1);
  });

});

describe("cameras, projection and section planes", () => {
  const bounds = new THREE.Box3(new THREE.Vector3(0, 0, -20), new THREE.Vector3(10, 4.5, 0));
  it.each(studioViews)("%s frames the whole bounding sphere in both projections", view => {
    for (const aspect of [375 / 500, 16 / 9]) {
      const pose = viewPose(bounds, view, aspect, 40), sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const camera = new THREE.PerspectiveCamera(40, aspect, .01, 1e5); camera.position.copy(pose.position); camera.up.copy(pose.up); camera.lookAt(pose.target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const plane of frustum.planes.slice(0, 4)) expect(plane.distanceToPoint(sphere.center)).toBeGreaterThanOrEqual(sphere.radius * .999);
      expect(pose.orthoHalfHeight).toBeGreaterThanOrEqual(sphere.radius); expect(pose.orthoHalfHeight * aspect).toBeGreaterThanOrEqual(sphere.radius);
      expect(pose.target.distanceTo(sphere.center)).toBeLessThan(1e-12);
    }
  });
  it("top view looks straight down with project +Y up on screen", () => {
    const pose = viewPose(bounds, "top", 1.5, 40);
    expect(pose.position.x).toBeCloseTo(pose.target.x); expect(pose.position.z).toBeCloseTo(pose.target.z); expect(pose.position.y).toBeGreaterThan(pose.target.y);
    expect(pose.up.toArray()).toEqual([0, 0, -1]);
  });
  it("interpolation is eased, reaches both ends exactly and keeps a unit up vector", () => {
    const a = viewPose(bounds, "iso", 1.5, 40), b = viewPose(bounds, "top", 1.5, 40);
    expect(easeInOut(-1)).toBe(0); expect(easeInOut(0.5)).toBe(.5); expect(easeInOut(2)).toBe(1);
    expect(interpolatePose(a, b, 0).position.distanceTo(a.position)).toBe(0); expect(interpolatePose(a, b, 1).position.distanceTo(b.position)).toBe(0);
    for (const t of [.1, .5, .9]) expect(interpolatePose(a, b, t).up.length()).toBeCloseTo(1, 12);
  });
  it("switching projection keeps the framed extent and the viewing direction", () => {
    const rig = createCameraRig(1.6, () => {}), pose = viewPose(bounds, "iso", 1.6, 40);
    rig.moveTo(pose, 0);
    const distance = rig.active().position.distanceTo(rig.target), direction = rig.active().getWorldDirection(new THREE.Vector3());
    rig.setProjection("orthographic");
    expect(rig.active()).toBe(rig.orthographic); expect(rig.orthographic.isOrthographicCamera).toBe(true);
    expect(rig.orthographic.top).toBeCloseTo(matchingOrthoHalfHeight(distance, 40), 9);
    expect(rig.orthographic.right / rig.orthographic.top).toBeCloseTo(1.6, 12);
    expect(rig.active().getWorldDirection(new THREE.Vector3()).distanceTo(direction)).toBeLessThan(1e-9);
    rig.orthographic.zoom = 2; // user zooms in while orthographic
    rig.setProjection("perspective");
    expect(rig.active().position.distanceTo(rig.target)).toBeCloseTo(distance / 2, 6);
    expect(rig.active().getWorldDirection(new THREE.Vector3()).distanceTo(direction)).toBeLessThan(1e-9);
    rig.setAspect(.75); expect(rig.orthographic.right / rig.orthographic.top).toBeCloseTo(.75, 12);
  });
  it("section plane is positioned in project coordinates and keeps the lower side by default", () => {
    for (const [axis, lower, upper] of [["x", new THREE.Vector3(1, 2, -3), new THREE.Vector3(9, 2, -3)], ["y", new THREE.Vector3(5, 2, -1), new THREE.Vector3(5, 2, -19)], ["z", new THREE.Vector3(5, .5, -3), new THREE.Vector3(5, 4, -3)]] as const) {
      const cut = sectionPlane(bounds, { axis, fraction: .5, flipped: false });
      expect(cut.positionMm).toBeCloseTo(axis === "x" ? 5000 : axis === "y" ? 10000 : 2250, 9);
      expect(cut.plane.distanceToPoint(lower)).toBeGreaterThan(0); expect(cut.plane.distanceToPoint(upper)).toBeLessThan(0);
      const flipped = sectionPlane(bounds, { axis, fraction: .5, flipped: true });
      expect(flipped.plane.distanceToPoint(lower)).toBeLessThan(0); expect(flipped.plane.distanceToPoint(upper)).toBeGreaterThan(0);
      expect(flipped.positionMm).toBe(cut.positionMm);
    }
    const range = sectionPlane(bounds, { axis: "y", fraction: 0, flipped: false }).rangeMm; expect(range[0]).toBeCloseTo(0, 12); expect(range[1]).toBe(20000);
    expect(sectionPlane(bounds, { axis: "x", fraction: 7, flipped: false }).positionMm).toBe(10000); // clamped
    expect(bounds.min.toArray()).toEqual([0, 0, -20]); // bounds are never mutated
  });
});

describe("future result overlays must be traced before anything is drawn", () => {
  const hash = "a".repeat(64), model = { pieces: [{ id: "P1" }, { id: "P2" }] };
  const overlay = (): ResultOverlay => ({ schema_version: "jpn.studio-result-overlay/1", kind: "axial", units: "N", pieces: [{ pieceId: "P1", value: 1200 }],
    binding: { inputSha256: hash, resultSha256: "b".repeat(64), combinationId: "ULS-1", solver: { name: "PyNiteFEA", version: "3.2.1" } }, computedStructuralApproval: false, fabricationRelease: false });
  it("accepts only a fully bound overlay for the displayed revision", () => {
    expect(reviewResultOverlay(overlay(), model, hash)).toEqual([]);
    expect(reviewResultOverlay(overlay(), model, "c".repeat(64)).map(i => i.code)).toEqual(["OVERLAY_STALE"]);
  });
  it("refuses unbound, orphan, duplicate, non-finite or approving overlays", () => {
    const codes = (change: (o: ResultOverlay) => void) => { const o = overlay(); change(o); return reviewResultOverlay(o, model, hash).map(i => i.code); };
    expect(codes(o => { o.binding.inputSha256 = ""; })).toContain("OVERLAY_UNBOUND");
    expect(codes(o => { o.pieces.push({ pieceId: "P9", value: 1 }); })).toContain("OVERLAY_ORPHAN_PIECE");
    expect(codes(o => { o.pieces.push({ pieceId: "P1", value: 2 }); })).toContain("OVERLAY_DUPLICATE_PIECE");
    expect(codes(o => { o.pieces[0].value = NaN; })).toContain("OVERLAY_NONFINITE");
    expect(codes(o => { o.binding.combinationId = " "; })).toContain("OVERLAY_PROVENANCE");
    expect(codes(o => { (o as { computedStructuralApproval: boolean }).computedStructuralApproval = true; })).toContain("OVERLAY_APPROVAL");
  });
});