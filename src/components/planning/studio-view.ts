import * as THREE from "three";

/** Pure view mathematics of the Studio 3D: camera poses, projection, section
 * planes and steel finishes. Nothing here reads or writes the structural model. */
export const studioViews = ["iso", "top", "front", "side"] as const;
export type StudioView = typeof studioViews[number];
export type Projection = "perspective" | "orthographic";
export interface CameraPose { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; orthoHalfHeight: number; }

const directions: Record<StudioView, THREE.Vector3> = {
  iso: new THREE.Vector3(1, .8, 1).normalize(), top: new THREE.Vector3(0, 1, 0),
  front: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0),
};
export const FIT_MARGIN = 1.12;

/** Pose that frames the bounding sphere for both projections. The perspective
 * distance matches the existing fitIsometricCamera rule (same margin). */
export function viewPose(bounds: THREE.Box3, view: StudioView, aspect: number, fovDeg: number): CameraPose {
  const target = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, .5);
  const halfV = THREE.MathUtils.degToRad(fovDeg) / 2, halfH = Math.atan(Math.tan(halfV) * aspect);
  const distance = FIT_MARGIN * radius / Math.sin(Math.min(halfV, halfH));
  return { target, position: target.clone().addScaledVector(directions[view], distance),
    up: view === "top" ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0),
    orthoHalfHeight: FIT_MARGIN * radius / Math.min(1, aspect) };
}

/** Orthographic half-height that shows the same extent the perspective camera
 * shows at the orbit target, so switching projection does not jump. */
export function matchingOrthoHalfHeight(distance: number, fovDeg: number) {
  return Math.max(distance * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2), 1e-3);
}

export const easeInOut = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = easeInOut(t);
  const up = from.up.clone().lerp(to.up, k);
  return { position: from.position.clone().lerp(to.position, k), target: from.target.clone().lerp(to.target, k),
    up: up.lengthSq() < 1e-8 ? to.up.clone() : up.normalize(),
    orthoHalfHeight: from.orthoHalfHeight + (to.orthoHalfHeight - from.orthoHalfHeight) * k };
}

/** Section cut axes are named in PROJECT coordinates (mm, Z up). The scene uses
 * metres with x = X, y = Z and z = -Y. */
export const sectionAxes = ["x", "y", "z"] as const;
export type SectionAxis = typeof sectionAxes[number];
export interface SectionCut { axis: SectionAxis; fraction: number; flipped: boolean; }
export const sectionAxisLabels: Record<SectionAxis, string> = { x: "X · largura", y: "Y · comprimento", z: "Z · altura" };

/** Returns the clipping plane (kept side: plane.distanceToPoint >= 0) and the
 * cut position in project millimetres. View-only; geometry is never modified. */
export function sectionPlane(bounds: THREE.Box3, cut: SectionCut) {
  const fraction = Math.min(1, Math.max(0, cut.fraction));
  const min = bounds.min, max = bounds.max;
  // Project axis -> scene axis and the scene coordinate that grows with the project value.
  const projectMin = cut.axis === "x" ? min.x : cut.axis === "y" ? -max.z : min.y;
  const projectMax = cut.axis === "x" ? max.x : cut.axis === "y" ? -min.z : max.y;
  const positionM = projectMin + (projectMax - projectMin) * fraction;
  const towardLower = cut.axis === "x" ? new THREE.Vector3(-1, 0, 0) : cut.axis === "y" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, -1, 0);
  // Default keeps the part with LOWER project coordinate (hides what lies beyond the cut).
  const normal = cut.flipped ? towardLower.clone().negate() : towardLower;
  const pointOnPlane = cut.axis === "x" ? new THREE.Vector3(positionM, 0, 0) : cut.axis === "y" ? new THREE.Vector3(0, 0, -positionM) : new THREE.Vector3(0, positionM, 0);
  return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointOnPlane), positionMm: positionM * 1000, rangeMm: [projectMin * 1000, projectMax * 1000] as const };
}

/** Steel finishes are a RENDERING choice only. They do not describe the declared
 * steel grade, coating system or any property used by the analysis. */
export const steelFinishes = ["painted", "galvanized", "raw"] as const;
export type SteelFinish = typeof steelFinishes[number];
export const steelFinishLabels: Record<SteelFinish, string> = { painted: "Aço pintado", galvanized: "Aço galvanizado", raw: "Aço sem acabamento" };
export const steelFinishMaterial: Record<SteelFinish, { metalness: number; roughness: number; envMapIntensity: number; tint: number | null; tintAmount: number }> = {
  painted: { metalness: .35, roughness: .48, envMapIntensity: .9, tint: null, tintAmount: 0 },
  galvanized: { metalness: .92, roughness: .34, envMapIntensity: 1.15, tint: 0xc3cacd, tintAmount: .78 },
  raw: { metalness: .82, roughness: .58, envMapIntensity: .8, tint: 0x54493f, tintAmount: .72 },
};
/** Role colour stays recognisable under every finish: categories remain readable. */
export function finishedRoleColor(roleColor: number, finish: SteelFinish): THREE.Color {
  const spec = steelFinishMaterial[finish], color = new THREE.Color(roleColor);
  return spec.tint === null ? color : color.lerp(new THREE.Color(spec.tint), spec.tintAmount);
}

/** Roof sheet PBR parameters by colour; visual only. */
export const roofSurface: Record<string, { metalness: number; roughness: number }> = {
  graphite: { metalness: .55, roughness: .5 }, silver: { metalness: .9, roughness: .32 },
  white: { metalness: .25, roughness: .55 }, terracotta: { metalness: .3, roughness: .6 },
};
