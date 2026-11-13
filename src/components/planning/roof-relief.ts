import * as THREE from "three";
import type { RoofFinish } from "./presentation-scene";

/** Procedural sheeting relief for the Acabado mode. VISUAL ONLY: rib pitch,
 * height and panel thickness are illustrative catalogue-like proportions, not
 * declared roofing data, and never feed quantities, loads or the solver. */
export interface ReliefProfile { pitchM: number; heightM: number; thicknessM: number; points: readonly (readonly [number, number])[]; }
export const reliefProfiles: Record<RoofFinish, ReliefProfile> = {
  // [distance along the eave within one pitch, height above the sheet plane], metres.
  trapezoidal: { pitchM: .25, heightM: .035, thicknessM: 0, points: [[0, 0], [.085, 0], [.105, .035], [.145, .035], [.165, 0]] },
  sandwich: { pitchM: 1, heightM: .035, thicknessM: .04, points: [[0, 0], [.02, .035], [.06, .035], [.08, 0], [.33, 0], [.34, .005], [.37, .005], [.38, 0], [.66, 0], [.67, .005], [.7, .005], [.71, 0]] },
  standing: { pitchM: .4, heightM: .025, thicknessM: 0, points: [[0, 0], [.008, .025], [.016, 0]] },
};
export const VISUAL_EAVE_OVERHANG_M = .12;

/** Cross-section polyline over the whole eave length, clamped at the end. */
export function reliefPolyline(profile: ReliefProfile, lengthM: number): [number, number][] {
  if (!(lengthM > 0) || !Number.isFinite(lengthM)) throw new Error("Comprimento de cobertura inválido");
  const line: [number, number][] = [];
  for (let start = 0; start < lengthM; start += profile.pitchM) for (const [s, h] of profile.points) {
    const at = start + s;
    if (at >= lengthM) break;
    line.push([at, h]);
  }
  line.push([lengthM, 0]);
  return line;
}

/** corners = [eaveStart, ridgeStart, ridgeEnd, eaveEnd] as produced by
 * roofPlaneCorners: a->b runs along the slope, a->d along the ribs' repetition.
 * `liftM` raises the sheet along the plane normal so it rests ABOVE the purlins. */
export function roofReliefGeometry(corners: readonly THREE.Vector3[], finish: RoofFinish, liftM = 0, eaveOverhangM = VISUAL_EAVE_OVERHANG_M): THREE.BufferGeometry {
  const profile = reliefProfiles[finish];
  let a = corners[0].clone(), b = corners[1].clone(), d = corners[3].clone();
  const along = d.clone().sub(a), lengthM = along.length(); along.divideScalar(lengthM);
  const slope = b.clone().sub(a).normalize();
  const normal = slope.clone().cross(along).normalize(); if (normal.y < 0) normal.negate();
  // Visual eave: extend only the LOW edge of the water, along the slope.
  if (eaveOverhangM > 0 && Math.abs(a.y - b.y) > 1e-9) {
    if (a.y < b.y) { a = a.addScaledVector(slope, -eaveOverhangM); d = d.addScaledVector(slope, -eaveOverhangM); }
    else b = b.addScaledVector(slope, eaveOverhangM);
  }
  const slopeLength = a.distanceTo(b), line = reliefPolyline(profile, lengthM);
  const positions: number[] = [], uvs: number[] = [];
  const point = (base: THREE.Vector3, s: number, h: number) => base.clone().addScaledVector(along, s).addScaledVector(normal, h + liftM);
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u0: number, u1: number, up: THREE.Vector3) => {
    // Wind every face so its geometric normal agrees with `up`.
    const face = p1.clone().sub(p0).cross(p2.clone().sub(p0));
    const order = face.dot(up) >= 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
    const uv = face.dot(up) >= 0 ? [[u0, 0], [u0, 1], [u1, 1], [u0, 0], [u1, 1], [u1, 0]] : [[u0, 0], [u1, 1], [u0, 1], [u0, 0], [u1, 0], [u1, 1]];
    order.forEach((p, i) => { positions.push(p.x, p.y, p.z); uvs.push(uv[i][0], uv[i][1] * slopeLength); });
  };
  for (let i = 0; i < line.length - 1; i++) {
    const [s0, h0] = line[i], [s1, h1] = line[i + 1];
    if (s1 - s0 <= 1e-9 && Math.abs(h1 - h0) <= 1e-9) continue;
    const rise = h1 - h0, run = s1 - s0;
    const faceUp = normal.clone().multiplyScalar(run).addScaledVector(along, -rise);
    if (faceUp.lengthSq() === 0) faceUp.copy(normal);
    quad(point(a, s0, h0), point(b, s0, h0), point(b, s1, h1), point(a, s1, h1), s0 / profile.pitchM, s1 / profile.pitchM, faceUp);
  }
  if (profile.thicknessM > 0) {
    const t = -profile.thicknessM, down = normal.clone().negate();
    quad(point(a, 0, t), point(b, 0, t), point(b, lengthM, t), point(a, lengthM, t), 0, lengthM / profile.pitchM, down);
    // Closing strips make the insulated panel read as a solid at eave, ridge and gables.
    quad(point(a, 0, t), point(a, lengthM, t), point(a, lengthM, 0), point(a, 0, 0), 0, 1, slope.clone().negate());
    quad(point(b, 0, t), point(b, lengthM, t), point(b, lengthM, 0), point(b, 0, 0), 0, 1, slope);
    quad(point(a, 0, t), point(b, 0, t), point(b, 0, 0), point(a, 0, 0), 0, 1, along.clone().negate());
    quad(point(a, lengthM, t), point(b, lengthM, t), point(b, lengthM, 0), point(a, lengthM, 0), 0, 1, along);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { finish, lengthM, slopeLength, liftM, ribs: Math.ceil(lengthM / profile.pitchM), visualOnly: true };
  return geometry;
}

/** Folded cap over a common ridge of two waters (gable). Visual only. */
export function ridgeCapGeometry(first: readonly THREE.Vector3[], second: readonly THREE.Vector3[], finish: RoofFinish, liftM = 0, halfWidthM = .22): THREE.BufferGeometry | null {
  const [a1, b1, c1] = first, [a2, b2] = second;
  if (b1.distanceTo(a2) > 1e-6) return null; // waters do not share a ridge
  const clear = liftM + reliefProfiles[finish].heightM + .006;
  const ridge = c1.clone().sub(b1), down1 = a1.clone().sub(b1).normalize(), down2 = b2.clone().sub(a2).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const r0 = b1.clone().addScaledVector(up, clear), r1 = r0.clone().add(ridge);
  const positions: number[] = [];
  for (const down of [down1, down2]) {
    const e0 = r0.clone().addScaledVector(down, halfWidthM), e1 = e0.clone().add(ridge);
    const face = r1.clone().sub(r0).cross(e0.clone().sub(r0));
    const order = face.y >= 0 ? [r0, r1, e1, r0, e1, e0] : [r0, e1, r1, r0, e0, e1];
    for (const p of order) positions.push(p.x, p.y, p.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { visualOnly: true };
  return geometry;
}
