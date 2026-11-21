import { z } from "zod";
import type { ProfileSpec } from "./structure";

const dimension = z.number().finite().positive().max(3000).nullable().default(null);
const rotation = { rollDeg: z.number().finite().min(0).max(360).default(0) };
// Optional, editable drafts: relationships are checked by resolveSection, not
// used to infer A, I, E, mass or resistance. Units are explicitly millimetres.
export const visualSectionSchema = z.discriminatedUnion("family", [
  z.object({ family: z.literal("rectangular-tube"), widthMm: dimension, heightMm: dimension, ...rotation }).strict(),
  z.object({ family: z.literal("square-tube"), sideMm: dimension, ...rotation }).strict(),
  z.object({ family: z.literal("circular-tube"), diameterMm: dimension, ...rotation }).strict(),
  z.object({ family: z.literal("i"), heightMm: dimension, flangeWidthMm: dimension, webThicknessMm: dimension, flangeThicknessMm: dimension, ...rotation }).strict(),
  z.object({ family: z.literal("channel"), heightMm: dimension, flangeWidthMm: dimension, opening: z.enum(["positive-x", "negative-x"]).default("positive-x"), ...rotation }).strict(),
  z.object({ family: z.literal("angle"), legXmm: dimension, legYmm: dimension, ...rotation }).strict(),
]);
export type VisualSection = z.infer<typeof visualSectionSchema>;
export const familyLabels: Record<VisualSection["family"], string> = {
  "rectangular-tube": "Tubo retangular", "square-tube": "Tubo quadrado", "circular-tube": "Tubo circular",
  i: "I / H", channel: "U / C simples", angle: "Cantoneira L",
};
export const sectionDimensions: Record<VisualSection["family"], readonly (readonly [string, string])[]> = {
  "rectangular-tube": [["widthMm", "Largura externa"], ["heightMm", "Altura externa"]],
  "square-tube": [["sideMm", "Lado externo"]], "circular-tube": [["diameterMm", "Diâmetro externo"]],
  i: [["heightMm", "Altura externa"], ["flangeWidthMm", "Largura das mesas"], ["webThicknessMm", "Espessura da alma"], ["flangeThicknessMm", "Espessura das mesas"]],
  channel: [["heightMm", "Altura externa"], ["flangeWidthMm", "Largura externa das mesas"]],
  angle: [["legXmm", "Aba X externa"], ["legYmm", "Aba Y externa"]],
};
export interface ResolvedSection { family: VisualSection["family"]; width: number; height: number; t: number; tf: number; opening: number; }
export interface SectionResolution { section: ResolvedSection | null; warning: string; dimensions: string; }
export function resolveSection(profile: ProfileSpec): SectionResolution {
  const parsed = visualSectionSchema.safeParse(profile.visualSection);
  if (!parsed.success) return { section: null, warning: profile.visualSection ? "Dados geométricos inválidos: representação por linha." : "Dimensões geométricas não cadastradas: representação por linha.", dimensions: profile.section || "Não informadas" };
  const v = parsed.data, values = v as unknown as Record<string, unknown>;
  const t = profile.data?.thicknessMm ?? null;
  const dimensions = [...sectionDimensions[v.family].map(([key, label]) => `${label}: ${values[key] ?? "pendente"} mm`), ...(v.family === "i" ? [] : [`Espessura: ${t ?? "pendente"} mm`])].join(" · ");
  const fallback = (warning: string): SectionResolution => ({ section: null, warning: `${warning}: representação por linha.`, dimensions });
  const kind = v.family.endsWith("tube") ? "tube" : v.family;
  if (profile.data?.kind && !["unspecified", "other", kind].includes(profile.data.kind)) return fallback("Família geométrica diverge do tipo cadastrado");
  if (sectionDimensions[v.family].some(([key]) => values[key] === null) || (v.family !== "i" && t === null)) return fallback("Dimensões ou espessura incompletas");
  let width = 0, height = 0, wall = t ?? 0, tf = 0, opening = 1;
  switch (v.family) {
    case "rectangular-tube": width = v.widthMm!; height = v.heightMm!; break;
    case "square-tube": width = height = v.sideMm!; break;
    case "circular-tube": width = height = v.diameterMm!; break;
    case "i": width = v.flangeWidthMm!; height = v.heightMm!; wall = v.webThicknessMm!; tf = v.flangeThicknessMm!; break;
    case "channel": width = v.flangeWidthMm!; height = v.heightMm!; opening = v.opening === "negative-x" ? -1 : 1; break;
    case "angle": width = v.legXmm!; height = v.legYmm!; break;
  }
  if (![width, height, wall].every(n => Number.isFinite(n) && n > 0) || wall > 3000) return fallback("Dimensões ou espessura inválidas");
  if (v.family.endsWith("tube") && 2 * wall >= Math.min(width, height)) return fallback("Espessura elimina o vazio tubular");
  if (v.family === "i" && (wall >= width || tf * 2 >= height)) return fallback("Alma ou mesas incompatíveis com a seção I/H");
  if (v.family === "channel" && (wall >= width || 2 * wall >= height)) return fallback("Espessura incompatível com a abertura U/C");
  if (v.family === "angle" && wall >= Math.min(width, height)) return fallback("Espessura incompatível com as abas L");
  return { section: { family: v.family, width, height, t: wall, tf, opening }, warning: "", dimensions };
}
export function sectionOrientation(profile: ProfileSpec): string {
  const v = profile.visualSection;
  return `Centro da caixa externa no eixo da barra; referência X local = +Y do projeto, Y local = +Z para barras em +X; menor rotação até o eixo inicial→final; giro ${v?.rollDeg ?? 0}°${v?.family === "channel" ? `; abertura em ${v.opening === "negative-x" ? "−" : "+"}X local` : ""}. Orientação visual, sem validação para fabricação.`;
}

const num = (s: string) => Number(s.replace(",", "."));
/** Polegada em fração ("7/8", "1", "1 1/4") para mm. */
function inchToMm(s: string): number | null {
  const parts = s.trim().split(/\s+/);
  let total = 0;
  for (const p of parts) {
    const f = p.match(/^(\d+)\/(\d+)$/);
    if (f) total += Number(f[1]) / Number(f[2]);
    else if (/^\d+(?:[.,]\d+)?$/.test(p)) total += num(p);
    else return null;
  }
  return total > 0 ? Math.round(total * 25.4 * 100) / 100 : null;
}

/**
 * Seção APENAS VISUAL a partir da designação comercial do editor de tesoura
 * ("U 100x40x2.65 mm", "Ue 75x40x15x2.65 mm", "L 7/8 x 1/8 pol", "Tubo 100x100x3.00 mm").
 * Não alimenta área, inércia, massa nem verificação; designação desconhecida → null (barra em linha).
 */
export function visualProfileFromDesignation(designation: string): ProfileSpec | null {
  const d = designation.trim();
  const base = { name: d, steelGrade: "", section: d, source: "Designação comercial do editor de tesoura (representação visual)", massKgM: null, stockLengthM: null };
  const n = "(\\d+(?:[.,]\\d+)?)";
  const channel = d.match(new RegExp(`^(?:Ue|U|C)\\s*${n}\\s*x\\s*${n}(?:\\s*x\\s*${n})?\\s*x\\s*${n}\\s*mm$`, "i"));
  if (channel) {
    const [h, f, t] = [num(channel[1]), num(channel[2]), num(channel[4])];
    return { ...base, data: { kind: "channel", dimensions: d, thicknessMm: t, areaCm2: null, elasticModulusGpa: null, iyCm4: null, izCm4: null, origin: "declared", sourceDate: "", calculationReference: "" },
      visualSection: { family: "channel", heightMm: h, flangeWidthMm: f, opening: "positive-x", rollDeg: 0 } };
  }
  const tube = d.match(new RegExp(`^Tubo\\s*${n}\\s*x\\s*${n}\\s*x\\s*${n}\\s*mm$`, "i"));
  if (tube) {
    const [w, h, t] = [num(tube[1]), num(tube[2]), num(tube[3])];
    return { ...base, data: { kind: "tube", dimensions: d, thicknessMm: t, areaCm2: null, elasticModulusGpa: null, iyCm4: null, izCm4: null, origin: "declared", sourceDate: "", calculationReference: "" },
      visualSection: w === h ? { family: "square-tube", sideMm: w, rollDeg: 0 } : { family: "rectangular-tube", widthMm: w, heightMm: h, rollDeg: 0 } };
  }
  const angle = d.match(/^L\s*([\d\s/.,]+?)\s*x\s*([\d\s/.,]+?)\s*pol$/i);
  if (angle) {
    const leg = inchToMm(angle[1]), t = inchToMm(angle[2]);
    if (leg === null || t === null) return null;
    return { ...base, data: { kind: "angle", dimensions: d, thicknessMm: t, areaCm2: null, elasticModulusGpa: null, iyCm4: null, izCm4: null, origin: "declared", sourceDate: "", calculationReference: "" },
      visualSection: { family: "angle", legXmm: leg, legYmm: leg, rollDeg: 0 } };
  }
  return null;
}
