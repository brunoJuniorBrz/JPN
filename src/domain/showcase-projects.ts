import { planningExample } from "./planning-example";
import { preprojectExample } from "./preproject-example";
import { sectionDataSchema, roles, type PieceRole, type ProfileSpec } from "./structure";
import { transferTakeoff, structureSignature } from "./calculations/project-basis";
import type { MaterialLine } from "./project-details";
import type { Project } from "./models";

// Stable IDs identify only JPN's built-in, replaceable demonstrations.
// Imported copies and user-created projects have different IDs and are not purged.
export const SHOWCASE_IDS = {
  cobertura: "89be02c1-83f1-4abe-9fe3-000000000101",
  galpao: "89be02c1-83f1-4abe-9fe3-000000000102",
} as const;
export type ShowcaseKind = keyof typeof SHOWCASE_IDS;
export const SHOWCASE_KINDS: ShowcaseKind[] = ["cobertura", "galpao"];

const profiles: Record<ShowcaseKind, Record<PieceRole, {
  name: string;
  visualSection: NonNullable<ProfileSpec["visualSection"]>;
  kind: NonNullable<ProfileSpec["data"]>["kind"];
  thicknessMm: number | null;
  pricePerMeterCents: number;
}>> = {
  cobertura: {
    column: { name: "Tubo quadrado 120 × 120 × 4 mm", visualSection: { family: "square-tube", sideMm: 120, rollDeg: 0 }, kind: "tube", thicknessMm: 4, pricePerMeterCents: 12000 },
    topChord: { name: "Tubo retangular 140 × 80 × 4 mm", visualSection: { family: "rectangular-tube", widthMm: 80, heightMm: 140, rollDeg: 0 }, kind: "tube", thicknessMm: 4, pricePerMeterCents: 11000 },
    bottomChord: { name: "Tubo quadrado 80 × 80 × 3 mm", visualSection: { family: "square-tube", sideMm: 80, rollDeg: 0 }, kind: "tube", thicknessMm: 3, pricePerMeterCents: 7200 },
    web: { name: "Cantoneira L 65 × 65 × 5 mm", visualSection: { family: "angle", legXmm: 65, legYmm: 65, rollDeg: 0 }, kind: "angle", thicknessMm: 5, pricePerMeterCents: 4200 },
    purlin: { name: "Perfil U 150 × 50 × 3 mm", visualSection: { family: "channel", heightMm: 150, flangeWidthMm: 50, opening: "positive-x", rollDeg: 0 }, kind: "channel", thicknessMm: 3, pricePerMeterCents: 6500 },
  },
  galpao: {
    column: { name: "Perfil I 240 × 160 mm (alma 8, mesa 12)", visualSection: { family: "i", heightMm: 240, flangeWidthMm: 160, webThicknessMm: 8, flangeThicknessMm: 12, rollDeg: 0 }, kind: "i", thicknessMm: null, pricePerMeterCents: 24000 },
    topChord: { name: "Tubo retangular 160 × 100 × 5 mm", visualSection: { family: "rectangular-tube", widthMm: 100, heightMm: 160, rollDeg: 0 }, kind: "tube", thicknessMm: 5, pricePerMeterCents: 14600 },
    bottomChord: { name: "Tubo quadrado 100 × 100 × 4 mm", visualSection: { family: "square-tube", sideMm: 100, rollDeg: 0 }, kind: "tube", thicknessMm: 4, pricePerMeterCents: 10500 },
    web: { name: "Cantoneira L 70 × 70 × 5 mm", visualSection: { family: "angle", legXmm: 70, legYmm: 70, rollDeg: 0 }, kind: "angle", thicknessMm: 5, pricePerMeterCents: 5200 },
    purlin: { name: "Perfil U 160 × 60 × 4 mm", visualSection: { family: "channel", heightMm: 160, flangeWidthMm: 60, opening: "positive-x", rollDeg: 0 }, kind: "channel", thicknessMm: 4, pricePerMeterCents: 8300 },
  },
};

function visualAreaMm2(section: NonNullable<ProfileSpec["visualSection"]>, wallMm: number | null): number {
  const t = wallMm ?? 0;
  switch (section.family) {
    case "square-tube": return section.sideMm! ** 2 - (section.sideMm! - 2 * t) ** 2;
    case "rectangular-tube": return section.widthMm! * section.heightMm! - (section.widthMm! - 2 * t) * (section.heightMm! - 2 * t);
    case "circular-tube": return Math.PI / 4 * (section.diameterMm! ** 2 - (section.diameterMm! - 2 * t) ** 2);
    case "i": return 2 * section.flangeWidthMm! * section.flangeThicknessMm! + (section.heightMm! - 2 * section.flangeThicknessMm!) * section.webThicknessMm!;
    case "channel": return t * section.heightMm! + 2 * t * (section.flangeWidthMm! - t);
    case "angle": return t * (section.legXmm! + section.legYmm! - t);
  }
}

export function applyShowcaseProfiles(project: Project, kind: ShowcaseKind): Project {
  if (!project.planning) throw new Error("Configure a estrutura antes de atribuir perfis de demonstração.");
  for (const role of roles) {
    const spec = profiles[kind][role];
    project.planning.profiles[role] = {
      name: spec.name,
      steelGrade: "NÃO ESPECIFICADO — EXEMPLO",
      section: spec.name,
      source: "DIMENSÕES E PREÇOS SINTÉTICOS, exclusivos para demonstração. Sem consulta a catálogo, fabricante ou norma.",
      massKgM: null, stockLengthM: 6, pricePerMeterCents: spec.pricePerMeterCents,
      data: { ...sectionDataSchema.parse({}), kind: spec.kind, thicknessMm: spec.thicknessMm,
        // Ideal area calculated from the synthetic rendered section (no fillets or radii).
        // Experimental solver input, NOT a checked resistant property.
        areaCm2: visualAreaMm2(spec.visualSection, spec.thicknessMm) / 100,
        elasticModulusGpa: 200,
        origin: "calculated", calculationReference: "Seção geométrica ideal; E=200 GPa declarado apenas para simulação, sem laudo ou aprovação.",
        sourceDate: "2026-10-31", dimensions: spec.name },
      visualSection: spec.visualSection,
    };
  }
  return project;
}

const material = (name: string, source: MaterialLine["source"], measurementUnit: MaterialLine["measurementUnit"], unitPriceCents: number, wastePercent: number, manualQuantity: number | null): MaterialLine => ({
  id: crypto.randomUUID(), materialId: null, name, purchaseUnit: measurementUnit, measurementUnit,
  measurementPerPurchase: null, source, manualQuantity, wastePercent, unitPriceCents,
});

export function showcaseProject(kind: ShowcaseKind): Project {
  let p = kind === "galpao" ? preprojectExample() : planningExample();
  p.id = SHOWCASE_IDS[kind];
  p.isExample = true;
  p.name = kind === "galpao" ? "DEMONSTRAÇÃO — Galpão 10 × 20 m (duas águas)" : "DEMONSTRAÇÃO — Cobertura de oficina 10 × 20 m";
  p.client = "Cliente fictício — demonstração JPN";
  p.location = "Localização não informada (obra fictícia)";
  p.description = kind === "galpao"
    ? "Pré-projeto fictício de duas águas com perfis sólidos, quantitativo geométrico, simulação de corte e orçamento ilustrativo."
    : "Cobertura fictícia de uma água com perfis sólidos, quantitativo geométrico e orçamento ilustrativo.";
  p.technicalNotes = "PERFIS APENAS ILUSTRATIVOS. Dimensões visuais não equivalem a dimensionamento estrutural. Faltam cálculo normativo, cargas reais, ligações, contraventamentos, fundações e detalhamento de fabricação.";
  p.commercialNotes = "PREÇOS SIMULADOS, NÃO SÃO COTAÇÃO DE MERCADO. Não utilizar como proposta, pedido de compra ou ordem de corte.";
  p.planning!.specificationNotes = "Geometria e famílias fictícias para apresentação do software. Verificar estabilidade, esforços, ligações, fixações, fabricante, normas e consumo real antes de qualquer execução.";
  p = applyShowcaseProfiles(p, kind);
  // Replace all legacy material lines (including stale takeoff signatures) with a
  // single consistent estimate based on this exact model and these profile names.
  p.estimate.materials = [
    material("Telhamento metálico por m² — VALOR FICTÍCIO", "roof-area", "m²", kind === "galpao" ? 12500 : 9800, 8, null),
    material("Fixadores de telhamento — QUANTIDADE ILUSTRATIVA", "manual", "un", 240, 0, kind === "galpao" ? 500 : 380),
  ];
  p = transferTakeoff(p, kind === "galpao" ? 7 : 5);
  p.estimate.pricingMode = "markup";
  p.estimate.pricingPercent = kind === "galpao" ? 22 : 20;
  p.estimate.labor = [
    { id: crypto.randomUUID(), description: "Fabricação e pré-montagem — SIMULAÇÃO", quantity: kind === "galpao" ? 8 : 5, unit: "diária", unitPriceCents: kind === "galpao" ? 125000 : 85000 },
    { id: crypto.randomUUID(), description: "Montagem no local — SIMULAÇÃO", quantity: kind === "galpao" ? 6 : 4, unit: "diária", unitPriceCents: kind === "galpao" ? 140000 : 95000 },
  ];
  p.estimate.expenses = [
    { id: crypto.randomUUID(), description: "Frete e movimentação — SIMULAÇÃO", quantity: 1, unit: "serviço", unitPriceCents: kind === "galpao" ? 230000 : 95000 },
    { id: crypto.randomUUID(), description: "Equipamento de acesso — SIMULAÇÃO", quantity: 1, unit: "locação", unitPriceCents: kind === "galpao" ? 180000 : 70000 },
  ];
  p.estimate.charges = [];
  p.estimate.paymentTerms = "Demonstração: 40% na contratação, 40% no fornecimento e 20% na conclusão. Ajustar em proposta real.";
  p.estimate.deadline = "Demonstração: 30 dias, sujeitos a projeto executivo e disponibilidade.";
  p.estimate.validity = "Exemplo fictício, sem validade comercial.";
  p.estimate.exclusions = "Fundações, instalações, projeto executivo, cálculo normativo, ligações, contraventamento, soldas, pintura e consumíveis não quantificados; verificar telhas e fixações reais.";
  if (p.workspace.analysis) p.workspace.analysis = { ...p.workspace.analysis, signature: structureSignature(p) };
  return p;
}
