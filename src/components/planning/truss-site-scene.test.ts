import { describe, expect, it } from "vitest";
import { tomTrussDefaults } from "@/domain/truss-editor";
import { createTrussSiteScene } from "./truss-site-scene";

describe("contexto 3D preliminar de tesouras", () => {
  it("distingue uma e duas águas e os dois beirais sem alterar o modelo resistente", () => {
    for (const count of [1, 2] as const) {
      const t = { ...tomTrussDefaults(), roofKind: count === 1 ? "one-slope" as const : "two-slopes" as const };
      const scene = createTrussSiteScene(t);
      expect(scene.root.userData.preliminary).toBe(true);
      expect(scene.root.userData.roofCount).toBe(count);
      expect(scene.root.userData.gutterCount).toBe(count);
      expect(scene.root.userData.anchorCount).toBe(count * t.trusses);
      expect(scene.root.children.filter(mesh => mesh.name.startsWith("Cobertura preliminar"))).toHaveLength(count);
      scene.dispose();
    }
  });
});
