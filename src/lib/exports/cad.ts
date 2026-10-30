import { DxfWriter, Units, point3d } from "@tarikjabiri/dxf";
import type { Project } from "@/domain/models";
import { generateStructure, structureViews } from "@/domain/calculations/structure";
import { PRELIMINARY_NOTICE, type ViewName } from "@/domain/calculations/geometry";

export function createStructureDxf(project: Project): string {
  const result = generateStructure(project);
  if (!result.model) throw new Error("Geometria indisponível para exportação.");
  const dxf = new DxfWriter(); dxf.setUnits(Units.Millimeters);
  const colors = { column: 30, topChord: 3, bottomChord: 3, web: 8, purlin: 4 };
  for (const [role, color] of Object.entries(colors)) dxf.addLayer(role, color);
  dxf.addLayer("IDENTIFICACAO", 7); dxf.addLayer("PRELIMINAR", 1);
  const nodes = new Map(result.model.nodes.map(n => [n.id, n]));
  for (const p of result.model.pieces) {
    const a = nodes.get(p.start)!, b = nodes.get(p.end)!;
    dxf.addLine(point3d(a.x, a.y, a.z), point3d(b.x, b.y, b.z), { layerName: p.role });
    dxf.addText(point3d((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), 60, p.id, { layerName: "IDENTIFICACAO" });
  }
  dxf.addText(point3d(0, -1000, 0), 150, "PRELIMINAR - NAO UTILIZAR PARA EXECUCAO OU CORTE", { layerName: "PRELIMINAR" });
  dxf.addText(point3d(0, -1300, 0), 100, `Projeto ${project.id} / revisao geometrica ${project.roof.revision} / unidades mm`, { layerName: "PRELIMINAR" });
  return dxf.stringify();
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
export function createStructureSvg(project: Project, view: ViewName = "front") {
  const result = generateStructure(project), geometry = structureViews(project, result);
  if (!geometry) throw new Error("Geometria indisponível para exportação.");
  const { bounds: b, entities } = geometry.views[view], height = b.maxY - b.minY, width = b.maxX - b.minX;
  const font = Math.max(width, height) * .018;
  const body = entities.map(e => e.type === "line" ? `<line x1="${e.a.x}" y1="${-e.a.y}" x2="${e.b.x}" y2="${-e.b.y}" data-piece="${escape(e.pieceId ?? "")}"/>` : e.type === "circle" ? `<circle cx="${e.at.x}" cy="${-e.at.y}" r="${e.radius}"/>` : `<text x="${e.at.x}" y="${-e.at.y}" font-size="${e.height}" stroke="none" fill="#25372b" text-anchor="middle">${escape(e.text)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX} ${-b.maxY - font * 4} ${width} ${height + font * 5}" role="img"><title>${escape(project.name)} - ${escape(PRELIMINARY_NOTICE)}</title><rect x="${b.minX}" y="${-b.maxY - font * 4}" width="${width}" height="${height + font * 5}" fill="white"/><text x="${b.minX}" y="${-b.maxY - font}" font-size="${font}" fill="#8e3b25">${escape(PRELIMINARY_NOTICE)} · mm · revisão ${project.roof.revision}</text><g fill="none" stroke="#25372b" stroke-width="${Math.max(width, height) / 1500}">${body}</g></svg>`;
}
