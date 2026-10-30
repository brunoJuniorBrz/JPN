import { z } from "zod";
import type { Project } from "../models";
import { generateStructure } from "./structure";
import { structureSignature } from "./project-basis";

const inputSchema = z.object({
  stockMm: z.number().finite().positive().max(1000000), kerfMm: z.number().finite().nonnegative().max(1000),
  endTrimMm: z.number().finite().nonnegative().max(100000), minimumRemnantMm: z.number().finite().nonnegative().max(1000000),
  pieces: z.array(z.object({ id: z.string().min(1), lengthMm: z.number().finite().positive().max(1000000) }).strict()).min(1).max(5000),
}).strict();
export interface CuttingBar { id: string; pieces: { id: string; lengthMm: number }[]; stockMm: number; kerfMm: number; trimMm: number; remainderMm: number; reusableMm: number; wasteMm: number; }
export function packBars(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input);
  if (new Set(data.pieces.map(p => p.id)).size !== data.pieces.length) throw new Error("Peças duplicadas no plano.");
  // Integer micrometres. Consumptions round up; usable stock rounds down.
  const up = (n: number) => Math.ceil(n * 1000), stock = Math.floor(data.stockMm * 1000), kerf = up(data.kerfMm), trim = 2 * up(data.endTrimMm);
  const pieces = data.pieces.map(p => ({ id: p.id, length: up(p.lengthMm) })).sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  if (pieces.some(p => p.length + kerf + trim > stock)) throw new Error("Há peça maior que a barra disponível após cortes e perdas das extremidades. Não há plano calculável.");
  const bins: { remaining: number; pieces: typeof pieces }[] = [];
  for (const piece of pieces) {
    let bin = bins.find(b => b.remaining >= piece.length + kerf);
    if (!bin) { bin = { remaining: stock - trim, pieces: [] }; bins.push(bin); }
    bin.pieces.push(piece); bin.remaining -= piece.length + kerf;
  }
  const bars: CuttingBar[] = bins.map((b, i) => {
    const reusable = b.remaining >= up(data.minimumRemnantMm) ? b.remaining : 0;
    return { id: `B${i + 1}`, pieces: b.pieces.map(p => ({ id: p.id, lengthMm: p.length / 1000 })), stockMm: stock / 1000, kerfMm: b.pieces.length * kerf / 1000, trimMm: trim / 1000, remainderMm: b.remaining / 1000, reusableMm: reusable / 1000, wasteMm: (trim + b.pieces.length * kerf + b.remaining - reusable) / 1000 };
  });
  const totalPieceMm = pieces.reduce((sum, p) => sum + p.length, 0) / 1000;
  return { algorithm: "First Fit Decreasing" as const, optimality: "heuristic" as const, bars, totalPieceMm, totalStockMm: bars.length * stock / 1000, utilizationPercent: 100 * totalPieceMm / (bars.length * stock / 1000) };
}

export function projectCutting(project: Project) {
  const model = generateStructure(project).model, config = project.workspace.cutting, signature = structureSignature(project);
  if (!model) throw new Error("Geometria ainda não calculável.");
  if (config.kerfMm === null || config.endTrimMm === null || config.minimumRemnantMm === null) throw new Error("Informe espessura de corte, perda em cada extremidade e sobra mínima; zero precisa ser explícito.");
  const groups = new Map<string, { profile: string; stockMm: number; pieces: { id: string; lengthMm: number }[] }>();
  for (const p of model.pieces) {
    if (!p.profile.name.trim() || !p.profile.steelGrade.trim() || p.profile.stockLengthM === null) throw new Error(`${p.id}: informe perfil, aço e comprimento comercial para separar corretamente os materiais.`);
    const key = JSON.stringify(p.profile), old = groups.get(key);
    const fabrication = project.workspace.fabrication.find(f => f.pieceId === p.id && f.signature === signature);
    if (config.useFabrication && !fabrication) throw new Error(`${p.id}: comprimento de fabricação ausente ou desatualizado.`);
    const item = { id: p.id, lengthMm: config.useFabrication ? fabrication!.lengthMm : p.lengthMm };
    if (old) old.pieces.push(item); else groups.set(key, { profile: `${p.profile.name} · ${p.profile.steelGrade}`, stockMm: p.profile.stockLengthM * 1000, pieces: [item] });
  }
  return { status: "simulation_only" as const, signature, groups: [...groups.values()].map((g, i) => ({ profile: g.profile, ...packBars({ stockMm: g.stockMm, pieces: g.pieces, kerfMm: config.kerfMm!, endTrimMm: config.endTrimMm!, minimumRemnantMm: config.minimumRemnantMm! }), groupId: `G${i + 1}` })) };
}
