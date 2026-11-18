/**
 * Editor geométrico de tesoura de uma ou duas águas por estações (montantes).
 *
 * O construtor descreve a tesoura como ela é fabricada: distância de muro a
 * muro, recuo da ponta baixa (apoio da calha + calha + folga), altura na
 * ponta e no lado alto, painel padrão contado a partir de um lado e ajustes
 * ponto a ponto. Daqui sai a estrutura DECLARADA (nós e peças) consumida pelo
 * pacote CAD, lista de materiais e plano de corte.
 *
 * Geometria e quantitativos apenas: sem cargas, sem dimensionamento, sem
 * ligação estrutural. Nenhum bloqueio de aprovação é alterado aqui.
 */
import { z } from "zod";
import type { Project } from "./models";
import { declaredStructureSchema } from "./declared-structure";
import { physicalRoofFacesSchema } from "./physical-roof-faces";
import { newSpatialPreparation } from "./spatial-preparation";

const mm = z.number().finite();
const profileSchema = z.object({
  designation: z.string().trim().min(1).max(120),
  kgPerM: z.number().finite().positive().max(1000),
  /** Preço por barra comercial em centavos; null = a informar. */
  barPriceCents: z.number().int().min(0).max(100000000).nullable(),
  /** Barras a mais na compra (folga do construtor). */
  extraBars: z.number().int().min(0).max(100).default(0),
}).strict();

/** Perfis usuais do dia a dia (kg/m editável depois de escolher). */
export const COMMON_PROFILES: { designation: string; kgPerM: number; basis: string; use: ("chord" | "web" | "purlin")[] }[] = [
  { designation: "U 75x40x2.65 mm", kgPerM: 3.11, basis: "nominal (linha média)", use: ["chord", "web"] },
  { designation: "U 100x40x2.65 mm", kgPerM: 3.54, basis: "publicada", use: ["chord", "web"] },
  { designation: "U 127x50x2.65 mm", kgPerM: 4.52, basis: "publicada", use: ["chord"] },
  { designation: "Ue 75x40x15x2.65 mm", kgPerM: 3.63, basis: "nominal (linha média)", use: ["purlin", "chord"] },
  { designation: "Ue 100x40x17x2.65 mm", kgPerM: 4.23, basis: "nominal (linha média)", use: ["purlin", "chord"] },
  { designation: "Ue 100x50x17x2.65 mm", kgPerM: 4.65, basis: "nominal (linha média)", use: ["purlin", "chord"] },
  { designation: "Ue 127x50x17x2.65 mm", kgPerM: 5.21, basis: "nominal (linha média)", use: ["purlin"] },
  { designation: "L 7/8 x 1/8 pol", kgPerM: 1.03, basis: "nominal (linha média)", use: ["web"] },
  { designation: "L 1 x 1/8 pol", kgPerM: 1.19, basis: "nominal (linha média)", use: ["web"] },
  { designation: "L 1 x 3/16 pol", kgPerM: 1.73, basis: "nominal (linha média)", use: ["web"] },
];
export const trussEditorSchema = z.object({
  version: z.literal(1),
  /** A falta deste campo em projetos salvos é uma água (compatibilidade retroativa). */
  roofKind: z.enum(["one-slope", "two-slopes"]).default("one-slope"),
  spanMm: mm.min(1000).max(60000),
  lengthMm: mm.min(1000).max(200000),
  trusses: z.number().int().min(2).max(60),
  gutter: z.object({ supportMm: mm.min(0).max(2000), widthMm: mm.min(0).max(3000), clearanceMm: mm.min(0).max(3000),
    /** Lado menor (lado da telha) e lado maior (lado do muro) da calha. */
    lowSideMm: mm.min(0).max(2000).default(125), highSideMm: mm.min(0).max(3000).default(200),
    budgeted: z.boolean().default(false), pricePerMCents: z.number().int().min(0).max(10000000).nullable().default(null) }).strict(),
  /** Muros: altura do topo em relação ao piso. A tesoura apoia no muro alto. */
  walls: z.object({ lowMm: mm.min(0).max(20000), highMm: mm.min(0).max(20000), thicknessMm: mm.min(50).max(1000) }).strict()
    .default({ lowMm: 3000, highMm: 3800, thicknessMm: 150 }),
  /** Altura do banzo inferior em relação ao piso (apoio da tesoura). */
  supportZMm: mm.min(0).max(20000).default(3000),
  anchor: z.object({ plateWidthMm: mm.min(0).max(2000), plateHeightMm: mm.min(0).max(2000), boltsPerSupport: z.number().int().min(0).max(20),
    boltLengthMm: mm.min(0).max(5000), platePriceCents: z.number().int().min(0).max(10000000).nullable(), boltPriceCents: z.number().int().min(0).max(10000000).nullable() }).strict()
    .default({ plateWidthMm: 150, plateHeightMm: 200, boltsPerSupport: 2, boltLengthMm: 1000, platePriceCents: null, boltPriceCents: null }),
  tipHeightMm: mm.min(1).max(5000),
  highHeightMm: mm.min(1).max(10000),
  panelMm: mm.min(100).max(5000),
  countFrom: z.enum(["high", "low"]),
  diagonal: z.enum(["to-high", "to-low", "none", "x"]),
  /** Posições dos montantes a partir da ponta (mm), quando ajustadas à mão. */
  stationsMm: z.array(mm.min(0).max(60000)).min(2).max(200).nullable(),
  /** Painéis (índice a partir da ponta) com diagonal invertida. */
  flippedPanels: z.array(z.number().int().min(0).max(200)).max(200),
  purlinLines: z.number().int().min(2).max(60),
  purlinStepMm: mm.min(300).max(6000),
  chordSpliceMm: mm.min(500).max(12000),
  stockMm: mm.min(1000).max(14000),
  chord: profileSchema,
  web: profileSchema,
  purlin: profileSchema,
  sheet: z.object({ usefulWidthMm: mm.min(300).max(2000), pricePerMCents: z.number().int().min(0).max(10000000).nullable(), beyondTipMm: mm.min(0).max(2000),
    /** Peças por água (1 = inteira) e sobreposição entre elas. */
    piecesPerSlope: z.number().int().min(1).max(6).default(1), overlapMm: mm.min(0).max(1000).default(250) }).strict(),
  laborPerM2Cents: z.number().int().min(0).max(100000000).nullable(),
  consumablesCents: z.number().int().min(0).max(1000000000).nullable(),
  screwPriceCents: z.number().int().min(0).max(100000).nullable(),
  /** Orçamento pela medida cheia: todo montante e diagonal na altura máxima. */
  fullHeightBudget: z.boolean(),
}).strict();
export type TrussEditor = z.infer<typeof trussEditorSchema>;

/** Obra 8 x 10 m do Tom (18/11/2026), como ele passou por croqui e mensagens. */
export function tomTrussDefaults(): TrussEditor {
  return {
    version: 1, roofKind: "one-slope", spanMm: 8000, lengthMm: 10000, trusses: 3,
    gutter: { supportMm: 150, widthMm: 400, clearanceMm: 200, lowSideMm: 125, highSideMm: 200, budgeted: false, pricePerMCents: null },
    walls: { lowMm: 3000, highMm: 3800, thicknessMm: 150 }, supportZMm: 3000,
    anchor: { plateWidthMm: 150, plateHeightMm: 200, boltsPerSupport: 2, boltLengthMm: 1000, platePriceCents: null, boltPriceCents: null },
    tipHeightMm: 75, highHeightMm: 800, panelMm: 500, countFrom: "high", diagonal: "to-high",
    stationsMm: null, flippedPanels: [], purlinLines: 6, purlinStepMm: 1500, chordSpliceMm: 5980, stockMm: 6000,
    chord: { designation: "U 100x40x2.65 mm", kgPerM: 3.54, barPriceCents: null, extraBars: 0 },
    web: { designation: "L 7/8 x 1/8 pol", kgPerM: 1.03, barPriceCents: null, extraBars: 0 },
    purlin: { designation: "Ue 75x40x15x2.65 mm", kgPerM: 3.63, barPriceCents: null, extraBars: 0 },
    sheet: { usefulWidthMm: 1020, pricePerMCents: 4400, beyondTipMm: 300, piecesPerSlope: 1, overlapMm: 250 },
    laborPerM2Cents: 5000, consumablesCents: 110000, screwPriceCents: 60, fullHeightBudget: false,
  };
}

/** Obra nova: modelo genérico para digitar por cima (sem preços). */
export function blankTruss(): TrussEditor {
  const b = tomTrussDefaults();
  return { ...b, spanMm: 6000, lengthMm: 8000, trusses: 3, highHeightMm: Math.round(75 + (6000 - 750) * 0.1), purlinStepMm: 1000, stationsMm: null, flippedPanels: [],
    chord: { ...b.chord, barPriceCents: null }, web: { ...b.web, barPriceCents: null }, purlin: { ...b.purlin, barPriceCents: null },
    sheet: { ...b.sheet, pricePerMCents: null }, laborPerM2Cents: null, consumablesCents: null, screwPriceCents: null };
}

/** Contagem geométrica para orçamento, limitada pelo comprimento comercial.
 * NÃO representa espaçamento estrutural admissível, nem dimensionamento de terças. */
export function provisionalTrussCount(lengthMm: number, stockMm: number): number {
  const usable = stockMm - 10; // 5 mm de acabamento em cada extremidade (simulador de corte)
  return Math.min(60, Math.max(2, Math.ceil(lengthMm / Math.max(usable, 1)) + 1));
}

/** Linhas geométricas de terça para cobrir o semivão com o passo DECLARADO.
 * Não equivale a verificação de capacidade da telha ou da terça. */
export function geometricPurlinLines(t: TrussEditor): number {
  return Math.min(60, Math.max(2, Math.ceil(Math.max(0, trussLengthMm(t)) / t.purlinStepMm) + 1));
}

/** Obra existente: medidas reais do projeto, nunca os preços do exemplo do Tom.
 * O número geométrico preliminar usa somente a barra comercial (não resistência). */
export function trussDefaultsFor(project: Project): TrussEditor {
  const base = blankTruss(), r = project.roof;
  if (!r.widthM || !r.lengthM) return base;
  const spanMm = r.widthM * 1000, lengthMm = r.lengthM * 1000;
  const roofKind: TrussEditor["roofKind"] = project.planning?.typology === "gable" ? "two-slopes" : "one-slope";
  const declaredSpacing = project.planning?.frameSpacingM;
  const trusses = declaredSpacing && declaredSpacing > 0
    ? Math.min(60, Math.max(2, Math.ceil(r.lengthM / declaredSpacing) + 1))
    : provisionalTrussCount(lengthMm, base.stockMm);
  const declaredPurlinStepMm = project.planning?.purlinSpacingM
    ? project.planning.purlinSpacingM * 1000 : base.purlinStepMm;
  const purlinStepMm = Math.min(6000, Math.max(300, declaredPurlinStepMm));
  const geometry = { ...base, roofKind, spanMm, lengthMm, trusses, purlinStepMm };
  const slope = (r.slopePercent ?? 10) / 100;
  return {
    ...geometry, purlinLines: geometricPurlinLines(geometry),
    highHeightMm: Math.round(base.tipHeightMm + trussLengthMm(geometry) * slope),
  };
}

/** Projeção horizontal de uma água; em duas águas há dois semivãos simétricos. */
export const tipOffsetMm = (t: TrussEditor) => t.gutter.supportMm + t.gutter.widthMm + t.gutter.clearanceMm;
export const slopeCount = (t: TrussEditor) => t.roofKind === "two-slopes" ? 2 : 1;
export const trussLengthMm = (t: TrussEditor) => (t.spanMm - slopeCount(t) * tipOffsetMm(t)) / slopeCount(t);
export const totalTrussRunMm = (t: TrussEditor) => slopeCount(t) * trussLengthMm(t);
export const fallPercent = (t: TrussEditor) => (t.highHeightMm - t.tipHeightMm) / trussLengthMm(t) * 100;
/** Ajusta a altura do lado alto para uma caída (%) dada, mantendo a ponta. */
export const withFall = (t: TrussEditor, percent: number): TrussEditor => ({ ...t, highHeightMm: Math.round((t.tipHeightMm + trussLengthMm(t) * percent / 100) * 10) / 10 });
export const heightAt = (t: TrussEditor, s: number) => t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * s / trussLengthMm(t);

/** Montantes a partir da ponta (0) até o lado alto (comprimento da tesoura). */
export function autoStations(t: TrussEditor): number[] {
  const L = trussLengthMm(t), out: number[] = [];
  if (t.countFrom === "high") { for (let s = L; s > 1e-6; s -= t.panelMm) out.unshift(Math.round(s * 10) / 10); out.unshift(0); }
  else { for (let s = 0; s < L - 1e-6; s += t.panelMm) out.push(Math.round(s * 10) / 10); out.push(L); }
  return [...new Set(out)].sort((a, b) => a - b);
}
export function stations(t: TrussEditor): number[] {
  const L = trussLengthMm(t);
  const raw = (t.stationsMm ?? autoStations(t)).filter(s => s >= 0 && s <= L);
  return [...new Set([0, ...raw, L].map(s => Math.round(s * 10) / 10))].sort((a, b) => a - b);
}

export type TrussIssue = { level: "erro" | "aviso"; message: string };
export function trussIssues(t: TrussEditor): TrussIssue[] {
  const out: TrussIssue[] = [], L = trussLengthMm(t), st = stations(t);
  if (L <= 500) out.push({ level: "erro", message: "Recuos da calha maiores que o vão útil: não sobra tesoura." });
  if (t.roofKind === "two-slopes" && t.walls.highMm !== t.walls.lowMm) out.push({ level: "aviso", message: "Duas águas simétricas: os dois apoios de beiral usam a altura do muro baixo. A altura do muro alto cadastrada fica reservada ao modo uma água." });
  if (t.highHeightMm <= t.tipHeightMm) out.push({ level: "erro", message: "O lado alto precisa ser mais alto que a ponta." });
  const panels = st.slice(1).map((s, i) => s - st[i]);
  if (panels.some(p => p < 50)) out.push({ level: "erro", message: "Há montantes a menos de 5 cm um do outro." });
  if (Math.max(...panels) > t.stockMm) out.push({ level: "erro", message: "Há painel maior que a barra comercial." });
  if (t.chordSpliceMm + 20 > t.stockMm) out.push({ level: "erro", message: "A emenda do banzo precisa caber numa barra (com acabamento das pontas)." });
  const purlins = purlinPositions(t);
  const bayMm = t.lengthMm / (t.trusses - 1);
  if (bayMm > t.stockMm - 10 + 1e-6)
    out.push({ level: "erro", message: `Trecho de terça de ${(bayMm / 1000).toFixed(2)} m excede a barra comercial de ${(t.stockMm / 1000).toFixed(2)} m. Declare mais tesouras ou detalhe emenda (ligação pendente, sem fabricação).` });
  if (purlins.length !== t.purlinLines)
    out.push({ level: "erro", message: "Número de linhas de terça não cabe no semivão com o passo informado." });
  if (new Set(purlins.map(p => p.sMm)).size !== purlins.length)
    out.push({ level: "erro", message: "Duas linhas de terça coincidem no mesmo nó; altere a quantidade, o passo ou os montantes." });
  const gaps = purlins.slice(1).map((p, i) => p.sMm - purlins[i].sMm);
  if (gaps.some(g => g > t.purlinStepMm * 1.2 + 1))
    out.push({ level: "aviso", message: "Há trecho sem linha de terça conforme o passo informado. Revise a distribuição; vão admissível da telha não foi verificado." });
  const shifted = purlins.filter(p => Math.abs(p.shiftMm) > 10);
  if (shifted.length) out.push({ level: "aviso", message: `${shifted.length} posição(ões) de terça ajustada(s) ao montante mais próximo: ${shifted.map(p => `${(p.requestedMm / 10).toFixed(1)} → ${(p.sMm / 10).toFixed(1)} cm`).join(", ")}. Conferir espaçamentos.` });
  const step = t.purlinStepMm * Math.hypot(1, fallPercent(t) / 100);
  if (step > 2500) out.push({ level: "aviso", message: `Terças a ${(step / 1000).toFixed(2)} m na inclinação: confira o vão máximo da telha.` });
  out.push({ level: "aviso", message: "Perfis, emendas e ligações sem verificação estrutural: conferência por engenheiro antes de fabricar." });
  return out;
}

/** Terças: sempre nos nós declarados; não posiciona barras em posições sem encontro físico.
 * Diferencia passo pedido e posição efetiva para registrar o ajuste. */
export function purlinPositions(t: TrussEditor) {
  const L = trussLengthMm(t), st = stations(t);
  const targets = [...new Set([...Array.from({ length: t.purlinLines - 1 }, (_, r) => L - r * t.purlinStepMm), 0])]
    .filter(s => s >= -1e-6).sort((a, b) => a - b);
  return targets.map(s => {
    const near = st.reduce((b, x) => Math.abs(x - s) < Math.abs(b - s) ? x : b, st[0]);
    return { sMm: near, onNode: true, requestedMm: s, shiftMm: near - s };
  });
}

export type TrussPiece = { id: string; mark: string; kind: "BI" | "BS" | "M" | "D"; lengthMm: number; a: [number, number]; b: [number, number] };
/** Peças de UMA tesoura em coordenadas locais (s a partir da ponta, z a partir do banzo inferior). */
export function trussPieces(t: TrussEditor): TrussPiece[] {
  const st = stations(t), L = trussLengthMm(t), out: TrussPiece[] = [];
  const top = (s: number) => heightAt(t, s);
  const len = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const [kind, a, b] of [["BI", [0, 0], [L, 0]], ["BS", [0, top(0)], [L, top(L)]]] as const) {
    const total = len(a as [number, number], b as [number, number]), k = Math.min(1, t.chordSpliceMm / total);
    const e: [number, number] = [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])];
    out.push({ id: `${kind}-A`, mark: `${kind}1`, kind, lengthMm: len(a as [number, number], e), a: a as [number, number], b: e });
    if (k < 1) out.push({ id: `${kind}-B`, mark: `${kind}2`, kind, lengthMm: len(e, b as [number, number]), a: e, b: b as [number, number] });
  }
  st.forEach((s, i) => out.push({ id: `M${i + 1}`, mark: `M${i + 1}`, kind: "M", lengthMm: top(s), a: [s, 0], b: [s, top(s)] }));
  if (t.diagonal !== "none") for (let i = 0; i + 1 < st.length; i++) {
    const flip = t.flippedPanels.includes(i) !== (t.diagonal === "to-low");
    const pairs: [[number, number], [number, number]][] = t.diagonal === "x"
      ? [[[st[i], 0], [st[i + 1], top(st[i + 1])]], [[st[i + 1], 0], [st[i], top(st[i])]]]
      : [flip ? [[st[i + 1], 0], [st[i], top(st[i])]] : [[st[i], 0], [st[i + 1], top(st[i + 1])]]];
    pairs.forEach(([a, b], j) => out.push({ id: `D${i + 1}${pairs.length > 1 ? (j ? "b" : "a") : ""}`, mark: `D${i + 1}${pairs.length > 1 ? (j ? "b" : "a") : ""}`, kind: "D", lengthMm: len(a, b), a, b }));
  }
  return out;
}

/** Peças da seção completa. Duas águas usam a mesma malha de painéis espelhada,
 * com uma única peça de montante no encontro central; a continuidade/ligação é PENDENTE. */
export function trussPiecesComplete(t: TrussEditor): TrussPiece[] {
  const left = trussPieces(t);
  if (t.roofKind !== "two-slopes") return left;
  const L = trussLengthMm(t);
  const leftParts = left.map(p => ({ ...p, id: `E-${p.id}`, mark: `E-${p.mark}` }));
  const rightParts = left
    .filter(p => !(p.kind === "M" && Math.abs(p.a[0] - L) < 1e-6))
    .map(p => ({ ...p, id: `D-${p.id}`, mark: `D-${p.mark}`,
      a: [2 * L - p.a[0], p.a[1]] as [number, number],
      b: [2 * L - p.b[0], p.b[1]] as [number, number] }));
  return [...leftParts, ...rightParts];
}
/** Linhas globais de terça; o elemento de cumeeira é compartilhado e aparece uma única vez. */
export function roofPurlinPositions(t: TrussEditor) {
  const half = purlinPositions(t), L = trussLengthMm(t);
  if (t.roofKind === "one-slope") return half.map(p => ({ ...p, xMm: p.sMm, side: "E" as const }));
  const both = [...half.map(p => ({ ...p, xMm: p.sMm, side: "E" as const })),
    ...half.map(p => ({ ...p, xMm: 2 * L - p.sMm, side: "D" as const }))];
  return both.filter((p, i) => both.findIndex(q => Math.abs(q.xMm - p.xMm) < 1e-6) === i).sort((a, b) => a.xMm - b.xMm);
}

/** Corte First Fit Decreasing simples, para o resumo ao vivo (o pacote CAD usa o mesmo critério). */
export function barsFor(lengths: number[], stockMm: number, kerfMm = 3, trimMm = 5) {
  const usable = stockMm - 2 * trimMm, bars: number[] = [];
  for (const l of [...lengths].sort((a, b) => b - a)) {
    if (l > usable) throw Error(`Peça de ${Math.round(l)} mm maior que a barra de ${stockMm} mm.`);
    const i = bars.findIndex(used => used + kerfMm + l <= usable + 1e-6);
    if (i >= 0) bars[i] += kerfMm + l; else bars.push(l);
  }
  return { bars: bars.length, wasteMm: bars.reduce((s, u) => s + usable - u, 0) };
}

export type TrussSummary = ReturnType<typeof trussSummary>;
export function trussSummary(t: TrussEditor) {
  const one = trussPiecesComplete(t), n = t.trusses, L = trussLengthMm(t), st = stations(t);
  const lengths = (k: TrussPiece["kind"][]) => one.filter(p => k.includes(p.kind)).flatMap(p => Array(n).fill(p.lengthMm) as number[]);
  const chordL = lengths(["BI", "BS"]), webL = lengths(["M", "D"]);
  const purlins = roofPurlinPositions(t), bays = n - 1, purlinPiece = t.lengthMm / bays;
  const purlinL = purlins.flatMap(() => Array(bays).fill(purlinPiece) as number[]);
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const chord = barsFor(chordL, t.stockMm), web = barsFor(webL, t.stockMm), purlin = barsFor(purlinL, t.stockMm);
  // Medida cheia (como o Tom orça): todo montante na altura máxima, toda diagonal no painel mais largo.
  const maxPanel = Math.max(...st.slice(1).map((s, i) => s - st[i]));
  const fullWeb = one.filter(p => p.kind === "M").length * t.highHeightMm + one.filter(p => p.kind === "D").length * Math.hypot(maxPanel, t.highHeightMm);
  const webFullBars = Math.ceil(fullWeb * n / (t.stockMm - 10));
  const kg = (l: number[], p: { kgPerM: number }) => sum(l) / 1000 * p.kgPerM;
  const slopeMm = Math.hypot(L, t.highHeightMm - t.tipHeightMm), runMm = slopeMm + t.sheet.beyondTipMm * slopeMm / L;
  const k = t.sheet.piecesPerSlope, sheetLengthMm = Math.ceil((runMm + (k - 1) * t.sheet.overlapMm) / k / 10) * 10;
  const columns = Math.ceil(t.lengthMm / t.sheet.usefulWidthMm), sheets = columns * k * slopeCount(t), sheetM = sheets * sheetLengthMm / 1000;
  const supports = n * 2, plates = n * slopeCount(t), bolts = plates * t.anchor.boltsPerSupport;
  const screws = Math.ceil((columns * purlins.length * 4 + (columns - 1) * slopeCount(t) * Math.ceil(slopeMm / 500)) / 50) * 50;
  const areaM2 = t.spanMm * t.lengthMm / 1e6;
  const webBars = (t.fullHeightBudget ? webFullBars : web.bars) + t.web.extraBars;
  const chordBars = chord.bars + t.chord.extraBars, purlinBars = purlin.bars + t.purlin.extraBars;
  const money = (bars: number, p: { barPriceCents: number | null }) => p.barPriceCents === null ? null : bars * p.barPriceCents;
  const lines = [
    { item: `Banzos ${t.chord.designation}`, qty: `${chordBars} barras${t.chord.extraBars ? ` (+${t.chord.extraBars} folga)` : ""}`, cents: money(chordBars, t.chord) },
    { item: `Montantes e diagonais ${t.web.designation}${t.fullHeightBudget ? " (medida cheia)" : ""}`, qty: `${webBars} barras${t.web.extraBars ? ` (+${t.web.extraBars} folga)` : ""}`, cents: money(webBars, t.web) },
    { item: `Terças ${t.purlin.designation}`, qty: `${purlinBars} barras${t.purlin.extraBars ? ` (+${t.purlin.extraBars} folga)` : ""}`, cents: money(purlinBars, t.purlin) },
    { item: "Telha", qty: `${sheets} × ${(sheetLengthMm / 1000).toFixed(2).replace(".", ",")} m (${slopeCount(t)} água(s), ${k} peça(s)/água)`, cents: t.sheet.pricePerMCents === null ? null : Math.round(sheetM * t.sheet.pricePerMCents) },
    ...(t.gutter.budgeted ? [{ item: "Calha (m)", qty: `${(t.lengthMm * slopeCount(t) / 1000).toFixed(2).replace(".", ",")} m (${slopeCount(t)} lado(s))`,
      cents: t.gutter.pricePerMCents === null ? null : Math.round(t.gutter.pricePerMCents * t.lengthMm * slopeCount(t) / 1000) }] : []),
    { item: `Chapa de ancoragem ${Math.round(t.anchor.plateWidthMm / 10)} x ${Math.round(t.anchor.plateHeightMm / 10)} cm`, qty: `${plates} un`, cents: t.anchor.platePriceCents === null ? null : plates * t.anchor.platePriceCents },
    { item: `Chumbador ${(t.anchor.boltLengthMm / 1000).toFixed(2).replace(".", ",")} m`, qty: `${bolts} un`, cents: t.anchor.boltPriceCents === null ? null : bolts * t.anchor.boltPriceCents },
    { item: "Parafusos", qty: `${screws} un`, cents: t.screwPriceCents === null ? null : screws * t.screwPriceCents },
    { item: "Insumos", qty: "—", cents: t.consumablesCents },
    { item: "Mão de obra", qty: `${areaM2.toFixed(1).replace(".", ",")} m²`, cents: t.laborPerM2Cents === null ? null : Math.round(areaM2 * t.laborPerM2Cents) },
  ];
  return {
    trussLengthMm: L, fallPercent: fallPercent(t), stations: st, pieces: one, purlins,
    bars: { chord: chord.bars, web: web.bars, webFullHeight: webFullBars, purlin: purlin.bars },
    buy: { chord: chordBars, web: webBars, purlin: purlinBars }, columns, supports, plates, bolts,
    kg: { chord: kg(chordL, t.chord), web: kg(webL, t.web), purlin: kg(purlinL, t.purlin), total: kg(chordL, t.chord) + kg(webL, t.web) + kg(purlinL, t.purlin) },
    sheets, sheetLengthMm, sheetM, screws, areaM2, lines,
    gutterLine: `Calha ${Math.round(t.gutter.widthMm / 10)} cm × ${(t.lengthMm * slopeCount(t) / 1000).toFixed(2).replace(".", ",")} m${t.gutter.budgeted ? (t.gutter.pricePerMCents === null ? " — preço pendente" : " — incluída no orçamento") : " — fora do orçamento"}`,
    knownCents: lines.reduce((s, l) => s + (l.cents ?? 0), 0), missing: lines.filter(l => l.cents === null).map(l => l.item),
  };
}

const area = (kgPerM: number) => Number((kgPerM / 7850 * 1e4).toFixed(4));
/**
 * Grava a tesoura no projeto como estrutura DECLARADA: 3D, CAD, lista de
 * materiais e plano de corte passam a usar exatamente estas peças.
 */
export function applyTrussToProject(project: Project, input: TrussEditor, revision = "TESOURA-EDITOR"): Project {
  const t = trussEditorSchema.parse(input), issues = trussIssues(t).filter(i => i.level === "erro");
  if (issues.length) throw Error(issues.map(i => i.message).join(" "));
  const x0 = tipOffsetMm(t), Z0 = t.supportZMm, L = trussLengthMm(t), S = slopeCount(t), bays = t.trusses - 1;
  const ys = Array.from({ length: t.trusses }, (_, f) => f * t.lengthMm / bays);
  type Node = { id: string; x: number; y: number; z: number };
  type Piece = { id: string; role: "topChord" | "bottomChord" | "web" | "purlin"; start: string; end: string; label: string; group: string };
  const nodes: Node[] = [], pieces: Piece[] = [], keys = new Map<string, string>();
  const node = (x: number, y: number, z: number) => {
    const k = [x, y, z].map(v => v.toFixed(3)).join("/");
    if (!keys.has(k)) { const id = `N${nodes.length + 1}`; nodes.push({ id, x, y, z }); keys.set(k, id); }
    return keys.get(k)!;
  };
  const role = { BI: "bottomChord", BS: "topChord", M: "web", D: "web" } as const;
  const label = { BI: "Banzo inferior", BS: "Banzo superior", M: "Montante", D: "Diagonal" } as const;
  ys.forEach((y, f) => {
    for (const p of trussPiecesComplete(t)) pieces.push({ id: `T${f + 1}-${p.id}`, role: role[p.kind], start: node(x0 + p.a[0], y, Z0 + p.a[1]), end: node(x0 + p.b[0], y, Z0 + p.b[1]),
      label: `${label[p.kind]} ${p.kind === "BI" || p.kind === "BS" ? t.chord.designation : t.web.designation}`, group: "TESOURA" });
  });
  roofPurlinPositions(t).forEach((p, r) => ys.slice(0, -1).forEach((y, v) => {
    const z = Z0 + heightAt(t, p.sMm);
    pieces.push({ id: `TE${r + 1}-V${v + 1}`, role: "purlin", start: node(x0 + p.xMm, y, z), end: node(x0 + p.xMm, ys[v + 1], z), label: `Terça ${t.purlin.designation}`, group: "TERCAS" });
  }));
  const next: Project = structuredClone(project);
  next.planning = null;
  next.roof = { ...next.roof, widthM: t.spanMm / 1000, lengthM: t.lengthMm / 1000, slopePercent: Math.round(fallPercent(t) * 100) / 100, revision: next.roof.revision + 1 };
  next.workspace.cutting = { kerfMm: 3, endTrimMm: 5, minimumRemnantMm: 300, useFabrication: false };
  next.workspace.physicalStructure = declaredStructureSchema.parse({
    schema_version: "jpn.declared-structure/1", source: "declared", units: "mm",
    provenance: "Editor de tesoura JPN (estações declaradas pelo construtor)", revision, nodes, pieces,
  });
  const draft = newSpatialPreparation(next), density = { kgM3: 7850, source: "Aço carbono 7850 kg/m³", revision };
  draft.physicalCatalog = {
    schema_version: "jpn.physical-catalog/1",
    materials: [{ id: "ACO", steelGrade: "NAO-INFORMADO (perfil comercial)", eGpa: null, gGpa: null, nu: null, density, materialSource: "Aço não especificado", materialRevision: revision }],
    sections: (["chord", "web", "purlin"] as const).map(k => ({ id: k.toUpperCase(), designation: t[k].designation, areaCm2: area(t[k].kgPerM), iyCm4: null, izCm4: null, jCm4: null,
      sectionSource: `Massa linear informada ${t[k].kgPerM} kg/m (área equivalente)`, sectionRevision: revision })),
    assignments: pieces.map(p => ({ pieceId: p.id, materialId: "ACO", sectionId: p.role === "purlin" ? "PURLIN" : p.role === "web" ? "WEB" : "CHORD", rotationDeg: null })),
  };
  const xs = x0 - t.sheet.beyondTipMm, ridge = x0 + L, xe = x0 + S * L + (S === 2 ? t.sheet.beyondTipMm : tipOffsetMm(t));
  const zLeft = (x: number) => Z0 + heightAt(t, x - x0);
  const zRight = (x: number) => Z0 + heightAt(t, x0 + 2 * L - x);
  const rectangle = (id: string, a: number, b: number, z: (x: number) => number) => ({
    id, source: "Editor de tesoura JPN / geometria declarada sem ligação estrutural", revision, supportPieceIds: [],
    outer: [[a, 0, z(a)], [b, 0, z(b)], [b, t.lengthMm, z(b)], [a, t.lengthMm, z(a)], [a, 0, z(a)]] as [number, number, number][],
    holes: [],
  });
  draft.physicalRoofFaces = physicalRoofFacesSchema.parse({
    schema_version: "jpn.physical-roof-faces/1", units: "mm", source: "Editor de tesoura JPN", revision,
    faces: S === 1 ? [rectangle("AGUA", xs, xe, zLeft)] :
      [rectangle("AGUA-E", xs, ridge, zLeft), rectangle("AGUA-D", ridge, xe, zRight)],
  });
  // Apoios só como POSIÇÃO (muro alto ancorado e ponta baixa): vínculos pendentes,
  // nada é presumido como fixo.
  draft.supports = ys.flatMap(y => [node(x0, y, Z0), node(x0 + S * L, y, Z0)]).map(nodeId => ({ nodeId, dofs: ["pending", "pending", "pending", "pending", "pending", "pending"] as ["pending", "pending", "pending", "pending", "pending", "pending"] }));
  next.workspace.spatialPreparation = draft;
  next.workspace.overallDimensionChecks = [{ axis: "y", statedLengthMm: t.lengthMm, source: "Comprimento da obra (editor de tesoura)", revision }];
  next.workspace.trussEditor = t;
  next.technicalNotes = [
    `Tesoura do editor JPN: ${S} água(s), semivão útil ${(L / 1000).toFixed(2)} m por água, altura na ponta ${t.tipHeightMm} mm e na ${S === 2 ? "cumeeira" : "extremidade alta"} ${t.highHeightMm} mm (inclinação ${fallPercent(t).toFixed(1)} %), ${stations(t).length} montantes por semivão, diagonais ${t.diagonal}.`,
    `Recuo da ponta baixa: apoio ${t.gutter.supportMm} + calha ${t.gutter.widthMm} + folga ${t.gutter.clearanceMm} mm; calha com lado menor ${t.gutter.lowSideMm} e maior ${t.gutter.highSideMm} mm${t.gutter.budgeted ? "" : " (fora do orçamento)"}.`,
    `Muros: beiral baixo ${t.walls.lowMm} mm, ${S === 1 ? `lado alto ${t.walls.highMm} mm` : "ambos os beirais no mesmo nível declarado"} (espessura ${t.walls.thicknessMm}); banzo inferior a ${t.supportZMm} mm do piso. Chapa de ancoragem ${t.anchor.plateWidthMm} x ${t.anchor.plateHeightMm} mm, ${t.anchor.boltsPerSupport} chumbador(es) de ${t.anchor.boltLengthMm} mm por ${S === 1 ? "muro alto" : "beiral"} (sem verificação).`,
    `Telha em ${t.sheet.piecesPerSlope} peça(s) por água${t.sheet.piecesPerSlope > 1 ? `, sobreposição ${t.sheet.overlapMm} mm` : ""}.`,
    "ESTUDO DE CONFERÊNCIA: sem cargas, vento, dimensionamento ou ligações. Não usar para fabricação.",
  ].join(" ");
  next.updatedAt = new Date().toISOString();
  return next;
}
