import { expect, it } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { fitIsometricCamera } from "./camera-fit";

it.each([.5, .8, 1, 2, 3])("enquadra todos os extremos da estrutura na razão de tela %s", aspect => {
  const camera = new PerspectiveCamera(40, aspect, .01, 100000), bounds = new Box3(new Vector3(0, 0, -20), new Vector3(10, 5, 0));
  fitIsometricCamera(camera, bounds);
  for (const x of [0, 10]) for (const y of [0, 5]) for (const z of [-20, 0]) { const projected = new Vector3(x, y, z).project(camera); expect(Math.abs(projected.x)).toBeLessThan(1); expect(Math.abs(projected.y)).toBeLessThan(1); }
});
