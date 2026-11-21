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
import nbr6120 from "../../data/normas/nbr6120-2019-actions.json" with { type: "json" };
import { prepareTrussAnalysis } from "./truss-analysis";
import type { Project } from "./models";
import { declaredStructureSchema } from "./declared-structure";
import { physicalRoofFacesSchema } from "./physical-roof-faces";
import { newSpatialPreparation } from "./spatial-preparation";
import { structureSignature } from "./calculations/project-basis";
import { generateStructure } from "./calculations/structure";
import { physicalRoleLabels, roleLabels } from "./structure";

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
export const COMMON_PROFILES: { designation: string; kgPerM: number; basis: string; use: ("chord" | "web" | "purlin" | "column")[] }[] = [
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
  { designation: "Tubo 80x80x3.00 mm", kgPerM: 7.25, basis: "nominal (seção cheia, sem raio)", use: ["column"] },
  { designation: "Tubo 100x100x3.00 mm", kgPerM: 9.14, basis: "nominal (seção cheia, sem raio)", use: ["column"] },
  { designation: "Tubo 100x100x4.75 mm", kgPerM: 14.21, basis: "nominal (seção cheia, sem raio)", use: ["column"] },
  { designation: "Tubo 150x150x4.75 mm", kgPerM: 21.67, basis: "nominal (seção cheia, sem raio)", use: ["column"] },
];
/** O que fica embaixo de cada ponta da tesoura. */
export const endSupportSchema = z.enum(["wall", "column"]);
export type EndSupport = z.infer<typeof endSupportSchema>;
export type TrussSide = "left" | "right";
const DEFAULT_COLUMN = { designation: "Tubo 100x100x3.00 mm", kgPerM: 9.14, barPriceCents: null, extraBars: 0 };
/** Campos que um TIPO de tesoura pode mudar. A cobertura (vão, alturas, caída, terças,
 * apoio) é a mesma da obra; muda o desenho interno e os perfis da tesoura. */
export const TYPE_KEYS = ["panelMm", "countFrom", "diagonal", "stationsMm", "flippedPanels", "chord", "bottomChord", "web"] as const;
export const trussTypeSchema = z.object({
  id: z.string().regex(/^T[2-9]$|^T1[0-9]$/),
  name: z.string().trim().min(1).max(40),
  panelMm: mm.min(100).max(5000),
  countFrom: z.enum(["high", "low"]),
  diagonal: z.enum(["to-high", "to-low", "none", "x"]),
  stationsMm: z.array(mm.min(0).max(60000)).min(2).max(200).nullable(),
  flippedPanels: z.array(z.number().int().min(0).max(200)).max(200),
  chord: profileSchema,
  /** Banzo inferior; null = mesmo perfil do banzo superior (`chord`). */
  bottomChord: profileSchema.nullable().default(null),
  web: profileSchema,
}).strict();
export type TrussType = z.infer<typeof trussTypeSchema>;
export const BASE_TYPE = "T1";

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
  /** Onde a tesoura apoia: muros existentes (padrão) ou pilares novos (obra completa).
   * Com pilares, a tesoura vai de eixo a eixo dos pilares; calha e muros não são modelados. */
  support: z.enum(["walls", "columns"]).default("walls"),
  /** Perfil dos pilares (pontas apoiadas em pilar). */
  column: profileSchema.default(DEFAULT_COLUMN),
  /** Apoio de cada ponta por linha de tesoura (índice = linha). Vazio ou ausente = segue `support`
   * (projetos antigos). A geometria da tesoura não muda: só o que fica embaixo de cada ponta. */
  lineSupports: z.array(z.object({ left: endSupportSchema, right: endSupportSchema }).strict()).max(60).default([]),
  /** Hipóteses de vínculo DECLARADAS pelo construtor no editor (não presumidas pelo motor). */
  supportModel: z.object({
    /** Base do pilar: engastada (chapa + chumbadores trabalhando à flexão) ou articulada. */
    columnBase: z.enum(["fixed", "pinned"]).default("fixed"),
    /** Tesoura entre dois muros: uma ponta desliza na direção do vão (não empurra o muro). */
    wallsSlide: z.boolean().default(true),
    /** Conferência do muro existente no local (quem/quando/o quê). Vazio = hipótese a conferir. */
    wallSiteReview: z.string().trim().max(300).default(""),
  }).strict().default({ columnBase: "fixed", wallsSlide: true, wallSiteReview: "" }),
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
  /** Banzo superior (e inferior, quando `bottomChord` é null — projetos antigos). */
  chord: profileSchema,
  /** Banzo inferior com perfil próprio; null = mesmo do banzo superior. */
  bottomChord: profileSchema.nullable().default(null),
  web: profileSchema,
  purlin: profileSchema,
  sheet: z.object({ usefulWidthMm: mm.min(300).max(2000), pricePerMCents: z.number().int().min(0).max(10000000).nullable(), beyondTipMm: mm.min(0).max(2000),
    /** Peças por água (1 = inteira) e sobreposição entre elas. */
    piecesPerSlope: z.number().int().min(1).max(6).default(1), overlapMm: mm.min(0).max(1000).default(250),
    /** Telha para o peso no cálculo (NBR 6120:2019 Tabela 5). */
    cladding: z.enum(Object.keys(nbr6120.permanent.table5Telhas.items) as [string, ...string[]]).default("steel-0.5mm") }).strict(),
  laborPerM2Cents: z.number().int().min(0).max(100000000).nullable(),
  consumablesCents: z.number().int().min(0).max(1000000000).nullable(),
  screwPriceCents: z.number().int().min(0).max(100000).nullable(),
  /** Orçamento pela medida cheia: todo montante e diagonal na altura máxima. */
  fullHeightBudget: z.boolean(),
  /** Tipos extras (T2, T3...). O tipo 1 são os próprios campos do editor. */
  types: z.array(trussTypeSchema).max(9).default([]),
  /** Tipo de cada linha de tesoura (índice 0 = primeira); vazio/ausente = tipo 1. */
  lineTypes: z.array(z.string().max(4)).max(60).default([]),
}).strict();
export type TrussEditor = z.infer<typeof trussEditorSchema>;

/** Obra 8 x 10 m do Tom (18/11/2026), como ele passou por croqui e mensagens. */
export function tomTrussDefaults(): TrussEditor {
  return {
    version: 1, roofKind: "one-slope", spanMm: 8000, lengthMm: 10000, trusses: 3,
    gutter: { supportMm: 150, widthMm: 400, clearanceMm: 200, lowSideMm: 125, highSideMm: 200, budgeted: false, pricePerMCents: null },
    walls: { lowMm: 3000, highMm: 3800, thicknessMm: 150 }, supportZMm: 3000, support: "walls", column: { ...DEFAULT_COLUMN },
    anchor: { plateWidthMm: 150, plateHeightMm: 200, boltsPerSupport: 2, boltLengthMm: 1000, platePriceCents: null, boltPriceCents: null },
    tipHeightMm: 75, highHeightMm: 800, panelMm: 500, countFrom: "high", diagonal: "to-high",
    stationsMm: null, flippedPanels: [], purlinLines: 6, purlinStepMm: 1500, chordSpliceMm: 5980, stockMm: 6000,
    chord: { designation: "U 100x40x2.65 mm", kgPerM: 3.54, barPriceCents: null, extraBars: 0 }, bottomChord: null,
    web: { designation: "L 7/8 x 1/8 pol", kgPerM: 1.03, barPriceCents: null, extraBars: 0 },
    purlin: { designation: "Ue 75x40x15x2.65 mm", kgPerM: 3.63, barPriceCents: null, extraBars: 0 },
    sheet: { usefulWidthMm: 1020, pricePerMCents: 4400, beyondTipMm: 300, piecesPerSlope: 1, overlapMm: 250, cladding: "steel-0.5mm" },
    laborPerM2Cents: 5000, consumablesCents: 110000, screwPriceCents: 60, fullHeightBudget: false, types: [], lineTypes: [], lineSupports: [], supportModel: { columnBase: "fixed", wallsSlide: true, wallSiteReview: "" },
  };
}

/** Obra nova independente do exemplo do Tom: preços continuam sem valor. */
export function blankTruss(): TrussEditor {
  return {
    version: 1, roofKind: "one-slope", spanMm: 6000, lengthMm: 8000, trusses: 3,
    gutter: { supportMm: 150, widthMm: 300, clearanceMm: 150, lowSideMm: 125, highSideMm: 200, budgeted: false, pricePerMCents: null },
    walls: { lowMm: 3000, highMm: 3600, thicknessMm: 150 }, supportZMm: 3000, support: "walls", column: { ...DEFAULT_COLUMN },
    anchor: { plateWidthMm: 150, plateHeightMm: 200, boltsPerSupport: 2, boltLengthMm: 1000, platePriceCents: null, boltPriceCents: null },
    tipHeightMm: 75, highHeightMm: 615, panelMm: 500, countFrom: "high", diagonal: "to-high",
    stationsMm: null, flippedPanels: [], purlinLines: 7, purlinStepMm: 1000, chordSpliceMm: 5980, stockMm: 6000,
    chord: { designation: "U 100x40x2.65 mm", kgPerM: 3.54, barPriceCents: null, extraBars: 0 }, bottomChord: null,
    web: { designation: "L 7/8 x 1/8 pol", kgPerM: 1.03, barPriceCents: null, extraBars: 0 },
    purlin: { designation: "Ue 75x40x15x2.65 mm", kgPerM: 3.63, barPriceCents: null, extraBars: 0 },
    sheet: { usefulWidthMm: 1020, pricePerMCents: null, beyondTipMm: 300, piecesPerSlope: 1, overlapMm: 250, cladding: "steel-0.5mm" },
    laborPerM2Cents: null, consumablesCents: null, screwPriceCents: null, fullHeightBudget: false, types: [], lineTypes: [], lineSupports: [], supportModel: { columnBase: "fixed", wallsSlide: true, wallSiteReview: "" },
  };
}

/** Usa apenas dimensões e espaçamentos declarados; sem espaçamento informado, a quantidade
 * inicial é um campo editável, NÃO uma verificação de apoio ou capacidade. */
/** Quantidade geométrica inicial baseada no comprimento da barra disponível.
 * Não avalia vão resistente, apoios ou estabilidade e não libera fabricação. */
/**
 * Linhas e passo de terça para um semivão. Com montantes automáticos contados do lado alto, o passo é
 * o múltiplo do painel mais próximo do passo desejado: toda terça cai num montante e o espaçamento fica igual
 * (só o último trecho, junto à ponta, pode ser menor). Sem esse módulo, divide o semivão por igual.
 */
export function fitPurlins(t: Pick<TrussEditor, "panelMm" | "countFrom" | "stationsMm">, runMm: number, wantedStepMm: number): { purlinLines: number; purlinStepMm: number } {
  const want = Math.max(300, Math.min(6000, wantedStepMm));
  if (t.countFrom === "high" && t.stationsMm === null && t.panelMm > 0) {
    const k = Math.max(1, Math.ceil(300 / t.panelMm), Math.round(want / t.panelMm));
    const step = Math.min(6000, k * t.panelMm);
    const lines = Math.min(60, Math.max(2, Math.ceil(runMm / step - 1e-6) + 1));
    return { purlinLines: lines, purlinStepMm: step };
  }
  const lines = Math.min(60, Math.max(2, Math.ceil(runMm / want) + 1));
  return { purlinLines: lines, purlinStepMm: Math.max(300, Math.min(6000, Math.floor(runMm / (lines - 1) / 10) * 10)) };
}
export function suggestedTrussCount(lengthMm: number, stockMm: number): number {
  if (!Number.isFinite(lengthMm) || !Number.isFinite(stockMm) || stockMm <= 20) return 2;
  return Math.min(60, Math.max(2, Math.ceil(lengthMm / (stockMm - 10)) + 1));
}
export function trussDefaultsFor(project: Project): TrussEditor {
  const base = blankTruss(), roof = project.roof, planning = project.planning;
  if (!roof.widthM || !roof.lengthM) return base;
  const spanMm = Math.round(roof.widthM * 1000), lengthMm = Math.round(roof.lengthM * 1000);
  const roofKind = planning?.typology === "gable" ? "two-slopes" : "one-slope";
  const slopes = roofKind === "two-slopes" ? 2 : 1;
  const runMm = (spanMm - slopes * (base.gutter.supportMm + base.gutter.widthMm + base.gutter.clearanceMm)) / slopes;
  const wantedStep = planning?.purlinSpacingM ? planning.purlinSpacingM * 1000 : base.purlinStepMm;
  const { purlinLines, purlinStepMm } = runMm > 0 ? fitPurlins(base, runMm, wantedStep) : base;
  const trusses = planning?.frameSpacingM ? Math.min(60, Math.max(2, Math.ceil(lengthMm / (planning.frameSpacingM * 1000)) + 1)) : suggestedTrussCount(lengthMm, base.stockMm);
  const supportZMm = roof.lowHeightM === null ? base.supportZMm : Math.round(roof.lowHeightM * 1000);
  const highHeightMm = Math.round(base.tipHeightMm + runMm * ((roof.slopePercent ?? 10) / 100));
  // Obra completa (pré-projeto com pilares): a tesoura apoia em pilares, de eixo a eixo,
  // usando altura de tesoura, pilar e perfis já informados na obra.
  if (planning) {
    const depth = planning.trussDepthM ? Math.round(planning.trussDepthM * 1000) : base.tipHeightMm;
    const low = roof.lowHeightM === null ? base.supportZMm + depth : Math.round(roof.lowHeightM * 1000);
    const run = spanMm / slopes;
    const fromPlanning = (p: { name: string; section: string; massKgM: number | null }, fallback: TrussEditor["chord"]) =>
      p.massKgM ? { ...fallback, designation: (p.section || p.name || fallback.designation).slice(0, 120), kgPerM: p.massKgM } : fallback;
    const cols: TrussEditor = { ...base, roofKind, spanMm, lengthMm, trusses, support: "columns" as const, supportZMm: Math.max(0, low - depth), tipHeightMm: depth };
    const fit = Math.max(2, Math.ceil(run / wantedStep) + 1);
    return { ...cols, highHeightMm: Math.round(depth + run * ((roof.slopePercent ?? 10) / 100)),
      purlinLines: Math.min(60, fit), purlinStepMm: Math.min(6000, Math.max(300, Math.round(run / (fit - 1) / 10) * 10)),
      walls: { ...base.walls, lowMm: 0, highMm: 0 },
      chord: fromPlanning(planning.profiles.topChord, base.chord),
      bottomChord: planning.profiles.bottomChord?.massKgM && (planning.profiles.bottomChord.massKgM !== planning.profiles.topChord.massKgM || planning.profiles.bottomChord.section !== planning.profiles.topChord.section)
        ? fromPlanning(planning.profiles.bottomChord, base.chord) : null,
      web: fromPlanning(planning.profiles.web, base.web),
      purlin: fromPlanning(planning.profiles.purlin, base.purlin), column: fromPlanning(planning.profiles.column, base.column) };
  }
  return { ...base, roofKind, spanMm, lengthMm, trusses, purlinLines, purlinStepMm, highHeightMm,
    supportZMm, walls: { ...base.walls, lowMm: supportZMm,
      highMm: roofKind === "two-slopes" ? supportZMm : Math.min(20000, Math.max(0, supportZMm + highHeightMm)) } };
}

/** Projeção horizontal de uma água; em duas águas há dois semivãos simétricos. */
export const tipOffsetMm = (t: TrussEditor) => t.support === "columns" ? 0 : t.gutter.supportMm + t.gutter.widthMm + t.gutter.clearanceMm;
/** Pilares do apoio em pilares: dois por tesoura (um em cada ponta), do piso ao banzo inferior. */
/** Apoio de uma ponta: o declarado na linha ou, sem declaração, o modo da obra. */
export const endSupportOf = (t: TrussEditor, line: number, side: TrussSide): EndSupport =>
  t.lineSupports[line]?.[side] ?? (t.support === "columns" ? "column" : "wall");
/** Todas as pontas (linha × lado) com o seu apoio. "left" = ponta do x0; "right" = outra ponta (S=1: lado alto). */
export const trussEnds = (t: TrussEditor) => Array.from({ length: t.trusses }, (_, line) =>
  (["left", "right"] as const).map(side => ({ line, side, kind: endSupportOf(t, line, side) }))).flat();
export const columnCount = (t: TrussEditor) => trussEnds(t).filter(e => e.kind === "column").length;
/** Chapas de ancoragem no muro: duas águas = cada ponta em muro; uma água = só o lado alto (a ponta baixa
 * descansa no apoio da calha, como antes). */
export const wallPlateCount = (t: TrussEditor) => trussEnds(t).filter(e => e.kind === "wall" && (slopeCount(t) === 2 || e.side === "right")).length;
/** Muros a esquematizar no corte (CAD): um por lado que tenha muro em alguma tesoura. */
export function cutWalls(t: TrussEditor) {
  const S = slopeCount(t), ends = trussEnds(t);
  return (["left", "right"] as const).flatMap(side => {
    const lines = ends.filter(e => e.side === side && e.kind === "wall").map(e => e.line + 1);
    if (!lines.length) return [];
    // Obra de pilares com trecho de muro: o muro chega à cota do banzo inferior (apoio da ponta).
    const heightMm = t.support !== "columns" ? (side === "left" || S === 2 ? t.walls.lowMm : t.walls.highMm) : t.supportZMm;
    return [{ side, x: side === "left" ? 0 : t.spanMm, heightMm, lines: lines.length === t.trusses ? "" : ` - TESOURAS ${lines.join(",")}` }];
  });
}
/** Obra com apoios diferentes entre pontas/linhas. */
export const hasMixedSupports = (t: TrussEditor) => new Set(trussEnds(t).map(e => e.kind)).size > 1;
/** Aplica um apoio a várias pontas (atalhos da tela). */
export function withEndSupports(t: TrussEditor, pick: (line: number, side: TrussSide) => EndSupport | null): TrussEditor["lineSupports"] {
  return Array.from({ length: t.trusses }, (_, line) => ({
    left: pick(line, "left") ?? endSupportOf(t, line, "left"),
    right: pick(line, "right") ?? endSupportOf(t, line, "right"),
  }));
}
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

/** Id do tipo usado na linha `i` (tipo inexistente ou vazio = tipo 1). */
export const lineTypeId = (t: TrussEditor, i: number) => {
  const id = t.lineTypes[i];
  return id && t.types.some(x => x.id === id) ? id : BASE_TYPE;
};
/** Tesoura efetiva de um tipo: cobertura da obra + desenho/perfis do tipo. */
export function trussOfType(t: TrussEditor, id: string): TrussEditor {
  const ty = t.types.find(x => x.id === id);
  if (!ty) return t;
  return { ...t, panelMm: ty.panelMm, countFrom: ty.countFrom, diagonal: ty.diagonal, stationsMm: ty.stationsMm, flippedPanels: ty.flippedPanels, chord: ty.chord, bottomChord: ty.bottomChord ?? null, web: ty.web };
}
/** Perfil efetivo de cada banzo (o inferior herda o superior quando não informado). */
export const topChordOf = (t: TrussEditor) => t.chord;
export const bottomChordOf = (t: TrussEditor) => t.bottomChord ?? t.chord;
export const profileOfPiece = (t: TrussEditor, kind: TrussPiece["kind"]) => kind === "BS" ? t.chord : kind === "BI" ? bottomChordOf(t) : t.web;
export const trussOfLine = (t: TrussEditor, i: number) => trussOfType(t, lineTypeId(t, i));
/** Nome legível do tipo. */
export const typeName = (t: TrussEditor, id: string) => id === BASE_TYPE ? "Tipo 1" : t.types.find(x => x.id === id)?.name ?? id;
/** Novo tipo copiando o desenho de um tipo existente. */
export function addTrussType(t: TrussEditor, fromId = BASE_TYPE): TrussEditor {
  const used = new Set(t.types.map(x => x.id));
  const n = Array.from({ length: 18 }, (_, i) => i + 2).find(i => !used.has(`T${i}`));
  if (!n || t.types.length >= 9) return t;
  const src = trussOfType(t, fromId);
  const ty: TrussType = { id: `T${n}`, name: `Tipo ${n}`, panelMm: src.panelMm, countFrom: src.countFrom, diagonal: src.diagonal,
    stationsMm: src.stationsMm ? [...src.stationsMm] : null, flippedPanels: [...src.flippedPanels], chord: { ...src.chord }, bottomChord: src.bottomChord ? { ...src.bottomChord } : null, web: { ...src.web } };
  return { ...t, types: [...t.types, ty] };
}
/** Remove um tipo; as linhas que o usavam voltam ao tipo 1. */
export function removeTrussType(t: TrussEditor, id: string): TrussEditor {
  return { ...t, types: t.types.filter(x => x.id !== id), lineTypes: t.lineTypes.map(x => x === id ? BASE_TYPE : x) };
}

const cmBr = (mm: number) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export type TrussIssue = { level: "erro" | "aviso"; message: string };
export function trussIssues(t: TrussEditor): TrussIssue[] {
  const out: TrussIssue[] = [], L = trussLengthMm(t), st = stations(t);
  if (L <= 500) out.push({ level: "erro", message: "Recuos da calha maiores que o vão útil: não sobra tesoura." });
  if (t.highHeightMm <= t.tipHeightMm) out.push({ level: "erro", message: "O lado alto precisa ser mais alto que a ponta." });
  const panels = st.slice(1).map((s, i) => s - st[i]);
  if (panels.some(p => p < 50)) out.push({ level: "erro", message: "Há montantes a menos de 5 cm um do outro." });
  if (Math.max(...panels) > t.stockMm) out.push({ level: "erro", message: "Há painel maior que a barra comercial." });
  if (t.chordSpliceMm + 20 > t.stockMm) out.push({ level: "erro", message: "A emenda do banzo precisa caber numa barra (com acabamento das pontas)." });
  const purlins = purlinPositions(t);
  const purlinBayMm = t.lengthMm / (t.trusses - 1);
  if (purlinBayMm > t.stockMm - 10) out.push({ level: "erro", message: `Terça de ${Math.round(purlinBayMm)} mm entre tesouras excede a barra comercial de ${t.stockMm} mm. Declare outro espaçamento/quantidade de tesouras ou detalhe a emenda pendente; nenhuma ligação é dimensionada automaticamente.` });
  if (purlins.length !== t.purlinLines)
    out.push({ level: "erro", message: "Número de linhas de terça não cabe no semivão com o passo informado." });
  if (new Set(purlins.map(p => p.sMm)).size !== purlins.length)
    out.push({ level: "erro", message: "Duas linhas de terça coincidem no mesmo nó; altere a quantidade, o passo ou os montantes." });
  const positioned = purlins.map(p => p.sMm).sort((a, b) => a - b);
  const gaps = positioned.slice(1).map((position, i) => position - positioned[i]);
  const uncoveredMm = Math.max(0, ...gaps);
  if (uncoveredMm > t.purlinStepMm + Math.max(50, t.panelMm / 2))
    out.push({ level: "aviso", message: `Há intervalo de ${Math.round(uncoveredMm)} mm entre linhas de terça, maior que o passo informado de ${t.purlinStepMm} mm (com tolerância geométrica de encaixe em nós). Confira o trecho sem terça antes de usar a distribuição.` });
  const shifted = purlins.filter(p => Math.abs(p.shiftMm) > 10);
  if (shifted.length) out.push({ level: "aviso", message: `${shifted.length} posição(ões) de terça ajustada(s) ao montante mais próximo: ${shifted.map(p => `${cmBr(p.requestedMm)} → ${cmBr(p.sMm)} cm`).join("; ")}. Conferir espaçamentos.` });
  const step = t.purlinStepMm * Math.hypot(1, fallPercent(t) / 100);
  if (step > 2500) out.push({ level: "aviso", message: `Terças a ${(step / 1000).toFixed(2)} m na inclinação: confira o vão máximo da telha.` });
  for (const ty of t.types) {
    const eff = trussOfType(t, ty.id), est = stations(eff), ep = est.slice(1).map((x, i) => x - est[i]);
    if (ep.some(p => p < 50)) out.push({ level: "erro", message: `${ty.name}: há montantes a menos de 5 cm um do outro.` });
    if (Math.max(...ep) > t.stockMm) out.push({ level: "erro", message: `${ty.name}: há painel maior que a barra comercial.` });
    const off = purlins.filter(p => !est.some(x => Math.abs(x - p.sMm) < 1));
    if (off.length) out.push({ level: "aviso", message: `${ty.name}: ${off.length} terça(s) sem montante embaixo (${off.map(p => cmBr(p.sMm)).join("; ")} cm da ponta). As terças seguem o tipo 1; ajuste os montantes deste tipo.` });
    if (!t.lineTypes.includes(ty.id)) out.push({ level: "aviso", message: `${ty.name} não está em nenhuma linha de tesoura.` });
  }
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
  // Cada linha de tesoura com o seu tipo; banzos e montantes agrupados por perfil.
  const perLine = Array.from({ length: n }, (_, i) => { const e = trussOfLine(t, i); return { e, pieces: trussPiecesComplete(e) }; });
  type Group = { profile: TrussEditor["chord"]; lengths: number[]; fullMm: number };
  // Não agrupar por nome isoladamente: massa, preço e folga podem divergir mesmo com a mesma designação.
  const profileKey = (p: TrussEditor["chord"]) => JSON.stringify([p.designation, p.kgPerM, p.barPriceCents, p.extraBars]);
  const group = (key: "chord" | "web") => {
    const m = new Map<string, Group>(), kinds: TrussPiece["kind"][] = key === "chord" ? ["BI", "BS"] : ["M", "D"];
    for (const { e, pieces } of perLine) {
      // Banzos: superior e inferior podem ter perfis diferentes; mesmo perfil = mesmo grupo de compra.
      for (const kind of kinds) {
        const profile = profileOfPiece(e, kind), keyOfProfile = profileKey(profile);
        const g = m.get(keyOfProfile) ?? { profile, lengths: [], fullMm: 0 };
        g.lengths.push(...pieces.filter(p => p.kind === kind).map(p => p.lengthMm));
        m.set(keyOfProfile, g);
      }
      if (key === "web") {
        const g = m.get(profileKey(e.web))!; // medida cheia (como o Tom orça): montante na altura máxima, diagonal no painel mais largo
        const est = stations(e), maxPanel = Math.max(...est.slice(1).map((x, i) => x - est[i]));
        g.fullMm += pieces.filter(p => p.kind === "M").length * t.highHeightMm + pieces.filter(p => p.kind === "D").length * Math.hypot(maxPanel, t.highHeightMm);
      }
    }
    return [...m.values()];
  };
  const chordGroups = group("chord"), webGroups = group("web");
  const purlins = roofPurlinPositions(t), bays = n - 1, purlinPiece = t.lengthMm / bays;
  const purlinL = purlins.flatMap(() => Array(bays).fill(purlinPiece) as number[]);
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const purlin = barsFor(purlinL, t.stockMm);
  const extra = (g: Group) => g.profile.extraBars;
  // Diferenciar visualmente linhas de um mesmo nome com especificações comerciais distintas.
  const profileLabel = (g: Group, groups: Group[]) => {
    const p = g.profile;
    if (groups.filter(x => x.profile.designation === p.designation).length === 1) return p.designation;
    const price = p.barPriceCents === null ? "preço pendente" : `R$ ${(p.barPriceCents / 100).toFixed(2)}/barra`;
    return `${p.designation} (${p.kgPerM} kg/m; ${price}; folga ${p.extraBars})`;
  };
  // Integração #156: identifique os grupos de compra como superior/inferior.
  // Quando são o mesmo perfil, permanece a linha única histórica "Banzos".
  const chordKindsByProfile = new Map<string, Set<"BI" | "BS">>();
  for (const { e } of perLine) for (const kind of ["BI", "BS"] as const) {
    const profile = kind === "BI" ? (e.bottomChord ?? e.chord) : e.chord;
    const key = profileKey(profile);
    const kinds = chordKindsByProfile.get(key) ?? new Set<"BI" | "BS">();
    kinds.add(kind);
    chordKindsByProfile.set(key, kinds);
  }
  const kindBars = (kind: "BI" | "BS") => {
    const m = new Map<string, number[]>();
    for (const { e, pieces } of perLine) {
      const profile = kind === "BI" ? (e.bottomChord ?? e.chord) : e.chord;
      const key = profileKey(profile);
      m.set(key, [...(m.get(key) ?? []), ...pieces.filter(p => p.kind === kind).map(p => p.lengthMm)]);
    }
    return [...m.values()].reduce((sum, lengths) => sum + barsFor(lengths, t.stockMm).bars, 0);
  };
  const chordRows = chordGroups.map(g => ({ g, bars: barsFor(g.lengths, t.stockMm).bars, extra: extra(g) }));
  const webRows = webGroups.map(g => { const real = barsFor(g.lengths, t.stockMm).bars, full = Math.ceil(g.fullMm / (t.stockMm - 10));
    return { g, real, full, bars: (t.fullHeightBudget ? full : real), extra: extra(g) }; });
  const chord = { bars: sum(chordRows.map(r => r.bars)) }, web = { bars: sum(webRows.map(r => r.real)) };
  const webFullBars = sum(webRows.map(r => r.full));
  const kg = (l: number[], p: { kgPerM: number }) => sum(l) / 1000 * p.kgPerM;
  const kgGroups = (gs: Group[]) => sum(gs.map(g => kg(g.lengths, g.profile)));
  const slopeMm = Math.hypot(L, t.highHeightMm - t.tipHeightMm), runMm = slopeMm + t.sheet.beyondTipMm * slopeMm / L;
  const k = t.sheet.piecesPerSlope, sheetLengthMm = Math.ceil((runMm + (k - 1) * t.sheet.overlapMm) / k / 10) * 10;
  const columns = Math.ceil(t.lengthMm / t.sheet.usefulWidthMm), sheets = columns * k * slopeCount(t), sheetM = sheets * sheetLengthMm / 1000;
  // Geometria (calha/recuo) segue o modo da obra; o que fica embaixo de cada ponta vem de trussEnds.
  const onColumns = t.support === "columns", nCols = columnCount(t), wallPlates = wallPlateCount(t);
  const columnL = Array(nCols).fill(t.supportZMm) as number[];
  const column = !nCols ? { bars: 0, wasteMm: 0 } : t.supportZMm <= t.stockMm - 10 ? barsFor(columnL, t.stockMm)
    : { bars: Math.ceil(sum(columnL) / (t.stockMm - 10)), wasteMm: 0 };
  const supports = n * 2, basePlates = nCols, plates = basePlates + wallPlates, bolts = plates * t.anchor.boltsPerSupport;
  const screws = Math.ceil((columns * purlins.length * 4 + (columns - 1) * slopeCount(t) * Math.ceil(slopeMm / 500)) / 50) * 50;
  const areaM2 = t.spanMm * t.lengthMm / 1e6;
  const webBars = sum(webRows.map(r => r.bars + r.extra));
  const chordBars = sum(chordRows.map(r => r.bars + r.extra)), purlinBars = purlin.bars + t.purlin.extraBars;
  const columnBars = nCols ? column.bars + t.column.extraBars : 0;
  const money = (bars: number, p: { barPriceCents: number | null }) => p.barPriceCents === null ? null : bars * p.barPriceCents;
  const lines = [
    ...chordRows.map(r => ({ item: `${(chordKindsByProfile.get(profileKey(r.g.profile))?.size ?? 0) === 2 ? "Banzos" : chordKindsByProfile.get(profileKey(r.g.profile))?.has("BI") ? "Banzo inferior" : "Banzo superior"} ${profileLabel(r.g, chordGroups)}`, qty: `${r.bars + r.extra} barras${r.extra ? ` (+${r.extra} folga)` : ""}`, cents: money(r.bars + r.extra, r.g.profile) })),
    ...webRows.map(r => ({ item: `Montantes e diagonais ${profileLabel(r.g, webGroups)}${t.fullHeightBudget ? " (medida cheia)" : ""}`, qty: `${r.bars + r.extra} barras${t.fullHeightBudget ? ` · corte real ${r.real}` : ""}${r.extra ? ` (+${r.extra} folga)` : ""}`, cents: money(r.bars + r.extra, r.g.profile) })),
    ...(nCols ? [{ item: `Pilares ${t.column.designation}`, qty: `${columnBars} barras · ${nCols} pilares de ${(t.supportZMm / 1000).toFixed(2).replace(".", ",")} m${t.supportZMm > t.stockMm - 10 ? " (com emenda)" : ""}${t.column.extraBars ? ` (+${t.column.extraBars} folga)` : ""}`, cents: money(columnBars, t.column) }] : []),
    { item: `Terças ${t.purlin.designation}`, qty: `${purlinBars} barras${t.purlin.extraBars ? ` (+${t.purlin.extraBars} folga)` : ""}`, cents: money(purlinBars, t.purlin) },
    { item: "Telha", qty: `${sheets} × ${(sheetLengthMm / 1000).toFixed(2).replace(".", ",")} m (${slopeCount(t)} água(s), ${k} peça(s)/água)`, cents: t.sheet.pricePerMCents === null ? null : Math.round(sheetM * t.sheet.pricePerMCents) },
    ...(t.gutter.budgeted && !onColumns ? [{ item: "Calha (m)", qty: `${(t.lengthMm * slopeCount(t) / 1000).toFixed(2).replace(".", ",")} m (${slopeCount(t)} lado(s))`,
      cents: t.gutter.pricePerMCents === null ? null : Math.round(t.gutter.pricePerMCents * t.lengthMm * slopeCount(t) / 1000) }] : []),
    ...([["Chapa de base", basePlates], ["Chapa de ancoragem", wallPlates]] as const).filter(([, q]) => q > 0).map(([name, q]) =>
      ({ item: `${name} ${Math.round(t.anchor.plateWidthMm / 10)} x ${Math.round(t.anchor.plateHeightMm / 10)} cm`, qty: `${q} un${name === "Chapa de base" && wallPlates ? " (pilares)" : name === "Chapa de ancoragem" && basePlates ? " (muros)" : ""}`, cents: t.anchor.platePriceCents === null ? null : q * t.anchor.platePriceCents })),
    { item: `Chumbador ${(t.anchor.boltLengthMm / 1000).toFixed(2).replace(".", ",")} m`, qty: `${bolts} un`, cents: t.anchor.boltPriceCents === null ? null : bolts * t.anchor.boltPriceCents },
    { item: "Parafusos", qty: `${screws} un`, cents: t.screwPriceCents === null ? null : screws * t.screwPriceCents },
    { item: "Insumos", qty: "—", cents: t.consumablesCents },
    { item: "Mão de obra", qty: `${areaM2.toFixed(1).replace(".", ",")} m²`, cents: t.laborPerM2Cents === null ? null : Math.round(areaM2 * t.laborPerM2Cents) },
  ];
  return {
    trussLengthMm: L, fallPercent: fallPercent(t), stations: st, pieces: one, purlins,
    bars: { chord: chord.bars, web: web.bars, webFullHeight: webFullBars, purlin: purlin.bars },
    chordBreakdown: { upperBars: kindBars("BS"), lowerBars: kindBars("BI") }, // estatísticas, não somar se agrupados
    buy: { chord: chordBars, web: webBars, purlin: purlinBars, column: columnBars }, columns, supports, plates, basePlates, wallPlates, bolts, columnCount: nCols,
    kg: { chord: kgGroups(chordGroups), web: kgGroups(webGroups), purlin: kg(purlinL, t.purlin), column: kg(columnL, t.column),
      total: kgGroups(chordGroups) + kgGroups(webGroups) + kg(purlinL, t.purlin) + kg(columnL, t.column) },
    lineTypes: Array.from({ length: n }, (_, i) => lineTypeId(t, i)),
    sheets, sheetLengthMm, sheetM, screws, areaM2, lines,
    gutterLine: onColumns ? "Tesoura sobre pilares: calha e muros não modelados" : `Calha ${Math.round(t.gutter.widthMm / 10)} cm × ${(t.lengthMm * slopeCount(t) / 1000).toFixed(2).replace(".", ",")} m${t.gutter.budgeted ? (t.gutter.pricePerMCents === null ? " — preço pendente" : " — incluída no orçamento") : " — fora do orçamento"}`,
    knownCents: lines.reduce((s, l) => s + (l.cents ?? 0), 0), missing: lines.filter(l => l.cents === null).map(l => l.item),
  };
}

const area = (kgPerM: number) => Number((kgPerM / 7850 * 1e4).toFixed(4));
/**
 * Grava a tesoura no projeto como estrutura DECLARADA: 3D, CAD, lista de
 * materiais e plano de corte passam a usar exatamente estas peças.
 */
/** Grupos de peças que o próprio editor cria; o resto pertence a outra origem. */
const EDITOR_GROUPS = new Set(["TESOURA", "TERCAS", "PILARES-TESOURA"]);

/**
 * O que "Aplicar" vai substituir. O editor reescreve a estrutura física inteira
 * (tesouras + terças sobre muros), então pilares, vigas e outras peças que não
 * vieram dele somem. Serve para pedir confirmação antes.
 */
export function trussReplacementImpact(project: Project): { replaces: boolean; source: "generated" | "declared" | null; lines: string[] } {
  const counts = new Map<string, number>();
  const bump = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1);
  let source: "generated" | "declared" | null = null;
  const declared = project.workspace.physicalStructure;
  if (declared) {
    for (const p of declared.pieces) if (!EDITOR_GROUPS.has(p.group ?? "")) bump(physicalRoleLabels[p.role]);
    if (counts.size) source = "declared";
  } else if (project.planning) {
    const model = generateStructure(project).model;
    for (const p of model?.pieces ?? []) bump(roleLabels[p.role]);
    if (counts.size) source = "generated";
  }
  const lines = [...counts].map(([label, n]) => `${label}: ${n}`);
  return { replaces: lines.length > 0, source, lines };
}

type Dof = "fixed" | "free";
type Dofs = [Dof, Dof, Dof, Dof, Dof, Dof];
/** Vínculos [UX, UY, UZ, RX, RY, RZ] (X no vão, Y no comprimento, Z para cima) declarados no editor.
 * Muro: translações contidas, torção (RX) contida pela chapa soldada, giro no plano (RY) e RZ livres;
 * em linha com os DOIS apoios em muro e `wallsSlide`, uma ponta desliza em X para não empurrar o muro
 * (duas águas: a da direita; uma água: a ponta baixa, ficando fixa a ancoragem do muro alto).
 * Pilar: base engastada (6 graus) ou articulada (translações contidas, rotações livres). */
export function supportRestraints(t: TrussEditor) {
  return (line: number, side: TrussSide, kind: EndSupport): Dofs => {
    if (kind === "column") return t.supportModel.columnBase === "fixed"
      ? ["fixed", "fixed", "fixed", "fixed", "fixed", "fixed"] : ["fixed", "fixed", "fixed", "free", "free", "free"];
    const bothWalls = endSupportOf(t, line, "left") === "wall" && endSupportOf(t, line, "right") === "wall";
    const slidingSide: TrussSide = slopeCount(t) === 2 ? "right" : "left";
    const slides = bothWalls && t.supportModel.wallsSlide && side === slidingSide;
    return [slides ? "free" : "fixed", "fixed", "fixed", "fixed", "free", "free"];
  };
}

export function applyTrussToProject(project: Project, input: TrussEditor, revision = "TESOURA-EDITOR"): Project {
  const t = trussEditorSchema.parse(input), issues = trussIssues(t).filter(i => i.level === "erro");
  if (issues.length) throw Error(issues.map(i => i.message).join(" "));
  const x0 = tipOffsetMm(t), Z0 = t.supportZMm, L = trussLengthMm(t), S = slopeCount(t), bays = t.trusses - 1;
  const ys = Array.from({ length: t.trusses }, (_, f) => f * t.lengthMm / bays);
  type Node = { id: string; x: number; y: number; z: number };
  type Piece = { id: string; role: "topChord" | "bottomChord" | "web" | "purlin" | "column"; start: string; end: string; label: string; group: string };
  const nodes: Node[] = [], pieces: Piece[] = [], keys = new Map<string, string>();
  const node = (x: number, y: number, z: number) => {
    const k = [x, y, z].map(v => v.toFixed(3)).join("/");
    if (!keys.has(k)) { const id = `N${nodes.length + 1}`; nodes.push({ id, x, y, z }); keys.set(k, id); }
    return keys.get(k)!;
  };
  const role = { BI: "bottomChord", BS: "topChord", M: "web", D: "web" } as const;
  const label = { BI: "Banzo inferior", BS: "Banzo superior", M: "Montante", D: "Diagonal" } as const;
  // Seções por perfil: tipos com o mesmo perfil compartilham a seção.
  const sectionOf = new Map<string, string>(), sectionProfiles: { id: string; p: TrussEditor["chord"] }[] = [];
  const sectionFor = (base: string, p: TrussEditor["chord"]) => {
    const key = `${base}|${p.designation}|${p.kgPerM}`;
    if (!sectionOf.has(key)) { const id = sectionProfiles.some(x => x.id === base) ? `${base}-${sectionProfiles.filter(x => x.id.startsWith(base)).length + 1}` : base; sectionOf.set(key, id); sectionProfiles.push({ id, p }); }
    return sectionOf.get(key)!;
  };
  const pieceSection = new Map<string, string>();
  ys.forEach((y, f) => {
    const e = trussOfLine(t, f);
    const sec = { BS: sectionFor("CHORD", e.chord), BI: sectionFor("CHORD", bottomChordOf(e)), M: sectionFor("WEB", e.web), D: sectionFor("WEB", e.web) };
    for (const p of trussPiecesComplete(e)) {
      const id = `T${f + 1}-${p.id}`;
      pieces.push({ id, role: role[p.kind], start: node(x0 + p.a[0], y, Z0 + p.a[1]), end: node(x0 + p.b[0], y, Z0 + p.b[1]),
        label: `${label[p.kind]} ${profileOfPiece(e, p.kind).designation}`, group: "TESOURA" });
      pieceSection.set(id, sec[p.kind]);
    }
  });
  sectionFor("PURLIN", t.purlin);
  const ends = trussEnds(t), nCols = ends.filter(e => e.kind === "column").length;
  if (nCols) sectionFor("COLUMN", t.column);
  // Cada ponta de cada tesoura: pilar novo (do piso z = 0 ao banzo inferior) ou muro existente
  // (a ponta apoia direto no topo do muro, na cota do banzo inferior). A geometria da tesoura é a mesma.
  const endX = (side: TrussSide) => side === "left" ? x0 : x0 + S * L;
  const supportNodes: { nodeId: string; line: number; side: TrussSide; kind: EndSupport }[] = [];
  for (const e of ends) {
    const x = endX(e.side), y = ys[e.line], top = node(x, y, Z0);
    if (e.kind === "column") {
      const foot = node(x, y, 0);
      pieces.push({ id: `P${e.line + 1}-${e.side === "left" ? "E" : "D"}`, role: "column", start: foot, end: top, label: `Pilar ${t.column.designation}`, group: "PILARES-TESOURA" });
      supportNodes.push({ nodeId: foot, ...e });
    } else supportNodes.push({ nodeId: top, ...e });
  }
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
    sections: sectionProfiles.map(({ id, p }) => ({ id, designation: p.designation, areaCm2: area(p.kgPerM), iyCm4: null, izCm4: null, jCm4: null,
      sectionSource: `Massa linear informada ${p.kgPerM} kg/m (área equivalente)`, sectionRevision: revision })),
    assignments: pieces.map(p => ({ pieceId: p.id, materialId: "ACO", sectionId: pieceSection.get(p.id) ?? (p.role === "purlin" ? "PURLIN" : "COLUMN"), rotationDeg: null })),
  };
  const xs = x0 - t.sheet.beyondTipMm, ridge = x0 + L, xe = x0 + S * L + (S === 2 ? t.sheet.beyondTipMm : tipOffsetMm(t));
  const zLeft = (x: number) => Z0 + heightAt(t, x - x0);
  const zRight = (x: number) => Z0 + heightAt(t, x0 + 2 * L - x);
  // Vínculo exclusivamente geométrico: terças associadas à superfície por posição XY.
  const purlinIdsFor = (a: number, b: number): string[] => pieces.filter(p => p.role === "purlin").filter(p => {
    const start = nodes.find(n => n.id === p.start);
    return !!start && start.x >= a - 1e-6 && start.x <= b + 1e-6;
  }).map(p => p.id);
  const rectangle = (id: string, a: number, b: number, z: (x: number) => number) => ({
    id, source: "Editor de tesoura JPN / geometria declarada sem ligação estrutural", revision, supportPieceIds: purlinIdsFor(a,b),
    outer: [[a, 0, z(a)], [b, 0, z(b)], [b, t.lengthMm, z(b)], [a, t.lengthMm, z(a)], [a, 0, z(a)]] as [number, number, number][],
    holes: [],
  });
  draft.physicalRoofFaces = physicalRoofFacesSchema.parse({
    schema_version: "jpn.physical-roof-faces/1", units: "mm", source: "Editor de tesoura JPN", revision,
    faces: S === 1 ? [rectangle("AGUA", xs, xe, zLeft)] :
      [rectangle("AGUA-E", xs, ridge, zLeft), rectangle("AGUA-D", ridge, xe, zRight)],
  });
  // Vínculos DECLARADOS pelo construtor no editor (supportModel), um por ponta, com a interface
  // física (muro existente ou pilar novo) para o motor separar e auditar as reações de cada uma.
  const restraints = supportRestraints(t);
  draft.supports = supportNodes.map(s => ({ nodeId: s.nodeId, dofs: [...restraints(s.line, s.side, s.kind)] }));
  const review = t.supportModel.wallSiteReview.trim(), reviewed = review.length >= 5;
  draft.supportInterfaces = supportNodes.map(s => {
    const dofs = restraints(s.line, s.side, s.kind), sliding = s.kind === "wall" && dofs[0] === "free";
    return {
      nodeId: s.nodeId, side: s.side === "left" ? "A" as const : "B" as const,
      kind: s.kind === "wall" ? "existing-masonry" as const : "new-steel-column" as const, dofs,
      source: s.kind === "wall" && reviewed ? `Editor de tesoura JPN; conferência do muro no local: ${review}` : "Editor de tesoura JPN — apoio declarado pelo construtor",
      revision,
      loadPath: s.kind === "wall" ? "Tesoura -> chapa chumbada no topo do muro -> alvenaria existente (não verificada pelo JPN)"
        : "Tesoura -> pilar metálico -> chapa de base e chumbadores -> fundação (não verificada pelo JPN)",
      restraintBasis: s.kind === "wall"
        ? `Tesoura ${s.line + 1}, ponta ${s.side === "left" ? "esquerda" : "direita"} sobre muro: ${sliding ? "desliza na direção do vão (furo oblongo), " : "translações contidas, "}torção contida pela chapa soldada, giro no plano livre.`
        : `Tesoura ${s.line + 1}, ponta ${s.side === "left" ? "esquerda" : "direita"} sobre pilar: base ${t.supportModel.columnBase === "fixed" ? "engastada (chapa e chumbadores à flexão)" : "articulada (exige contraventamento)"}.`,
      reviewStatus: s.kind === "wall" && reviewed ? "site-reviewed" as const : "hypothesis" as const,
    };
  });
  next.workspace.spatialPreparation = draft;
  draft.geometrySignature = structureSignature(next); // APÓS atribuir catálogo e perfis
  next.workspace.overallDimensionChecks = [{ axis: "y", statedLengthMm: t.lengthMm, source: "Comprimento da obra (editor de tesoura)", revision }];
  next.workspace.trussEditor = t;
  next.technicalNotes = [
    `Tesoura do editor JPN: ${S} água(s), semivão útil ${(L / 1000).toFixed(2)} m por água, altura na ponta ${t.tipHeightMm} mm e na ${S === 2 ? "cumeeira" : "extremidade alta"} ${t.highHeightMm} mm (inclinação ${fallPercent(t).toFixed(1)} %), ${stations(t).length} montantes por semivão, diagonais ${t.diagonal}.`,
    ...(t.support === "columns" ? [] : [`Recuo da ponta baixa: apoio ${t.gutter.supportMm} + calha ${t.gutter.widthMm} + folga ${t.gutter.clearanceMm} mm; calha com lado menor ${t.gutter.lowSideMm} e maior ${t.gutter.highSideMm} mm${t.gutter.budgeted ? "" : " (fora do orçamento)"}.`]),
    ...(hasMixedSupports(t) ? [`Apoios mistos: ${(["left", "right"] as const).map(side => `ponta ${side === "left" ? "esquerda" : "direita"} — muro nas tesouras ${ends.filter(e => e.side === side && e.kind === "wall").map(e => e.line + 1).join(", ") || "nenhuma"}, pilar nas tesouras ${ends.filter(e => e.side === side && e.kind === "column").map(e => e.line + 1).join(", ") || "nenhuma"}`).join("; ")}.`] : []),
    `Vínculos declarados no editor: ${nCols ? `base do pilar ${t.supportModel.columnBase === "fixed" ? "engastada" : "articulada"}; ` : ""}${ends.some(e => e.kind === "wall") ? `muro com chapa soldada (torção contida)${t.supportModel.wallsSlide ? ", uma ponta deslizante quando a tesoura apoia em dois muros" : ", sem ponta deslizante"}; muro ${reviewed ? `conferido no local (${review})` : "AINDA NÃO conferido no local — cálculo bloqueado até a conferência"}` : ""}.`,
    t.support === "columns"
      ? `Apoio em ${columnCount(t)} pilares ${t.column.designation} de ${t.supportZMm} mm (piso ao banzo inferior), nas pontas das tesouras em pilar; vínculos das bases conforme hipótese declarada abaixo. Chapa de base ${t.anchor.plateWidthMm} x ${t.anchor.plateHeightMm} mm com ${t.anchor.boltsPerSupport} chumbador(es) de ${t.anchor.boltLengthMm} mm por pilar (sem verificação).`
      : `Muros: beiral baixo ${t.walls.lowMm} mm, ${S === 1 ? `lado alto ${t.walls.highMm} mm` : "ambos os beirais no mesmo nível declarado"} (espessura ${t.walls.thicknessMm}); banzo inferior a ${t.supportZMm} mm do piso. Chapa de ancoragem ${t.anchor.plateWidthMm} x ${t.anchor.plateHeightMm} mm, ${t.anchor.boltsPerSupport} chumbador(es) de ${t.anchor.boltLengthMm} mm por ${S === 1 ? "muro alto" : "beiral"} (sem verificação).`,
    `Telha em ${t.sheet.piecesPerSlope} peça(s) por água${t.sheet.piecesPerSlope > 1 ? `, sobreposição ${t.sheet.overlapMm} mm` : ""}.`,
    ...(t.types.length ? [`Tipos de tesoura: ${[BASE_TYPE, ...t.types.map(x => x.id)].map(id => `${typeName(t, id)} nas linhas ${Array.from({ length: t.trusses }, (_, i) => i).filter(i => lineTypeId(t, i) === id).map(i => i + 1).join(", ") || "nenhuma"}`).join("; ")}. Cobertura, apoios e terças iguais; muda o desenho interno e os perfis.`] : []),
    `Distribuição preliminar: ${t.trusses} tesoura(s), ${Math.round(t.lengthMm/(t.trusses-1))} mm entre elas; posições não constituem apoios verificados.`,
    ...(t.fullHeightBudget ? [`Montantes/diagonais: compra por medida cheia ${trussSummary(t).buy.web} barras; corte geométrico real ${trussSummary(t).bars.web} barras (sem liberação para fabricar).`] : []),
  ].join(" ");
  next.updatedAt = new Date().toISOString();
  // Preparação do cálculo (aço, inércias, tipos de peça, ações NBR 6120 e combinações NBR 8681).
  // Prioridade é a lista de materiais: se a preparação do cálculo não couber (limite do motor, inclinação
  // fora da norma, perfil desconhecido...), a obra é aplicada do mesmo jeito e o motivo vira pendência.
  let prepared: { project: Project; pending: { code: string; message: string }[] };
  try {
    prepared = prepareTrussAnalysis(next, t, { x0, L, S: S as 1 | 2, xs, xe,
      risePerRun: (t.highHeightMm - t.tipHeightMm) / L, slopePercent: fallPercent(t) }, revision);
  } catch (e) {
    prepared = { project: next, pending: [{ code: "TRUSS_ANALYSIS_NOT_PREPARED", message: `cálculo não preparado automaticamente (${e instanceof Error ? e.message : String(e)}); a lista de materiais não é afetada.` }] };
  }
  prepared.project.technicalNotes = [next.technicalNotes,
    "CÁLCULO PREPARADO PELO EDITOR (hipóteses a conferir): aço E=200 GPa; inércias pela linha média; banzos/pilares pórtico, montantes/diagonais axiais, terças biapoiadas; peso próprio, telha e sobrecarga NBR 6120 nas terças; combinações NBR 8681.",
    ...prepared.pending.map(p => `PENDENTE ${p.code}: ${p.message}`),
    "Sem dimensionamento, ligações ou fundações verificados. Não usar para fabricação."].join(" ");
  return prepared.project;
}
