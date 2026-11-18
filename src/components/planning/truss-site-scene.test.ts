import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createTrussSiteScene } from "./truss-site-scene";
import { tomTrussDefaults } from "@/domain/truss-editor";

describe("contexto arquitetônico 3D do editor de tesouras (não estrutural)", () => {
  it("uma água conserva a geometria comercial e não cria vínculos", () => {
    const site = createTrussSiteScene(tomTrussDefaults());
    try {
      expect(site.root.userData).toMatchObject({ preliminary: true, slopeCount: 1, gutterCount: 1, roofCount: 1, anchorCount: 3 });
      expect(site.root.name).toContain("não é ligação estrutural");
      const box = new THREE.Box3().setFromObject(site.root);
      expect(box.min.y).toBeCloseTo(0, 4);
    } finally { site.dispose(); }
  });

  it("duas águas mostram dois beirais e duas faces com seis posições de chapa", () => {
    const t = { ...tomTrussDefaults(), roofKind: "two-slopes" as const, purlinStepMm: 650 };
    const site = createTrussSiteScene(t);
    try {
      expect(site.root.userData).toMatchObject({ preliminary: true, slopeCount: 2, wallCount: 2, gutterCount: 2, roofCount: 2, anchorCount: 6 });
      const roofs = site.root.children.filter(c => c.name.startsWith("Cobertura preliminar"));
      expect(roofs).toHaveLength(2);
      const box = new THREE.Box3().setFromObject(site.root);
      expect(box.min.x).toBeLessThan(0.3);
      expect(box.max.x).toBeGreaterThan(7.7);
      expect(box.min.y).toBeCloseTo(0, 4);
    } finally { site.dispose(); }
  });

  it("representa duas peças de telha por água, com sobreposição apenas visual", () => {
    const base = tomTrussDefaults(), t = { ...base, roofKind: "two-slopes" as const, purlinStepMm: 650,
      sheet: { ...base.sheet, piecesPerSlope: 2, overlapMm: 250 } };
    const site = createTrussSiteScene(t);
    try {
      expect(site.root.userData).toMatchObject({ roofCount: 2, roofPanelCount: 4 });
      expect(site.root.children.filter(c => c.name.startsWith("Cobertura preliminar"))).toHaveLength(4);
    } finally { site.dispose(); }
  });
});
