import { z } from "zod";
import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";

const n = z.number().finite(), id = z.string().min(1).max(100);
export const trussRequestSchema = z.object({
  schema_version: z.literal("jpn.truss/1"), units: z.literal("SI"),
  nodes: z.array(z.object({ id, x_m: n, y_m: n }).strict()).min(2).max(200),
  members: z.array(z.object({ id, start: id, end: id, e_pa: n.positive(), area_m2: n.positive() }).strict()).min(1).max(1000),
  supports: z.array(z.object({ node: id, ux_m: n.nullable(), uy_m: n.nullable() }).strict()).max(200),
  loads: z.array(z.object({ node: id, fx_n: n, fy_n: n }).strict()).max(1000),
}).strict();
export type TrussRequest = z.infer<typeof trussRequestSchema>;
export const trussResultSchema = z.object({
  schema_version: z.literal("jpn.truss-result/1"), status: z.literal("analyzed_experimental"), units: z.literal("SI"), input_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  solver: z.object({ name: z.string(), version: z.string(), numpy: z.string(), scipy: z.string() }).strict(), assumptions: z.array(z.string()),
  nodes: z.record(id, z.object({ ux_m: n, uy_m: n, rx_n: n, ry_n: n }).strict()),
  members: z.record(id, z.object({ length_m: n.positive(), extension_m: n, strain: n, axial_n: n }).strict()),
  diagnostics: z.record(z.string(), n),
}).strict();
export type TrussResult = z.infer<typeof trussResultSchema>;

export function trussGeometry(project: Project) {
  const result = generateStructure(project);
  if (!result.model) throw new Error("Gere uma geometria válida antes de configurar a tesoura.");
  const pieces = result.model.pieces.filter(p => p.id.startsWith("T1-"));
  const ids = new Set(pieces.flatMap(p => [p.start, p.end]));
  const across = project.roof.fall.startsWith("width");
  return { pieces, nodes: result.model.nodes.filter(n => ids.has(n.id)).map(n => ({ id: n.id, xMm: across ? n.x : n.y, yMm: n.z })) };
}
export function buildTrussRequest(project: Project): TrussRequest {
  const config = project.workspace.analysis;
  if (!config?.articulated) throw new Error("Confirme a hipótese de tesoura isolada com ligações articuladas e cargas somente nos nós.");
  if (config.signature !== structureSignature(project)) throw new Error("Geometria ou perfis alterados. Reconfigure os nós, cargas e apoios.");
  const { nodes, pieces } = trussGeometry(project);
  const members = pieces.map(p => {
    const d = p.profile.data;
    if (!d?.areaCm2 || !d.elasticModulusGpa || !p.profile.source.trim() || !d.sourceDate.trim() || (d.origin === "calculated" && !d.calculationReference.trim())) throw new Error(`${p.id}: informe E, área da seção, fonte/data e referência das propriedades calculadas, quando aplicável.`);
    return { id: p.id, start: p.start, end: p.end, e_pa: d.elasticModulusGpa * 1e9, area_m2: d.areaCm2 * 1e-4 };
  });
  const ids = new Set(nodes.map(n => n.id));
  if (config.supports.some(s => !ids.has(s.node)) || config.loads.some(l => !ids.has(l.node))) throw new Error("Carga ou apoio referencia nó fora da tesoura isolada.");
  if (config.loads.some(l => l.fxKn === null || l.fyKn === null)) throw new Error("Informe as duas componentes de cada carga; use zero explicitamente quando não houver força naquela direção.");
  return trussRequestSchema.parse({ schema_version: "jpn.truss/1", units: "SI", nodes: nodes.map(n => ({ id: n.id, x_m: n.xMm / 1000, y_m: n.yMm / 1000 })), members,
    supports: config.supports.map(s => ({ node: s.node, ux_m: s.uxMm === null ? null : s.uxMm / 1000, uy_m: s.uyMm === null ? null : s.uyMm / 1000 })), loads: config.loads.map(l => ({ node: l.node, fx_n: l.fxKn! * 1000, fy_n: l.fyKn! * 1000 })) });
}
