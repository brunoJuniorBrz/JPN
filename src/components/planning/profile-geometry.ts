import * as THREE from "three";
import type { Node3D } from "@/domain/structure";
import type { ResolvedSection } from "@/domain/profile-section";

export function scenePoint(n: Pick<Node3D, "x" | "y" | "z">): THREE.Vector3 { return new THREE.Vector3(n.x / 1000, n.z / 1000, -n.y / 1000); }

// A one-metre extrusion is shared by every length of the same section.
// Local Z runs [0,1]; the external bounding-box centre is the bar axis.
export function sectionShape(s: ResolvedSection, segments = 32): THREE.Shape {
  const w = s.width / 1000, h = s.height / 1000, t = s.t / 1000, f = s.tf / 1000;
  const polygon = (points: number[][]) => points.map(([x, y]) => new THREE.Vector2(x - w / 2, y - h / 2));
  const rect = [[0, 0], [w, 0], [w, h], [0, h]];
  let outline = rect;
  switch (s.family) {
    case "i": outline = [[0, 0], [w, 0], [w, f], [(w + t) / 2, f], [(w + t) / 2, h - f], [w, h - f], [w, h], [0, h], [0, h - f], [(w - t) / 2, h - f], [(w - t) / 2, f], [0, f]]; break;
    case "channel": outline = [[0, 0], [w, 0], [w, t], [t, t], [t, h - t], [w, h - t], [w, h], [0, h]]; break;
    case "angle": outline = [[0, 0], [w, 0], [w, t], [t, t], [t, h], [0, h]]; break;
  }
  if (s.family === "channel" && s.opening < 0) outline = outline.map(([x, y]) => [w - x, y]).reverse();
  if (s.family === "circular-tube") {
    const ring = (radius: number, clockwise: boolean) => Array.from({ length: segments }, (_, i) => {
      const angle = (clockwise ? -1 : 1) * 2 * Math.PI * i / segments;
      return new THREE.Vector2(radius * Math.cos(angle), radius * Math.sin(angle));
    });
    const shape = new THREE.Shape(ring(w / 2, false)); shape.holes.push(new THREE.Path(ring(w / 2 - t, true))); return shape;
  }
  const shape = new THREE.Shape(polygon(outline));
  if (s.family === "rectangular-tube" || s.family === "square-tube") shape.holes.push(new THREE.Path(polygon([[t, t], [t, h - t], [w - t, h - t], [w - t, t]])));
  return shape;
}
export function createSectionGeometry(s: ResolvedSection, segments = 32): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(sectionShape(s, segments), { depth: 1, bevelEnabled: false, steps: 1 });
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
export function sectionKey(s: ResolvedSection): string { return JSON.stringify([s.family, s.width, s.height, s.t, s.tf, s.opening]); }

export function pieceMatrix(start: THREE.Vector3, end: THREE.Vector3, rollDeg = 0): THREE.Matrix4 {
  const delta = end.clone().sub(start), length = delta.length();
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(rollDeg)) throw new Error("Eixo de peça inválido");
  const direction = delta.divideScalar(length), reference = new THREE.Vector3(1, 0, 0);
  // Shortest rotation from project +X; for exactly -X use 180° about project +Z.
  const cross = reference.clone().cross(direction), sine = cross.length();
  const alignment = sine > 0
    ? new THREE.Quaternion().setFromAxisAngle(cross.divideScalar(sine), Math.atan2(sine, direction.x))
    : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), direction.x < 0 ? Math.PI : 0);
  const base = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), reference);
  const orientation = alignment.multiply(new THREE.Quaternion().setFromRotationMatrix(base)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollDeg * Math.PI / 180));
  return new THREE.Matrix4().compose(start, orientation, new THREE.Vector3(1, 1, length));
}
