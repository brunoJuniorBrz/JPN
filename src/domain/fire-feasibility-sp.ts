import { SP_FIRE_RULESET, SP_FIRE_OCCUPANCIES, spFireReference, type SpFireOccupancy } from "./fire-rules-sp";

/** Métricas geométricas; NÃO equivalem à área construída oficial. */
export type FireProjectContext = "unknown" | "new-building" | "existing-building" | "open-roof";
export interface FireScreeningInput {
  widthM: number | null;
  lengthM: number | null;
  /** Altura definida nos termos do regulamento; não é altura de telha, beiral ou cumeeira. */
  legalHeightM?: number | null;
  occupancy?: SpFireOccupancy | null;
  context?: FireProjectContext;
  mezzanineAreaM2?: number | null;
  /** Outras áreas construídas conectadas à edificação. Nunca presumir zero sem declaração. */
  additionalBuiltAreaM2?: number | null;
  /** Confirma que as dimensões representam TODA a área térrea relevante, ainda sem exclusões. */
  footprintConfirmed?: boolean;
  terrain?: { widthM: number; lengthM: number; setbackSideM?: number; setbackFrontM?: number; setbackRearM?: number };
  minimumOperationalAreaM2?: number | null;
}
export type GeneralStatus = "preliminary-band" | "missing-information" | "technical-review";
export type MeasureStatus = "not-assessed" | "requires-it-review" | "professional-review-required";
export interface FireScreeningResult {
  status: GeneralStatus;
  geometryAreaM2: number | null;
  screeningBuiltAreaM2: number | null;
  areaBand: "up-to-750" | "over-750" | "undetermined";
  heightBand: "up-to-12" | "over-12" | "undetermined";
  table: "5" | "6J-1" | "6J-2" | "specific-table-pending" | "undetermined";
  mezzanineRatio: number | null;
  mezzanineDefinition: "within-one-third" | "above-one-third" | "unknown" | "none-declared";
  notes: string[];
  missing: string[];
  hydrants: { status: MeasureStatus; note: string };
  economicActivityRisk: { status: "not-assessed"; note: string };
  rule: ReturnType<typeof spFireReference>;
}
const positive = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n) && n > 0;
const nonnegative = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n) && n >= 0;
const round = (v: number) => Math.round(v * 1000000) / 1000000;
const tableFor = (occupation: SpFireOccupancy | null | undefined, small: boolean) => {
  if (small) return "5" as const;
  if (occupation === "J-1" || occupation === "J-2") return "6J-1" as const;
  if (occupation === "J-3" || occupation === "J-4") return "6J-2" as const;
  return occupation ? "specific-table-pending" as const : "undetermined" as const;
};

export function assessSpFireScreening(input: FireScreeningInput): FireScreeningResult {
  const geometryAreaM2 = positive(input.widthM) && positive(input.lengthM) ? round(input.widthM * input.lengthM) : null;
  const mezz = input.mezzanineAreaM2;
  const additional = input.additionalBuiltAreaM2;
  const missing: string[] = [];
  const notes: string[] = [];
  const context = input.context ?? "unknown";
  if (geometryAreaM2 === null) missing.push("Dimensões positivas e finitas da cobertura.");
  if (context === "unknown") missing.push("Se é galpão novo, edificação existente ou cobertura aberta.");
  if (context === "open-roof") notes.push("Cobertura aberta: projeção geométrica não determina a área computável nem a ocupação.");
  if (context === "existing-building") notes.push("Obra existente: é necessário conhecer área já construída, ocupação e condições aplicáveis (inclusive IT-43).");
  if (!input.footprintConfirmed) missing.push("Confirmação da área térrea integral da edificação (não apenas projeção da cobertura).");
  if (!nonnegative(mezz)) missing.push("Área do mezanino, ou zero explicitamente se não houver.");
  if (!nonnegative(additional)) missing.push("Outras áreas construídas, ou zero explicitamente se não houver.");
  if (!input.occupancy || !(input.occupancy in SP_FIRE_OCCUPANCIES)) missing.push("Divisão de ocupação confirmada; descrição genérica não substitui classificação.");
  if (!nonnegative(input.legalHeightM)) missing.push("Altura regulamentar confirmada (não usar altura da cumeeira).");
  if (positive(mezz) && geometryAreaM2 !== null && mezz > geometryAreaM2 / 3 + 1e-8)
    notes.push("Área de piso intermediário supera 1/3 do pavimento: não presumir enquadramento como mezanino.");
  let mezzanineDefinition: FireScreeningResult["mezzanineDefinition"] = "unknown";
  if (mezz === 0) mezzanineDefinition = "none-declared";
  else if (positive(mezz) && geometryAreaM2 !== null)
    mezzanineDefinition = mezz <= geometryAreaM2 / 3 + 1e-8 ? "within-one-third" : "above-one-third";
  const mezzanineRatio = positive(mezz) && geometryAreaM2 !== null ? round(mezz / geometryAreaM2) : mezz === 0 ? 0 : null;
  // Somatório conservador para TRIAGEM, sem exclusões automáticas do art. 18.
  const screeningBuiltAreaM2 = geometryAreaM2 !== null && nonnegative(mezz) && nonnegative(additional) &&
    input.footprintConfirmed && context === "new-building"
    ? round(geometryAreaM2 + mezz + additional) : null;
  if (screeningBuiltAreaM2 === null)
    notes.push("A projeção geométrica NÃO foi convertida em área regulamentar; faltam declarações sobre área/edificação.");
  if (screeningBuiltAreaM2 !== null)
    notes.push("Área de triagem conservadora: térreo + mezanino + demais áreas, sem deduções automáticas do art. 18.");
  const areaBand: FireScreeningResult["areaBand"] = screeningBuiltAreaM2 === null ? "undetermined" :
    screeningBuiltAreaM2 <= SP_FIRE_RULESET.areaThresholdM2 ? "up-to-750" : "over-750";
  const heightBand: FireScreeningResult["heightBand"] = !nonnegative(input.legalHeightM) ? "undetermined" :
    input.legalHeightM <= SP_FIRE_RULESET.legalHeightThresholdM ? "up-to-12" : "over-12";
  const complete = missing.length === 0 && screeningBuiltAreaM2 !== null;
  const table = complete ? tableFor(input.occupancy, areaBand === "up-to-750" && heightBand === "up-to-12") : "undetermined";
  const technical = context === "existing-building" || context === "open-roof" ||
    mezzanineDefinition === "above-one-third" || heightBand === "over-12";
  const status: GeneralStatus = technical ? "technical-review" : complete ? "preliminary-band" : "missing-information";
  let hydrants: FireScreeningResult["hydrants"] = {
    status: "not-assessed",
    note: "Hidrantes não avaliados. Área isolada não autoriza concluir isenção ou obrigatoriedade.",
  };
  if (complete) {
    hydrants = {
      status: (table === "6J-1" && input.occupancy === "J-2") || input.occupancy === "I-1"
        ? "requires-it-review" : "professional-review-required",
      note: (table === "6J-1" && input.occupancy === "J-2") || (table !== "5" && input.occupancy === "I-1")
        ? "Conferir tabela de ocupação e possíveis condições da IT-22; nenhuma isenção foi validada."
        : "Medidas por ocupação e notas das ITs ainda exigem conferência profissional; nenhuma dispensa foi determinada.",
    };
  }
  notes.push("Tabela preliminar, sem revisão por profissional de SCI. A atividade econômica possui classificação de risco própria; não inferida pela carga de incêndio.");
  notes.push("Mudança de uso, ampliação futura ou isolamento de risco exigem avaliação nova. Nunca dividir obras artificialmente.");
  return {
    status, geometryAreaM2, screeningBuiltAreaM2, areaBand, heightBand, table, mezzanineRatio,
    mezzanineDefinition, notes, missing, hydrants,
    economicActivityRisk: { status: "not-assessed", note: "Classificação da atividade econômica não avaliada; é eixo separado do Anexo A." },
    rule: spFireReference(),
  };
}

export interface GeometricScenario {
  widthM: number;
  lengthM: number;
  geometricAreaM2: number;
  estimatedScreeningAreaM2: number;
  differenceFromRequestedM2: number;
  note: string;
}
/**
 * Sugere APENAS alternativa geométrica abaixo do marco de TRIAGEM de 750 m².
 * Requer terreno, área operacional mínima e declaração de área integral.
 * Não considera recuos municipais desconhecidos, segurança, custo ou aprovação.
 */
export function findSpGeometricScenario(input: FireScreeningInput): GeometricScenario | null {
  const original = assessSpFireScreening(input);
  const site = input.terrain;
  if (input.context !== "new-building" || original.screeningBuiltAreaM2 === null ||
    original.screeningBuiltAreaM2 <= SP_FIRE_RULESET.areaThresholdM2 ||
    !positive(input.widthM) || !positive(input.lengthM) ||
    !site || !positive(site.widthM) || !positive(site.lengthM) ||
    !positive(input.minimumOperationalAreaM2) ||
    input.minimumOperationalAreaM2 > input.widthM * input.lengthM ||
    !nonnegative(input.mezzanineAreaM2) || !nonnegative(input.additionalBuiltAreaM2)) return null;
  const side = site.setbackSideM, front = site.setbackFrontM, rear = site.setbackRearM;
  if (![side, front, rear].every(x => nonnegative(x))) return null; // Recuos precisam estar declarados.
  const maxW = site.widthM - 2 * side!;
  const maxL = site.lengthM - front! - rear!;
  if (!(maxW > 0 && maxL > 0)) return null;
  const targetArea = SP_FIRE_RULESET.areaThresholdM2 - input.mezzanineAreaM2 - input.additionalBuiltAreaM2;
  if (targetArea < input.minimumOperationalAreaM2 || targetArea <= 0) return null;
  // Nunca propor aumento de dimensão; preserva aproximadamente a proporção inicial.
  const maxAllowedW = Math.min(maxW, input.widthM);
  const maxAllowedL = Math.min(maxL, input.lengthM);
  if (maxAllowedW * maxAllowedL < input.minimumOperationalAreaM2) return null;
  const usable = Math.min(targetArea, maxAllowedW * maxAllowedL);
  let w = Math.min(maxAllowedW, Math.sqrt(usable * input.widthM / input.lengthM));
  let l = Math.min(maxAllowedL, usable / w);
  if (w * l < usable - 1e-7) w = Math.min(maxAllowedW, usable / l);
  // Arredondamento para baixo em cm, nunca ultrapassar limite na sugestão.
  w = Math.floor(w * 100) / 100;
  l = Math.floor(l * 100) / 100;
  if (!(w > 0 && l > 0)) return null;
  const area = round(w * l);
  if (area < input.minimumOperationalAreaM2 || area >= input.widthM * input.lengthM) return null;
  return {
    widthM: w, lengthM: l, geometricAreaM2: area,
    estimatedScreeningAreaM2: round(area + input.mezzanineAreaM2 + input.additionalBuiltAreaM2),
    differenceFromRequestedM2: round(input.widthM * input.lengthM - area),
    note: "Comparação geométrica para revisão: NÃO representa redução comprovada de exigências, licença, isenção de hidrantes ou viabilidade urbanística.",
  };
}
