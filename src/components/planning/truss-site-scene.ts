/**
 * Apenas CONTEXTO VISUAL do editor de tesouras.
 * Não cria peças estruturais, vínculos, materiais resistentes ou capacidades.
 * A geometria portante permanece exclusivamente no modelo declarado JPN.
 */
import * as THREE from "three";
import type { TrussEditor } from "@/domain/truss-editor";
import { heightAt, slopeCount, tipOffsetMm, trussLengthMm } from "@/domain/truss-editor";

export function createTrussSiteScene(t: TrussEditor) {
  const root = new THREE.Group();
  root.name = "Contexto arquitetônico preliminar — não é ligação estrutural";
  const S = slopeCount(t), L = trussLengthMm(t), off = tipOffsetMm(t), span = t.spanMm / 1000;
  const len = t.lengthMm / 1000, floorZ = t.supportZMm / 1000;
  const materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [];
  const addBox = (name: string, sizes: [number, number, number], pos: [number, number, number], color: number, opacity = 1) => {
    const geometry = new THREE.BoxGeometry(...sizes);
    const material = new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, roughness: .94 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.set(...pos); mesh.castShadow = false; mesh.receiveShadow = false;
    geometries.push(geometry); materials.push(material); root.add(mesh);
    return mesh;
  };
  const wallThickness = t.walls.thicknessMm / 1000, onWalls = t.support !== "columns";
  // Tesoura sobre pilares: os pilares são peças do modelo; muros, calhas e chapas de muro não se aplicam.
  if (onWalls) for (const [x, height, side] of [[0, t.walls.lowMm / 1000, "esquerdo"], [span, (S === 2 ? t.walls.lowMm : t.walls.highMm) / 1000, "direito"]] as const) {
    if (height > 0) addBox("Muro " + side + " — referência arquitetônica", [wallThickness, height, len],
      [x, height / 2, -len / 2], 0xb8a994, .42);
  }
  // Calhas U simplificadas nas bordas, comprimento real declarado; sem dimensionamento hidráulico.
  const gutterWidth = t.gutter.widthMm / 1000, small = t.gutter.lowSideMm / 1000, large = t.gutter.highSideMm / 1000;
  const gutterXs = !onWalls ? [] : S === 2 ? [t.gutter.supportMm / 1000 + gutterWidth / 2, span - t.gutter.supportMm / 1000 - gutterWidth / 2]
    : [t.gutter.supportMm / 1000 + gutterWidth / 2];
  for (let i = 0; i < gutterXs.length; i++) {
    const x = gutterXs[i], thickness = .018, y = floorZ - .06;
    addBox("Calha " + (i + 1) + " base visual", [Math.max(gutterWidth, thickness), thickness, len], [x, y, -len / 2], 0x3b81ac, .9);
    addBox("Calha " + (i + 1) + " lateral baixa", [thickness, Math.max(small, thickness), len],
      [x - gutterWidth / 2, y + small / 2, -len / 2], 0x3b81ac, .9);
    addBox("Calha " + (i + 1) + " lateral alta", [thickness, Math.max(large, thickness), len],
      [x + gutterWidth / 2, y + large / 2, -len / 2], 0x3b81ac, .9);
  }
  // Chapas e chumbadores são MARCADORES VISUAIS, não detalhes executivos.
  const anchorsX = !onWalls ? [] : S === 2 ? [off / 1000, (off + 2 * L) / 1000] : [(off + L) / 1000];
  const anchorY = floorZ + Math.max(t.anchor.plateHeightMm / 2000, .04);
  for (const x of anchorsX) for (let i = 0; i < t.trusses; i++) {
    const y = -len * i / (t.trusses - 1);
    if (t.anchor.plateWidthMm > 0 && t.anchor.plateHeightMm > 0) {
      addBox("Chapa declarada — sem resistência verificada", [.025, t.anchor.plateHeightMm / 1000, t.anchor.plateWidthMm / 1000],
        [x, anchorY, y], 0xc55d2d, .94);
    }
    for (let b = 0; b < Math.min(t.anchor.boltsPerSupport, 4); b++) {
      const geometry = new THREE.CylinderGeometry(.009, .009, Math.max(.01, t.anchor.boltLengthMm / 1000), 8);
      const material = new THREE.MeshStandardMaterial({ color: 0x7c5544, roughness: .6 });
      const bolt = new THREE.Mesh(geometry, material);
      bolt.name = "Representação simplificada de chumbador (até quatro visíveis)";
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(x, anchorY + (b - (Math.min(t.anchor.boltsPerSupport, 4) - 1) / 2) * .036, y);
      geometries.push(geometry); materials.push(material); root.add(bolt);
    }
  }
  const roofMesh = (name: string, x0: number, x1: number, z0: number, z1: number) => {
    const points = new Float32Array([
      x0, z0, 0, x1, z1, 0, x1, z1, -len,
      x0, z0, 0, x1, z1, -len, x0, z0, -len,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0x6d8795, side: THREE.DoubleSide, transparent: true, opacity: .23, depthWrite: false, metalness: .05, roughness: .92 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    geometries.push(geometry); materials.push(material); root.add(mesh);
  };
  // Peças por água, com sobreposição projetada na inclinação. Apenas leitura visual,
  // não é paginação de chapas para fabricação nem plano de montagem.
  const roofPanels = (name: string, x0: number, x1: number, z0: number, z1: number) => {
    const count = t.sheet.piecesPerSlope, run = Math.abs(x1 - x0);
    if (run < 1e-6) return;
    const inclination = Math.hypot(run, z1 - z0) / run;
    const overlap = Math.min(t.sheet.overlapMm / 1000 / inclination, run / (count * 2));
    const panelRun = (run + (count - 1) * overlap) / count;
    const direction = Math.sign(x1 - x0);
    const zAt = (x: number) => z0 + (z1 - z0) * (x - x0) / (x1 - x0);
    for (let i = 0; i < count; i++) {
      const a = x0 + direction * i * (panelRun - overlap), b = a + direction * panelRun;
      roofMesh(`${name} — trecho ${i + 1}/${count}`, a, b, zAt(a), zAt(b));
    }
  };
  const roofL = (off - t.sheet.beyondTipMm) / 1000, ridgeX = (off + L) / 1000;
  const leftEndZ = (t.supportZMm + heightAt(t, -t.sheet.beyondTipMm)) / 1000 + .05;
  const ridgeZ = (t.supportZMm + heightAt(t, L)) / 1000 + .05;
  roofPanels("Cobertura preliminar água 1", roofL, S === 2 ? ridgeX : span,
    leftEndZ, S === 2 ? ridgeZ : (t.supportZMm + heightAt(t, t.spanMm - off)) / 1000 + .05);
  if (S === 2) roofPanels("Cobertura preliminar água 2", ridgeX, (off + 2 * L + t.sheet.beyondTipMm) / 1000, ridgeZ, leftEndZ);
  root.userData = { preliminary: true, slopeCount: S, wallCount: onWalls ? 2 : 0, gutterCount: gutterXs.length, anchorCount: anchorsX.length * t.trusses, roofCount: S, roofPanelCount: S * t.sheet.piecesPerSlope };
  return { root, dispose: () => { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); } };
}
