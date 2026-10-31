import type { Project } from "./models";
import type { StructureModel } from "./structure";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { spatialRequestSchema, spatialSI, type SpatialRequest } from "./spatial-analysis";

type Point = [number, number, number];
export interface SpatialIssue { code: string; message: string; pieces: string[]; nodes: string[]; }
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a.reduce((s, v, i) => s + v * b[i], 0);
const length = (a: Point) => Math.sqrt(dot(a, a));
export function spatialContacts(model: StructureModel): SpatialIssue[] {
  const issues: SpatialIssue[] = [], nodes = new Map(model.nodes.map(n => [n.id, [n.x, n.y, n.z] as Point]));
  const add = (code: string, message: string, pieces: string[], nodes: string[] = []) => { if (issues.length < 150) issues.push({ code, message, pieces, nodes }); };
  const segments = model.pieces.map(p => ({ p, a: nodes.get(p.start)!, b: nodes.get(p.end)! }));
  let checks = 0;
  for (const { p, a, b } of segments) {
    const d = sub(b, a), dd = dot(d, d);
    if (!dd) { add("ZERO_LENGTH", `${p.id}: barra sem comprimento.`, [p.id]); continue; }
    for (const [id, c] of nodes) {
      if (++checks > 100000) { add("TOPOLOGY_LIMIT", "Inspeção limitada a 100.000 pares; análise bloqueada até revisão externa da topologia.", []); return issues; }
      if (id === p.start || id === p.end) continue;
      const t = dot(sub(c, a), d) / dd;
      if (t <= 0 || t >= 1) continue;
      if (length(sub(sub(c, a), d.map(v => t * v) as Point)) <= 1e-4) add("INTERIOR_CONTACT", `${id} encontra o interior de ${p.id}; conexão e segmentação não declaradas.`, [p.id], [id]);
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    if (++checks > 100000) { add("TOPOLOGY_LIMIT", "Inspeção parcial da topologia; análise bloqueada.", []); return issues; }
    const one = segments[i], two = segments[j], { p, a, b } = one;
    if ([p.start, p.end].some(n => [two.p.start, two.p.end].includes(n))) continue;
    const u = sub(b, a), v = sub(two.b, two.a), w = sub(a, two.a), uu = dot(u, u), vv = dot(v, v), uv = dot(u, v), uw = dot(u, w), vw = dot(v, w), determinant = uu * vv - uv * uv;
    if (Math.abs(determinant) <= 1e-12 * uu * vv) {
      if (uu && length(sub(w, u.map(x => dot(w, u) / uu * x) as Point)) <= 1e-4) {
        const t1 = dot(sub(two.a, a), u) / uu, t2 = dot(sub(two.b, a), u) / uu;
        if (Math.min(1, Math.max(t1, t2)) > Math.max(0, Math.min(t1, t2))) add("OVERLAP", `${p.id} e ${two.p.id}: sobreposição colinear.`, [p.id, two.p.id]);
      }
      continue;
    }
    const s = (uv * vw - vv * uw) / determinant, t = (uu * vw - uv * uw) / determinant;
    const gap = sub(w, v.map(x => t * x) as Point).map((x, k) => x + s * u[k]) as Point;
    if (s > 0 && s < 1 && t > 0 && t < 1 && length(gap) <= 1e-4) add("UNCONNECTED_CROSSING", `${p.id} cruza ${two.p.id} sem nó de ligação.`, [p.id, two.p.id]);
  }
  return issues;
}

function checkMapping(model: StructureModel, parsed: SpatialRequest) {
  const sameIds = (one: string[], two: string[]) => [...one].sort().join("|") === [...two].sort().join("|");
  if (!sameIds(parsed.members.map(m => m.id), model.pieces.map(p => p.id)) || !sameIds(parsed.nodes.map(n => n.id), model.nodes.map(n => n.id))) throw new Error("O modelo físico precisa preservar os IDs de nós e peças desta geometria.");
  for (const member of parsed.members) { const piece = model.pieces.find(p => p.id === member.id)!; if (piece.start !== member.start || piece.end !== member.end) throw new Error(`${member.id}: conectividade alterada sem revisão de geometria.`); }
  if (!parsed.supports.length) throw new Error("Apoios não declarados.");
}
export function spatialReadiness(project: Project, declared?: SpatialRequest, review?: { connections: string; lateralSystem: string }) {
  const model = generateStructure(project).model;
  const issues: SpatialIssue[] = [];
  const add = (code: string, message: string, pieces: string[] = []) => issues.push({ code, message, pieces, nodes: [] });
  if (!model) add("VISUAL_GEOMETRY", "Gere a geometria visual antes de revisar a análise.");
  else {
    issues.push(...spatialContacts(model));
    if (declared) {
      try { checkMapping(model, spatialRequestSchema.parse(declared)); } catch (e) { add("PHYSICAL_DECLARATION", (e as Error).message); }
      if (!review?.connections.trim() || !review?.lateralSystem.trim()) add("CONNECTION_REVIEW", "Revisões de ligações e sistema lateral obrigatórias.");
    } else {
    add("PHYSICAL_PROPERTIES", "Declare materiais E/G/nu e seções A/Iy/Iz/J com fonte e revisão; dimensões 3D e perfis provisórios não fornecem essas propriedades.", model.pieces.map(p => p.id));
    add("CONNECTIONS", "Declare o comportamento e as liberações de cada extremidade; tocar outra barra não comprova ligação.");
    add("SUPPORTS", "Declare apoios UX/UY/UZ/RX/RY/RZ. Bases dos pilares não são engastes automáticos.");
    add("LOAD_PATH", "Declare cargas nodais e seu caminho até os apoios; telhamento, cargas distribuídas e peso próprio não são transformados automaticamente em forças nodais.");
    add("COMBINATIONS", "Declare casos, fontes e coeficientes das combinações. Não há coeficientes normativos presumidos.");
    add("LATERAL_SYSTEM", "Declare contraventamentos ou justifique a estabilidade por ação de pórtico; nenhum sistema lateral foi aprovado.");
    }
  }
  return { visual_ready: !!model, analysis_ready: !!model && !!declared && !issues.length, issues };
}

// Deliberate physical model: preserves piece IDs and requires EXACT endpoint
// connectivity. Any contact requiring a different discretization blocks mapping.
export async function buildSpatialRequest(project: Project, declared: SpatialRequest, review: { connections: string; lateralSystem: string }): Promise<SpatialRequest> {
  const model = generateStructure(project).model;
  if (!model) throw new Error("Geometria indisponível.");
  if (!review.connections.trim() || !review.lateralSystem.trim()) throw new Error("Revisões de ligações e sistema lateral obrigatórias.");
  const contacts = spatialContacts(model); if (contacts.length) throw new Error(`Topologia pendente: ${contacts[0].message}`);
  const parsed = spatialRequestSchema.parse(declared);
  checkMapping(model, parsed);
  const canonicalBasis = JSON.stringify({ project: structureSignature(project), connections: review.connections, lateralSystem: review.lateralSystem });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalBasis));
  const revision = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  let declaredSource = parsed.project.source;
  try {
    const previous: unknown = JSON.parse(declaredSource);
    if (previous && typeof previous === "object" && !Array.isArray(previous)) {
      const fields = previous as Record<string, unknown>;
      if (Object.keys(fields).sort().join("|") === "connections|declared_source|lateral_system" && typeof fields.declared_source === "string" && fields.declared_source.trim() && typeof fields.connections === "string" && typeof fields.lateral_system === "string") declaredSource = fields.declared_source;
    }
  } catch { /* Plain provenance text, not a previously bound review. */ }
  const source = JSON.stringify({ declared_source: declaredSource, connections: review.connections, lateral_system: review.lateralSystem });
  return spatialRequestSchema.parse({ ...parsed, project: { id: project.id, revision, source }, nodes: model.nodes.map(n => ({ id: n.id, x_m: spatialSI.metres(n.x), y_m: spatialSI.metres(n.y), z_m: spatialSI.metres(n.z) })) });
}
