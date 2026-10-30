import { roofSchema, type RoofParameters } from "../project-details";
import { formatMeasure, metersToMillimeters as mm } from "./units";

export const PRELIMINARY_NOTICE = "DESENHO PRELIMINAR — NÃO UTILIZAR PARA EXECUÇÃO";
export type ViewName = "plan" | "front" | "side";
export type Layer = "COBERTURA" | "EIXOS" | "APOIOS" | "COTAS" | "TEXTOS" | "PILARES" | "TERCAS" | "TESOURAS";
export interface Point { x: number; y: number; }
export type Entity = ({ type: "line"; a: Point; b: Point; layer: Layer } | { type: "text"; at: Point; text: string; height: number; layer: Layer } | { type: "circle"; at: Point; radius: number; layer: Layer }) & { pieceId?: string };
export interface GeometryView { entities: Entity[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; }
export interface RoofMetrics { projectedAreaM2: number; riseM: number; slopeLengthM: number; roofAreaM2: number; highHeightM: number; lowHeightM: number; widthM: number; lengthM: number; }
export interface GeometryModel { units: "mm"; revision: number; metrics: RoofMetrics; views: Record<ViewName, GeometryView>; validSupportCount: number; warnings: string[]; }
export interface GeometryResult { model: GeometryModel | null; pending: string[]; }

export function generateGeometry(input: RoofParameters, typology: "mono" | "gable" = "mono"): GeometryResult {
  const parsed = roofSchema.safeParse(input);
  if (!parsed.success) return { model: null, pending: ["Revise as medidas: use valores positivos, até 1.000 m, e inclinação entre 0 e 100%."] };
  const r = parsed.data;
  const pending: string[] = [];
  if (r.widthM === null) pending.push("Informe a largura.");
  if (r.lengthM === null) pending.push("Informe o comprimento.");
  if (r.lowHeightM === null) pending.push("Informe a altura do lado mais baixo.");
  if (r.slopePercent === null) pending.push("Informe a inclinação.");
  if (r.widthM === null || r.lengthM === null || r.lowHeightM === null || r.slopePercent === null) return { model: null, pending };
  const width = r.widthM, length = r.lengthM, low = r.lowHeightM;
  const acrossWidth = r.fall.startsWith("width"), positive = r.fall.endsWith("positive");
  const run = acrossWidth ? width : length, along = acrossWidth ? length : width;
  const rise = run * r.slopePercent / 100 / (typology === "gable" ? 2 : 1), slopeLength = Math.hypot(run, rise * (typology === "gable" ? 2 : 1));
  const metrics: RoofMetrics = { projectedAreaM2: width * length, riseM: rise, slopeLengthM: slopeLength, roofAreaM2: along * slopeLength, highHeightM: low + rise, lowHeightM: low, widthM: width, lengthM: length };
  const z = (x: number, y: number) => low + rise * (typology === "gable" ? 1 - Math.abs(2 * (acrossWidth ? x : y) / run - 1) : positive ? 1 - (acrossWidth ? x : y) / run : (acrossWidth ? x : y) / run);
  const vertices = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: length }, { x: 0, y: length }].map(p => ({ ...p, z: z(p.x, p.y) }));
  const validSupports = r.supports.filter(s => s.xM !== null && s.yM !== null && s.xM <= width && s.yM <= length);
  const warnings: string[] = [];
  if (!r.supports.length) warnings.push("Apoios não informados. A quantidade de pilares está pendente.");
  if (validSupports.length !== r.supports.length) warnings.push("Há apoios incompletos ou fora da cobertura. Corrija suas posições.");
  const unique = new Set(validSupports.map(s => `${s.xM}:${s.yM}`));
  if (unique.size !== validSupports.length) warnings.push("Há apoios na mesma posição. Revise antes de contar componentes.");
  if (r.slopePercent === 0) warnings.push("Inclinação zero: desenho horizontal. Verifique a especificação de drenagem.");
  const views = {} as Record<ViewName, GeometryView>;
  for (const view of ["plan", "front", "side"] as const) {
    const entities: Entity[] = [];
    const ext = Math.max(mm(width), mm(length), mm(low + rise), 1000);
    const font = ext * .05, gap = ext * .11;
    const line = (a: Point, b: Point, layer: Layer) => { if (Math.hypot(a.x - b.x, a.y - b.y) > .001) entities.push({ type: "line", a, b, layer }); };
    const text = (at: Point, value: string, layer: Layer = "TEXTOS") => entities.push({ type: "text", at, text: value, height: font, layer });
    const project = (p: { x: number; y: number; z: number }): Point => view === "plan" ? { x: mm(p.x), y: mm(p.y) } : { x: mm(view === "front" ? p.x : p.y), y: mm(p.z) };
    const seen = new Set<string>();
    vertices.forEach((p, i) => {
      const end = vertices[(i + 1) % 4];
      const split = typology === "gable" && (acrossWidth ? p.x !== end.x : p.y !== end.y);
      const mid = { x: (p.x + end.x) / 2, y: (p.y + end.y) / 2, z: low + rise };
      for (const [start, stop] of split ? [[p, mid], [mid, end]] : [[p, end]]) {
        const a = project(start), b = project(stop), key = [JSON.stringify(a), JSON.stringify(b)].sort().join("|");
        if (!seen.has(key)) { line(a, b, "COBERTURA"); seen.add(key); }
      }
    });
    if (typology === "gable") line(project({ x: acrossWidth ? width / 2 : 0, y: acrossWidth ? 0 : length / 2, z: low + rise }), project({ x: acrossWidth ? width / 2 : width, y: acrossWidth ? length : length / 2, z: low + rise }), "COBERTURA");
    const spanX = mm(view === "side" ? length : width), spanY = mm(view === "plan" ? length : low + rise);
    line({ x: -gap / 3, y: 0 }, { x: spanX + gap / 3, y: 0 }, "EIXOS");
    line({ x: 0, y: -gap / 3 }, { x: 0, y: spanY + gap / 3 }, "EIXOS");
    function dimHorizontal(span: number, y: number, label: string) {
      line({ x: 0, y }, { x: span, y }, "COTAS");
      for (const x of [0, span]) line({ x, y: y - font / 2 }, { x, y: y + font / 2 }, "COTAS");
      text({ x: span / 2, y: y - font * 1.7 }, label, "COTAS");
    }
    function dimVertical(x: number, span: number, label: string) {
      line({ x, y: 0 }, { x, y: span }, "COTAS");
      for (const y of [0, span]) line({ x: x - font / 2, y }, { x: x + font / 2, y }, "COTAS");
      text({ x: x - gap, y: span / 2 }, label, "COTAS");
    }
    dimHorizontal(spanX, -gap, `${view === "side" ? "Comprimento" : "Largura"} ${formatMeasure(spanX / 1000)} m`);
    dimVertical(-gap, view === "plan" ? mm(length) : mm(low), `${view === "plan" ? "Compr." : "Altura baixa"} ${formatMeasure(view === "plan" ? length : low)} m`);
    validSupports.forEach((s, i) => {
      const x = s.xM!, y = s.yM!, at = project({ x, y, z: z(x, y) });
      entities.push({ type: "circle", at, radius: font * .65, layer: "APOIOS" });
      text({ x: at.x + font, y: at.y + font * 1.5 }, `A${i + 1}`, "APOIOS");
    });
    if (view === "plan") {
      const center = { x: mm(width / 2), y: mm(length / 2) };
      const lengthArrow = mm(run * .35);
      for (const sign of typology === "gable" ? [-1, 1] : [positive ? 1 : -1]) {
        const start = typology === "gable" ? center : { x: center.x - (acrossWidth ? sign * lengthArrow / 2 : 0), y: center.y - (!acrossWidth ? sign * lengthArrow / 2 : 0) };
        const end = { x: center.x + (acrossWidth ? sign * lengthArrow / 2 : 0), y: center.y + (!acrossWidth ? sign * lengthArrow / 2 : 0) };
        line(start, end, "TEXTOS");
        for (const d of [-1, 1]) line(end, { x: end.x - (acrossWidth ? sign * font * 2 : d * font), y: end.y - (!acrossWidth ? sign * font * 2 : d * font) }, "TEXTOS");
      }
      text({ x: center.x, y: center.y + gap }, `${typology === "gable" ? "Duas águas" : "Queda"} ${formatMeasure(r.slopePercent, 2)}%`);
      text({ x: spanX / 2, y: spanY + gap }, "PLANTA • medidas horizontais");
    } else {
      text({ x: spanX / 2, y: spanY + gap }, `${view === "front" ? "FRENTE" : "LATERAL"} • inclinação ${formatMeasure(r.slopePercent, 2)}%`);
      text({ x: spanX / 2, y: spanY + gap * 1.7 }, `Alta ${formatMeasure(low + rise)} m • desnível ${formatMeasure(rise)} m`);
    }
    const bounds = { minX: -gap * 3.6, minY: -gap * 2.2, maxX: spanX + gap * 2, maxY: spanY + gap * 2.6 };
    // Inclui a extensão estimada dos textos para não cortar cotas ao ajustar a vista.
    for (const entity of entities) if (entity.type === "text") {
      const halfWidth = entity.text.length * entity.height * .31;
      bounds.minX = Math.min(bounds.minX, entity.at.x - halfWidth - font);
      bounds.maxX = Math.max(bounds.maxX, entity.at.x + halfWidth + font);
      bounds.minY = Math.min(bounds.minY, entity.at.y - font);
      bounds.maxY = Math.max(bounds.maxY, entity.at.y + font * 2);
    }
    views[view] = { entities, bounds };
  }
  return { model: { units: "mm", revision: r.revision, metrics, views, validSupportCount: unique.size, warnings }, pending };
}
