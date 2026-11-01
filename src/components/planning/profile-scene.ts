import * as THREE from "three";
import { resolveSection } from "@/domain/profile-section";
import { roles, type StructureModel, type StructurePiece, type PieceRole } from "@/domain/structure";
import { createSectionGeometry, pieceMatrix, scenePoint, sectionKey } from "./profile-geometry";

export const viewerModes = ["structural", "profiles", "mixed"] as const;
export type ViewerMode = typeof viewerModes[number];
export const VIEWER_MODE_KEY = "jpn-viewer-mode:v1";
export function parseViewerMode(value: string | null): ViewerMode { return viewerModes.includes(value as ViewerMode) ? value as ViewerMode : "structural"; }
export function viewerQuality(count: number, hardwareConcurrency = 8, deviceMemory = 8) {
  const low = count > 1500 || hardwareConcurrency <= 4 || deviceMemory <= 4;
  // Reduce mesh complexity on limited devices, not the image sharpness.
  // The renderer additionally applies a screen-size pixel budget on resize.
  return { low, segments: low ? 16 : 32, pixelRatio: low ? 2 : 2.25 };
}
export const roleColors = { column: 0x8f672b, topChord: 0x265c40, bottomChord: 0x42815c, web: 0x64734d, purlin: 0x357989 };
export function pieceIdFromHit(hit: Pick<THREE.Intersection, "object" | "instanceId" | "index">): string | null {
  const ids = hit.object.userData.ids as string[] | undefined;
  if (!ids) return null;
  const index = hit.instanceId ?? (hit.index === undefined ? -1 : Math.floor(hit.index / 2));
  return ids[index] ?? null;
}

export function buildProfileScene(model: StructureModel, segments = 32) {
  const root = new THREE.Group(), axes = new THREE.Group(), solids = new THREE.Group(); root.add(axes, solids);
  const nodes = new Map(model.nodes.map(n => [n.id, scenePoint(n)]));
  const piecesById = new Map(model.pieces.map(p => [p.id, p]));
  const resources = new Set<{ dispose(): void }>(), cache = new Map<string, THREE.BufferGeometry>();
  const batches = new Map<string, { geometry: THREE.BufferGeometry; pieces: StructurePiece[] }>();
  const instances = new Map<string, { mesh: THREE.InstancedMesh; index: number; color: THREE.Color }>();
  // Keep the original transform: hiding an instance must never change the model.
  const originalMatrices = new Map<string, THREE.Matrix4>();
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const simplified = new Set<string>(), warnings = new Map<string, string>();
  for (const piece of model.pieces) {
    const resolution = resolveSection(piece.profile), a = nodes.get(piece.start), b = nodes.get(piece.end);
    if (!resolution.section || !a || !b || !Number.isFinite(a.distanceTo(b)) || a.distanceToSquared(b) === 0) {
      simplified.add(piece.id); warnings.set(piece.id, resolution.warning || "Eixo inválido: sólido indisponível."); continue;
    }
    const key = sectionKey(resolution.section);
    if (!cache.has(key)) { const geometry = createSectionGeometry(resolution.section, segments); cache.set(key, geometry); resources.add(geometry); }
    if (!batches.has(key)) batches.set(key, { geometry: cache.get(key)!, pieces: [] });
    batches.get(key)!.pieces.push(piece);
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .28, roughness: .65 }); resources.add(material);
  for (const { geometry, pieces } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, pieces.length); mesh.userData.ids = pieces.map(p => p.id);
    pieces.forEach((piece, index) => {
      const color = new THREE.Color(roleColors[piece.role]);
      const matrix = pieceMatrix(nodes.get(piece.start)!, nodes.get(piece.end)!, piece.profile.visualSection?.rollDeg);
      mesh.setMatrixAt(index, matrix);
      originalMatrices.set(piece.id, matrix);
      mesh.setColorAt(index, color); instances.set(piece.id, { mesh, index, color });
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); solids.add(mesh); resources.add(mesh);
  }
  const lineTargets: THREE.LineSegments[] = [];
  for (const role of roles) for (const fallback of [false, true]) {
    const pieces = model.pieces.filter(p => p.role === role && simplified.has(p.id) === fallback && nodes.has(p.start) && nodes.has(p.end));
    if (!pieces.length) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(pieces.flatMap(p => [nodes.get(p.start)!, nodes.get(p.end)!]));
    const material = new THREE.LineBasicMaterial({ color: roleColors[role], depthTest: false, transparent: true, opacity: .8 });
    const line = new THREE.LineSegments(geometry, material); line.userData.ids = pieces.map(p => p.id); line.userData.fallback = fallback; line.userData.role = role;
    line.renderOrder = 2; axes.add(line); lineTargets.push(line); resources.add(geometry); resources.add(material);
  }
  const markerGeometry = new THREE.BufferGeometry(), markerMaterial = new THREE.LineBasicMaterial({ color: 0xf15c17, depthTest: false });
  const marker = new THREE.Line(markerGeometry, markerMaterial); marker.visible = false; marker.renderOrder = 10; root.add(marker); resources.add(markerGeometry); resources.add(markerMaterial);
  const bounds = new THREE.Box3().setFromPoints([...nodes.values()]);
  solids.children.forEach(mesh => bounds.union((mesh as THREE.InstancedMesh).boundingBox!));
  let currentMode: ViewerMode = "structural", selected = "", disposed = false;
  let visibleRoles = new Set<PieceRole>(roles), isolatedId: string | null = null;
  const pieceVisible = (id: string) => {
    const piece = piecesById.get(id);
    return !!piece && visibleRoles.has(piece.role) && (!isolatedId || isolatedId === id);
  };
  const refreshVisibility = () => {
    for (const [id, item] of instances) {
      item.mesh.setMatrixAt(item.index, pieceVisible(id) ? originalMatrices.get(id)! : hiddenMatrix);
      item.mesh.instanceMatrix.needsUpdate = true;
    }
    // Invisible instances must not keep the old bounds for raycasting/culling.
    for (const mesh of solids.children as THREE.InstancedMesh[]) {
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    }
    for (const line of lineTargets) {
      const ids = line.userData.ids as string[];
      const role = line.userData.role as PieceRole;
      const index = isolatedId ? ids.indexOf(isolatedId) : -1;
      line.geometry.setDrawRange(isolatedId ? Math.max(index, 0) * 2 : 0, isolatedId ? (index < 0 ? 0 : 2) : ids.length * 2);
      line.visible = visibleRoles.has(role) && (!isolatedId || index >= 0) &&
        (currentMode !== "profiles" || !!line.userData.fallback);
      const material = line.material as THREE.LineBasicMaterial;
      material.depthTest = currentMode === "structural";
      material.opacity = currentMode === "structural" ? 1 : .8;
    }
    marker.visible = pieceVisible(selected);
  };
  const setMode = (mode: ViewerMode) => {
    currentMode = mode; solids.visible = mode !== "structural";
    refreshVisibility();
  };
  setMode(currentMode);
  return {
    root, bounds, warnings, cache, instances,
    solidCount: instances.size, fallbackCount: simplified.size,
    setMode,
    setVisibility: (rolesToShow: ReadonlySet<PieceRole>, onlyId: string | null = null) => {
      visibleRoles = new Set(rolesToShow);
      isolatedId = onlyId && piecesById.has(onlyId) ? onlyId : null;
      refreshVisibility();
    },
    setColors: (colors?: Record<string, number>) => {
      for (const piece of model.pieces) {
        const item = instances.get(piece.id);
        if (item) { item.color.setHex(colors?.[piece.id] ?? roleColors[piece.role]); item.mesh.setColorAt(item.index, item.color); item.mesh.instanceColor!.needsUpdate = true; }
      }
      for (const line of lineTargets) {
        const ids = line.userData.ids as string[], values: number[] = [];
        for (const id of ids) { const piece = piecesById.get(id)!; const color = new THREE.Color(colors?.[id] ?? roleColors[piece.role]); values.push(color.r, color.g, color.b, color.r, color.g, color.b); }
        line.geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
        const mat = line.material as THREE.LineBasicMaterial; mat.color.setHex(0xffffff); mat.vertexColors = true; mat.needsUpdate = true;
      }
      const item = instances.get(selected); if (item) { item.mesh.setColorAt(item.index, new THREE.Color(0xff9b36)); item.mesh.instanceColor!.needsUpdate = true; }
    },
    targets: () => [...(currentMode === "structural" ? [] : solids.children), ...lineTargets.filter(line => line.visible)],
    highlight: (id: string) => {
      const old = instances.get(selected); if (old) { old.mesh.setColorAt(old.index, old.color); old.mesh.instanceColor!.needsUpdate = true; }
      selected = id; const item = instances.get(id);
      if (item) { item.mesh.setColorAt(item.index, new THREE.Color(0xff9b36)); item.mesh.instanceColor!.needsUpdate = true; }
      const piece = piecesById.get(id); marker.visible = pieceVisible(id);
      if (piece) { markerGeometry.setFromPoints([nodes.get(piece.start)!, nodes.get(piece.end)!]); markerGeometry.computeBoundingSphere(); }
    },
    dispose: () => { if (disposed) return; disposed = true; resources.forEach(r => r.dispose()); root.clear(); cache.clear(); instances.clear(); originalMatrices.clear(); },
  };
}
