import { Box3, MathUtils, PerspectiveCamera, Sphere, Vector3 } from "three";

export function fitIsometricCamera(camera: PerspectiveCamera, bounds: Box3) {
  const center = bounds.getCenter(new Vector3()), radius = Math.max(bounds.getBoundingSphere(new Sphere()).radius, .5);
  const halfVertical = MathUtils.degToRad(camera.fov) / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
  const distance = 1.12 * radius / Math.sin(Math.min(halfVertical, halfHorizontal));
  camera.position.copy(center).add(new Vector3(1, .8, 1).normalize().multiplyScalar(distance));
  camera.lookAt(center); camera.updateMatrixWorld();
  return center;
}
