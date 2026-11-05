import { z } from "zod";
import type { PhysicalGeometry } from "./structure";

export const CONNECTIVITY_LIMITS = { nodes: 250, members: 600 } as const;
export const connectivityDeclarationSchema = z.object({
  version: z.literal(1), geometrySignature: z.string().max(100000),
  reviewSource: z.string().min(1).max(1000).refine(s => !!s.trim()),
  junctions: z.array(z.object({ nodeId: z.string().min(1).max(100), pieceIds: z.array(z.string().min(1).max(100)).min(2).max(600), decision: z.enum(["connect", "separate"]) }).strict()).max(250),
}).strict();
export type ConnectivityDeclaration = z.infer<typeof connectivityDeclarationSchema>;
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (v: V) => Math.sqrt(dot(v, v));
const scaled = (v: V, t: number): V => v.map(x => x * t) as V;
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const toleranceMm = 1e-4;
export class ConnectivityError extends Error {
  constructor(public code: string, message: string, public pieceIds: string[] = [], public nodeIds: string[] = []) { super(message); }
}
function fail(code: string, message: string, pieces: string[] = [], nodes: string[] = []): never { throw new ConnectivityError(code, message, pieces, nodes); }

export function inspectConnectivity(model: PhysicalGeometry) {
  if (model.units !== "mm") fail("UNSUPPORTED_UNITS", "Geometria deve declarar unidade mm; nenhuma conversão implícita foi aplicada.");
  if (model.nodes.length > CONNECTIVITY_LIMITS.nodes || model.pieces.length > CONNECTIVITY_LIMITS.members) fail("MODEL_LIMIT", "Geometria excede 250 nós ou 600 peças, antes da segmentação.");
  const points = new Map(model.nodes.map(n => [n.id, [n.x, n.y, n.z] as V]));
  if (points.size !== model.nodes.length || new Set(model.pieces.map(p => p.id)).size !== model.pieces.length) fail("DUPLICATE_ID", "Nós ou peças com IDs repetidos.");
  for (const n of model.nodes) if (![n.x, n.y, n.z].every(Number.isFinite)) fail("INVALID_GEOMETRY", "Coordenada não finita.", [], [n.id]);
  for (let i = 0; i < model.nodes.length; i++) for (let j = i + 1; j < model.nodes.length; j++) {
    const a = model.nodes[i], b = model.nodes[j];
    if (norm(sub(points.get(a.id)!, points.get(b.id)!)) <= toleranceMm) fail("COINCIDENT_NODES", "Nós coincidentes exigem revisão; nenhum ID foi unido automaticamente.", [], [a.id, b.id]);
  }
  const memberships = new Map<string, { pieceIds: string[]; interiorPieceIds: string[] }>();
  const cuts = new Map<string, { nodeId: string; t: number }[]>();
  const segments = model.pieces.map(piece => {
    if (!Number.isFinite(piece.lengthMm) || piece.lengthMm <= 0) fail("INVALID_GEOMETRY", `Comprimento original inválido em ${piece.id}.`, [piece.id]);
    const a = points.get(piece.start), b = points.get(piece.end);
    if (!a || !b || norm(sub(b, a)) < .01) fail("INVALID_GEOMETRY", `Extremos inválidos em ${piece.id}.`, [piece.id]);
    const direction = sub(b, a), dd = dot(direction, direction);
    const positions: { nodeId: string; t: number }[] = [];
    for (const [nodeId, p] of points) {
      const t = nodeId === piece.start ? 0 : nodeId === piece.end ? 1 : dot(sub(p, a), direction) / dd;
      if (t < 0 || t > 1 || norm(sub(sub(p, a), scaled(direction, t))) > toleranceMm) continue;
      positions.push({ nodeId, t });
      const entry = memberships.get(nodeId) ?? { pieceIds: [], interiorPieceIds: [] };
      entry.pieceIds.push(piece.id); if (t > 0 && t < 1) entry.interiorPieceIds.push(piece.id);
      memberships.set(nodeId, entry);
    }
    cuts.set(piece.id, positions.sort((x, y) => x.t - y.t || x.nodeId.localeCompare(y.nodeId)));
    return { piece, a, b, direction, dd };
  });
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const one = segments[i], two = segments[j], u = one.direction, v = two.direction, w = sub(one.a, two.a);
    // Bounding boxes reject distant members before the exact line test.
    if ([0, 1, 2].some(k => Math.max(one.a[k], one.b[k]) + toleranceMm < Math.min(two.a[k], two.b[k]) || Math.max(two.a[k], two.b[k]) + toleranceMm < Math.min(one.a[k], one.b[k]))) continue;
    // Cross products avoid cancellation of |u|²|v|²-(u·v)² for near-parallel lines.
    const normal = cross(u, v), determinant = dot(normal, normal);
    if (determinant <= 1e-24 * one.dd * two.dd) {
      if (norm(sub(w, scaled(u, dot(w, u) / one.dd))) > toleranceMm) continue;
      const t1 = dot(sub(two.a, one.a), u) / one.dd, t2 = dot(sub(two.b, one.a), u) / one.dd;
      if ((Math.min(1, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2))) * Math.sqrt(one.dd) > toleranceMm) fail("OVERLAP", "Peças colineares sobrepostas não são consolidadas.", [one.piece.id, two.piece.id]);
      continue;
    }
    const s = dot(cross(scaled(w, -1), v), normal) / determinant, t = dot(cross(scaled(w, -1), u), normal) / determinant;
    if (s < 0 || s > 1 || t < 0 || t > 1 || norm(sub(sub(w, scaled(v, t)), scaled(u, -s))) > toleranceMm) continue;
    const shared = [...memberships.values()].some(m => m.pieceIds.includes(one.piece.id) && m.pieceIds.includes(two.piece.id));
    if (!shared) fail("UNRESOLVED_CROSSING", "Cruzamento sem nó original: requer modelagem explícita adicional.", [one.piece.id, two.piece.id]);
  }
  const junctions = [...memberships.entries()].filter(([, m]) => m.pieceIds.length > 1).map(([nodeId, m]) => ({ nodeId, pieceIds: m.pieceIds.sort(), interiorPieceIds: m.interiorPieceIds.sort() })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const adjacent = new Map(model.nodes.map(n => [n.id, new Set<string>()]));
  for (const positions of cuts.values()) for (let i = 1; i < positions.length; i++) {
    adjacent.get(positions[i - 1].nodeId)!.add(positions[i].nodeId);
    adjacent.get(positions[i].nodeId)!.add(positions[i - 1].nodeId);
  }
  const visited = new Set<string>(), stack = model.nodes.length ? [model.nodes[0].id] : [];
  while (stack.length) { const id = stack.pop()!; if (!visited.has(id)) { visited.add(id); stack.push(...adjacent.get(id)!); } }
  if (visited.size !== model.nodes.length) fail("DISCONNECTED_GEOMETRY", "Componentes desconectados ou nós órfãos: não serão unidos ou estabilizados automaticamente.");
  return { junctions, cuts };
}

export function discretizeGeometry(model: PhysicalGeometry, declaration: ConnectivityDeclaration, geometrySignature: string) {
  const parsed = connectivityDeclarationSchema.safeParse(declaration);
  if (!parsed.success) fail("CONNECTIVITY_PENDING", "Declare as conexões e sua fonte antes de segmentar.");
  const reviewed = parsed.data;
  if (reviewed.geometrySignature !== geometrySignature) fail("STALE_CONNECTIVITY", "Conectividade vinculada a outra geometria.");
  const inspected = inspectConnectivity(model), decisions = new Map(reviewed.junctions.map(j => [j.nodeId, j]));
  if (decisions.size !== reviewed.junctions.length) fail("DUPLICATE_JUNCTION", "Juntas com decisões duplicadas.");
  const equal = (a: string[], b: string[]) => [...a].sort().join("|") === [...b].sort().join("|");
  for (const joint of inspected.junctions) {
    const decision = decisions.get(joint.nodeId);
    if (!decision || !equal(decision.pieceIds, joint.pieceIds)) fail("JUNCTION_PENDING", `Revise as peças da junta ${joint.nodeId}.`, joint.pieceIds, [joint.nodeId]);
    if (decision.decision !== "connect") fail("SEPARATE_JUNCTION_UNSUPPORTED", "Contato declarado independente: não foi unido; partições de nós coincidentes ficam para a próxima etapa.", joint.pieceIds, [joint.nodeId]);
  }
  if (reviewed.junctions.some(j => !inspected.junctions.some(k => k.nodeId === j.nodeId))) fail("ORPHAN_JUNCTION", "Decisão refere uma junta inexistente.");
  const positions = new Map(model.nodes.map(n => [n.id, [n.x, n.y, n.z] as V]));
  const members: { id: string; originalId: string; start: string; end: string; t0: number; t1: number; lengthMm: number; originalStart: boolean; originalEnd: boolean }[] = [];
  for (const piece of model.pieces) {
    const cuts = inspected.cuts.get(piece.id)!;
    let sum = 0;
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], lengthMm = norm(sub(positions.get(b.nodeId)!, positions.get(a.nodeId)!));
      if (lengthMm < .01) fail("SEGMENT_TOO_SHORT", "Segmentação abaixo de 0,01 mm; revise a geometria.", [piece.id]);
      const id = cuts.length === 2 ? piece.id : `${piece.id}:S${i + 1}`;
      if (id.length > 80) fail("ID_LIMIT", "ID rastreável excede o contrato; não foi truncado.", [piece.id]);
      members.push({ id, originalId: piece.id, start: a.nodeId, end: b.nodeId, t0: a.t, t1: b.t, lengthMm, originalStart: i === 0, originalEnd: i === cuts.length - 2 }); sum += lengthMm;
    }
    if (Math.abs(sum - piece.lengthMm) > 1e-6 + piece.lengthMm * 1e-10) fail("LENGTH_MISMATCH", "Segmentação não conserva o comprimento original.", [piece.id]);
  }
  if (members.length > CONNECTIVITY_LIMITS.members || new Set(members.map(m => m.id)).size !== members.length) fail("MODEL_LIMIT", "Mais de 600 segmentos ou colisão de IDs gerados.");
  return { schema_version: "jpn.geometry-physical-map/1" as const, units: "mm" as const, geometrySignature, nodes: model.nodes.map(n => ({ ...n })), junctions: inspected.junctions, members };
}
