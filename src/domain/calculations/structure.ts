import type { Project } from "../models";
import { planningSchema, roles, roleLabels, type MaterialGroup, type Node3D, type PieceRole, type StructurePiece, type StructureResult } from "../structure";
import { generateGeometry, type GeometryModel, type Entity, type ViewName } from "./geometry";
import { formatMeasure } from "./units";
import { guidedSupportIssue } from "../guided-support";

export const STRUCTURE_NOTES = [
  "Modelo geométrico de uma água: banzo inferior horizontal, montantes e uma diagonal por painel; dois pilares por linha de tesoura.",
  "Comprimentos entre eixos dos nós. Descontos de ligação, cortes em ângulo e detalhes de fabricação não estão incluídos.",
  "Terças divididas por vão entre tesouras, sem sobreposição. Telhamento informado em área geométrica, sem conversão em telhas comerciais.",
  "Contraventamentos, ligações, chapas, fixadores, fundações e soldas ainda não quantificados. Esta lista não representa todos os materiais de uma obra.",
  "Resistência, estabilidade, cargas e verificações normativas ainda não calculadas. Perfis associados não significam dimensionamento aprovado.",
];
const intervals = (length: number, max: number) => {
  const count = Math.max(1, Math.ceil(length / max));
  // A fixed epsilon can round down a real excess. Check the actual spacing,
  // including a quotient rounded to an integer by floating-point division.
  return length / count > max ? count + 1 : count;
};
export function generateStructure(project: Project): StructureResult {
  const pending: string[] = [], notes = [...STRUCTURE_NOTES];
  const supportIssue=guidedSupportIssue(project);
  if(supportIssue)return {model:null,pending:[supportIssue],notes:[...notes,"Referências de paredes existentes não equivalem a apoios estruturais verificados; não foram criados pilares fictícios."]};
  if (!["Cobertura metálica","Galpão","Barracão"].includes(project.category)) return { model: null, pending: ["O gerador geométrico atende coberturas, galpões e barracões com tipologia compatível."], notes };
  const roof = generateGeometry(project.roof, project.planning?.typology);
  if (!roof.model) return { model: null, pending: roof.pending, notes };
  const parsed = planningSchema.safeParse(project.planning);
  if (!parsed.success) return { model: null, pending: ["Configure a distribuição e a geometria da tesoura na etapa Estrutura."], notes };
  const config = parsed.data;
  if (config.overhangStartM === null || config.overhangEndM === null) return { model: null, pending: ["Informe os balanços longitudinais; use zero explicitamente quando não houver prolongamento."], notes };
  const { frameSpacingM, purlinSpacingM, trussDepthM, panels } = config;
  if (config.typology === "gable" && (panels === null || panels < 2 || panels % 2)) return { model: null, pending: ["Duas águas exige número par de painéis, com nó na cumeeira."], notes };
  if (config.typology === "gable") notes[0] = "Modelo geométrico de duas águas simétricas, cumeeira central e banzo inferior horizontal; resistência não verificada.";
  if (frameSpacingM === null) pending.push("Informe o espaçamento máximo entre tesouras.");
  if (purlinSpacingM === null) pending.push("Informe o espaçamento máximo entre terças.");
  if (trussDepthM === null) pending.push("Informe a altura da tesoura no lado baixo.");
  if (panels === null) pending.push("Informe o número de painéis da tesoura.");
  if (frameSpacingM === null || purlinSpacingM === null || trussDepthM === null || panels === null) return { model: null, pending, notes };
  const m = roof.model.metrics, across = project.roof.fall.startsWith("width"), positive = project.roof.fall.endsWith("positive");
  const span = across ? m.widthM : m.lengthM, length = across ? m.lengthM : m.widthM;
  const bottom = m.lowHeightM - trussDepthM;
  if (bottom <= 0) return { model: null, pending: ["A altura da tesoura deve ser menor que a altura da borda baixa, para haver pilares com altura positiva."], notes };
  const bays = intervals(length, frameSpacingM), purlinBays = config.typology === "gable" ? 2 * intervals(m.slopeLengthM / 2, purlinSpacingM) : intervals(m.slopeLengthM, purlinSpacingM);
  const pieceCount = (bays + 1) * (4 * panels + 3) + (bays + Number(config.overhangStartM > 0) + Number(config.overhangEndM > 0)) * (purlinBays + 1);
  if (bays > 100 || purlinBays > 100 || pieceCount > 5000) return { model: null, pending: ["Esta configuração excede 5.000 peças ou 100 vãos por direção. Divida a obra ou reveja os espaçamentos."], notes };
  if (project.roof.supports.length) notes.push("Os apoios do desenho antigo foram preservados, mas não são usados nesta distribuição de dois pilares por linha. Confira a compatibilidade com a obra.");
  const nodes: Node3D[] = [], pieces: StructurePiece[] = [], coordinates = new Map<string, Node3D>();
  const node = (u: number, v: number, z: number) => {
    const point = { x: (across ? u : v) * 1000, y: (across ? v : u) * 1000, z: z * 1000 };
    const key = [point.x, point.y, point.z].map(x => x.toFixed(6)).join(":");
    const existing = coordinates.get(key); if (existing) return existing;
    const value = { id: `N${nodes.length + 1}`, ...point }; nodes.push(value); coordinates.set(key, value); return value;
  };
  const elevation = (u: number) => m.lowHeightM + m.riseM * (config.typology === "gable" ? 1 - Math.abs(2 * u / span - 1) : positive ? 1 - u / span : u / span);
  const used = new Set<string>();
  const add = (id: string, role: PieceRole, a: Node3D, b: Node3D) => {
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const key = [a.id, b.id].sort().join(":");
    if (lengthMm < .001 || used.has(key)) throw new Error("A configuração produziu peça nula ou duplicada. Reveja as medidas.");
    used.add(key); const profile = config.profiles[role];
    pieces.push({ id, role, start: a.id, end: b.id, lengthMm, profile, massKg: profile.massKgM === null ? null : lengthMm / 1000 * profile.massKgM });
  };
  try {
    for (let f = 0; f <= bays; f++) {
      const v = length * f / bays, label = `T${f + 1}`;
      const lower = Array.from({ length: panels + 1 }, (_, i) => node(span * i / panels, v, bottom));
      const upper = Array.from({ length: panels + 1 }, (_, i) => node(span * i / panels, v, elevation(span * i / panels)));
      add(`P${2 * f + 1}`, "column", node(0, v, 0), lower[0]);
      add(`P${2 * f + 2}`, "column", node(span, v, 0), lower[panels]);
      for (let i = 0; i <= panels; i++) {
        add(`${label}-M${i + 1}`, "web", lower[i], upper[i]);
        if (i < panels) {
          add(`${label}-BS${i + 1}`, "topChord", upper[i], upper[i + 1]);
          add(`${label}-BI${i + 1}`, "bottomChord", lower[i], lower[i + 1]);
          add(`${label}-D${i + 1}`, "web", config.typology === "gable" && i >= panels / 2 ? lower[i + 1] : lower[i], config.typology === "gable" && i >= panels / 2 ? upper[i] : upper[i + 1]);
        }
      }
    }
    for (let r = 0; r <= purlinBays; r++) {
      const u = span * r / purlinBays;
      for (let f = 0; f < bays; f++) add(`TE${r + 1}-V${f + 1}`, "purlin", node(u, length * f / bays, elevation(u)), node(u, length * (f + 1) / bays, elevation(u)));
      if (config.overhangStartM > 0) add(`TE${r + 1}-B1`, "purlin", node(u, -config.overhangStartM, elevation(u)), node(u, 0, elevation(u)));
      if (config.overhangEndM > 0) add(`TE${r + 1}-B2`, "purlin", node(u, length, elevation(u)), node(u, length + config.overhangEndM, elevation(u)));
    }
  } catch (error) { return { model: null, pending: [error instanceof Error ? error.message : "Geometria inválida."], notes }; }
  const groups = new Map<string, MaterialGroup>();
  for (const p of pieces) {
    // Micrometre key only merges floating point noise; sums retain unrounded lengths.
    const key = `${p.role}:${p.lengthMm.toFixed(6)}`;
    const row = groups.get(key);
    if (row) { row.pieceIds.push(p.id); row.totalLengthM += p.lengthMm / 1000; row.massKg = row.massKg === null || p.massKg === null ? null : row.massKg + p.massKg; }
    else groups.set(key, { key, role: p.role, profile: p.profile, pieceIds: [p.id], lengthMm: p.lengthMm, totalLengthM: p.lengthMm / 1000, massKg: p.massKg });
  }
  for (const role of roles) {
    const profile = config.profiles[role];
    if (!profile.name.trim()) pending.push(`${roleLabels[role]}: perfil não definido.`);
    if (!profile.steelGrade.trim()) pending.push(`${roleLabels[role]}: classe do aço não informada.`);
    if (profile.massKgM === null) pending.push(`${roleLabels[role]}: massa por metro desconhecida.`);
    if (!profile.source.trim()) pending.push(`${roleLabels[role]}: fonte da especificação não informada.`);
    if (profile.stockLengthM === null) pending.push(`${roleLabels[role]}: comprimento comercial não informado.`);
    else if (pieces.some(p => p.role === role && p.lengthMm > profile.stockLengthM! * 1000 + 1e-6)) pending.push(`${roleLabels[role]}: existem peças maiores que o comprimento comercial. Defina fornecimento ou detalhamento de emendas.`);
  }
  notes.push("Quantidade de barras comerciais pendente de plano de corte. O total em metros não determina sozinho a compra.");
  if (config.overhangStartM || config.overhangEndM) notes.push("Balanços longitudinais são prolongamentos geométricos das terças, sem verificação de flexão ou estabilidade. Não são analisados pelo solver de treliça.");
  m.projectedAreaM2 = span * (length + config.overhangStartM + config.overhangEndM);
  m.roofAreaM2 = m.slopeLengthM * (length + config.overhangStartM + config.overhangEndM);
  return { model: { units: "mm", nodes, pieces, groups: [...groups.values()], frameCount: bays + 1, frameSpacingM: length / bays, purlinRows: purlinBays + 1, purlinSpacingM: m.slopeLengthM / purlinBays, projectedAreaM2: m.projectedAreaM2, roofAreaM2: m.roofAreaM2, totalLengthM: pieces.reduce((sum, p) => sum + p.lengthMm / 1000, 0), knownMassKg: pieces.reduce((sum, p) => sum + (p.massKg ?? 0), 0), massComplete: pieces.every(p => p.massKg !== null) }, pending, notes };
}

export function structureViews(project: Project, result: StructureResult, onlyFirstTruss = false): GeometryModel | null {
  const envelope = generateGeometry({ ...project.roof, supports: [] }, project.planning?.typology).model;
  if (!envelope || !result.model) return null;
  const nodes = new Map(result.model.nodes.map(n => [n.id, n]));
  for (const view of ["plan", "front", "side"] as ViewName[]) {
    const projectPoint = (p: Node3D) => view === "plan" ? { x: p.x, y: p.y } : { x: view === "front" ? p.x : p.y, y: p.z };
    const entities: Entity[] = onlyFirstTruss ? [] : envelope.views[view].entities.filter(e => e.layer === "COTAS" || e.layer === "EIXOS");
    for (const piece of result.model.pieces) {
      if (onlyFirstTruss && !piece.id.startsWith("T1-")) continue;
      const a = projectPoint(nodes.get(piece.start)!), b = projectPoint(nodes.get(piece.end)!);
      if (Math.hypot(b.x - a.x, b.y - a.y) < .001) {
        entities.push({ type: "circle", at: a, radius: Math.max(envelope.metrics.widthM, envelope.metrics.lengthM) * 5, layer: "PILARES", pieceId: piece.id });
        continue;
      }
      entities.push({ type: "line", a, b, layer: piece.role === "column" ? "PILARES" : piece.role === "purlin" ? "TERCAS" : "TESOURAS", pieceId: piece.id });
    }
    if (onlyFirstTruss) {
      const points = entities.flatMap(e => e.type === "line" ? [e.a, e.b] : e.type === "circle" ? [e.at] : []);
      const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
      const pad = Math.max(maxX - minX, maxY - minY, 1000) * .12;
      envelope.views[view].bounds = { minX: minX - pad, maxX: maxX + pad, minY: minY - pad * 1.8, maxY: maxY + pad };
      entities.push({ type: "line", a: { x: minX, y: minY - pad * .5 }, b: { x: maxX, y: minY - pad * .5 }, layer: "COTAS" });
      entities.push({ type: "text", at: { x: (minX + maxX) / 2, y: minY - pad }, text: `Vão ${formatMeasure((maxX - minX) / 1000)} m · T1`, height: pad * .25, layer: "COTAS" });
    }
    envelope.views[view].entities = entities;
    for (const n of result.model.nodes) {
      const p = projectPoint(n), b = envelope.views[view].bounds;
      b.minX = Math.min(b.minX, p.x - 200); b.maxX = Math.max(b.maxX, p.x + 200);
      b.minY = Math.min(b.minY, p.y - 200); b.maxY = Math.max(b.maxY, p.y + 200);
    }
  }
  return envelope;
}
