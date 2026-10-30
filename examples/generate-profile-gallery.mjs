// Run with Node 24: node examples/generate-profile-gallery.mjs
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { resolveSection, familyLabels } from "../src/domain/profile-section.ts";
import { createSectionGeometry, sectionShape } from "../src/components/planning/profile-geometry.ts";

const examples = JSON.parse(readFileSync(new URL("./perfis-3d.json", import.meta.url), "utf8"));
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1010" viewBox="0 0 900 1010" role="img" aria-labelledby="title desc">',
  '<title id="title">JPN · seis seções ideais e suas extrusões</title><desc id="desc">Exemplos sintéticos verificáveis pelo arquivo perfis-3d.json e testes de geometria. Milímetros. Não são produtos comerciais.</desc>',
  '<rect width="900" height="1010" fill="#f6f8f2"/><g font-family="Arial,sans-serif" fill="#293b32"><text x="30" y="38" font-size="23" font-weight="bold">JPN · perfis 3D</text><text x="30" y="65" font-size="14">EXEMPLOS SINTÉTICOS · seções ideais · dimensões em mm</text>'];
const camera = new THREE.OrthographicCamera(-.19, .19, .19, -.19, .01, 10);
camera.position.set(.3, .2, .9); camera.lookAt(0, 0, .05); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
examples.sections.forEach((v, i) => {
  const { thicknessMm, expectedAreaMm2, ...visualSection } = v;
  const s = resolveSection({ visualSection, data: { thicknessMm } }).section;
  const x = 20 + (i % 2) * 445, y = 90 + Math.floor(i / 2) * 290;
  parts.push(`<rect x="${x}" y="${y}" width="425" height="275" rx="10" fill="white" stroke="#d5decf"/><text x="${x + 18}" y="${y + 29}" font-size="18" font-weight="bold">${familyLabels[s.family]}</text>`);
  const shape = sectionShape(s), points = [shape.getPoints(), ...shape.holes.map(h => h.getPoints())];
  const scale = 140 / Math.max(s.width, s.height) * 1000;
  const path = points.map(contour => contour.map((p, j) => `${j ? "L" : "M"}${(x + 105 + p.x * scale).toFixed(2)},${(y + 125 - p.y * scale).toFixed(2)}`).join(" ") + "Z").join(" ");
  parts.push(`<path d="${path}" fill="#557664" fill-rule="evenodd" stroke="#293b32" stroke-width=".7"/>`);
  const geometry = createSectionGeometry(s), position = geometry.getAttribute("position"), faces = [];
  for (let k = 0; k < position.count; k += 3) {
    const triangle = [0, 1, 2].map(n => new THREE.Vector3().fromBufferAttribute(position, k + n).multiply(new THREE.Vector3(1, 1, .1)));
    const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0])).normalize();
    const center = triangle.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(3);
    if (normal.dot(camera.position.clone().sub(center)) <= 0) continue;
    const shade = .65 + .3 * Math.max(0, normal.dot(new THREE.Vector3(.4, .8, .6).normalize()));
    const color = new THREE.Color("#729487").multiplyScalar(shade).getStyle();
    const projected = triangle.map(p => p.clone().project(camera));
    faces.push({ depth: projected.reduce((sum, p) => sum + p.z, 0), svg: `<polygon points="${projected.map(p => `${(x + 310 + p.x * 100).toFixed(2)},${(y + 125 - p.y * 100).toFixed(2)}`).join(" ")}" fill="${color}" stroke="${color}" stroke-width=".25"/>` });
  }
  faces.sort((a, b) => b.depth - a.depth).forEach(f => parts.push(f.svg)); geometry.dispose();
  const label = s.family === "i" ? `h ${s.height} · b ${s.width} · alma ${s.t} · mesas ${s.tf}` : `${s.width} × ${s.height} · t ${s.t}${s.family === "channel" ? " · abertura +X" : ""}`;
  parts.push(`<text x="${x + 18}" y="${y + 215}" font-size="14">${label}</text><text x="${x + 18}" y="${y + 239}" font-size="12">Seção frontal / extrusão de 100 mm · A ideal ${expectedAreaMm2.toFixed(2)} mm²</text>`);
});
parts.push('<text x="30" y="987" font-size="13">Vazios abertos nas extremidades · sem raios ou filetes · representação sem verificação resistente</text></g></svg>');
writeFileSync(new URL("./perfis-3d.svg", import.meta.url), parts.join("\n"));
console.log("examples/perfis-3d.svg regenerated from the production geometry generator");
