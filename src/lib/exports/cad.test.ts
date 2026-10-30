import { expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { mkdirSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createStructureDxf, createStructureSvg } from "./cad";
import { createCuttingSimulationPdf } from "./cutting";
import { planningExample } from "@/domain/planning-example";
import { generateStructure } from "@/domain/calculations/structure";

it("reabre DXF com leitor independente, conserva coordenadas 3D/mm e não injeta texto em SVG", () => {
  const p = planningExample(); p.name = '<script>alert("X")</script>'; p.planning!.typology = "gable"; p.planning!.overhangStartM = .5;
  const model = generateStructure(p).model!, content = createStructureDxf(p), parsed = new DxfParser().parseSync(content)!;
  expect(parsed.header.$INSUNITS).toBe(4);
  const lines = parsed.entities.filter(e => e.type === "LINE"); expect(lines).toHaveLength(model.pieces.length);
  expect(parsed.entities.some(e => e.type === "TEXT")).toBe(true);
  const svg = createStructureSvg(p); expect(svg).not.toContain("<script>"); expect(svg).toContain("&lt;script&gt;"); expect(svg).toContain("NÃO UTILIZAR");
  mkdirSync("test-results/cad", { recursive: true }); writeFileSync("test-results/cad/structure.dxf", content);
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  writeFileSync("test-results/cad/expected.json", JSON.stringify(model.pieces.map(p => [nodes.get(p.start), nodes.get(p.end)])));
});
it("reabre PDF da simulação sem confundir comprimentos geométricos com ordem de corte", async () => {
  const p = planningExample(); p.workspace.cutting = { kerfMm: 3, endTrimMm: 10, minimumRemnantMm: 500, useFabrication: false };
  const task = getDocument({ data: new Uint8Array(await createCuttingSimulationPdf(p)), useSystemFonts: true }), doc = await task.promise;
  let text = ""; for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(x => "str" in x ? x.str : "").join(" ");
  expect(text).toContain("NÃO LIBERADA PARA CORTE"); expect(text).toContain("heurística"); expect(text).toContain("P1"); expect(text).toContain("geométricos"); await task.destroy();
});
