import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { reliefPolyline, reliefProfiles, roofReliefGeometry } from "./roof-relief";

// F5: telha ondulada é só visual; o relevo fica dentro da altura declarada e a área não explode.
describe("telha ondulada (visual)", () => {
  const profile = reliefProfiles.corrugated;
  it("perfil senoidal: começa e repete em zero, pico na altura declarada", () => {
    expect(profile.points[0]).toEqual([0, 0]);
    expect(Math.max(...profile.points.map(([, h]) => h))).toBeCloseTo(profile.heightM, 9);
    expect(profile.points.every(([s]) => s >= 0 && s < profile.pitchM)).toBe(true);
  });
  it("polilinha cobre o comprimento todo e termina no plano", () => {
    const line = reliefPolyline(profile, 1.2);
    expect(line.at(-1)).toEqual([1.2, 0]);
    expect(line.every(([, h]) => h >= 0 && h <= profile.heightM + 1e-12)).toBe(true);
  });
  it("geometria finita sobre uma água de 4 × 6 m", () => {
    const corners = [new THREE.Vector3(0, 3, 0), new THREE.Vector3(4, 3.4, 0), new THREE.Vector3(4, 3.4, -6), new THREE.Vector3(0, 3, -6)];
    const g = roofReliefGeometry(corners, "corrugated", 0, 0);
    const position = g.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i++) expect(Number.isFinite(position.getY(i))).toBe(true);
  });
});
