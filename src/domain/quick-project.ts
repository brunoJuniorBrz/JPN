import { newProject, projectSchema, type Project, type Settings } from "./models";
import { emptyPlanning, roles } from "./structure";
import { applyShowcaseProfiles } from "./showcase-projects";
import { generateStructure } from "./calculations/structure";

export interface QuickProjectInput {
  typology: "mono" | "gable";
  widthM: number;
  lengthM: number;
  heightM: number;
  slopePercent?: number;
  name?: string;
  client?: string;
}

// Geometric defaults for a FIRST LOOK ONLY, not engineering sizing rules.
// In particular, spacing and visual sections have not been checked for wind,
// loads, bending, buckling, bracing, connections or Brazilian standards.
export function createQuickProject(input: QuickProjectInput, settings?: Settings): Project {
  const { widthM, lengthM, heightM, typology } = input;
  const slopePercent = input.slopePercent ?? 10;
  if (![widthM, lengthM, heightM, slopePercent].every(Number.isFinite)
    || widthM < 2 || widthM > 40 || lengthM < 2 || lengthM > 100
    || heightM < 2 || heightM > 30 || slopePercent < 0 || slopePercent > 40
    || !["mono", "gable"].includes(typology)) {
    throw new Error("Confira as dimensões: largura 2–40 m, comprimento 2–100 m, altura 2–30 m e inclinação 0–40%.");
  }
  const project = newProject(settings);
  const label = typology === "gable" ? "duas águas" : "uma água";
  project.name = input.name?.trim() || `Pré-projeto · Cobertura ${label} · ${widthM} × ${lengthM} m`;
  project.client = input.client?.trim() || "Cliente a informar — pré-projeto";
  project.status = "Em elaboração";
  project.description = "Gerado pela entrada rápida. Distribuição, inclinação e perfis apenas sugeridos para apresentação em 3D; todos os parâmetros são editáveis.";
  project.technicalNotes = "PRÉ-PROJETO VISUAL: sem cálculo de vento, cargas, estabilidade, resistência ou ligações. Não usar para compras, cortes ou fabricação antes do dimensionamento e detalhamento profissional.";
  project.roof = { ...project.roof, widthM, lengthM, lowHeightM: heightM, slopePercent, revision: 1 };
  const planning = emptyPlanning();
  planning.typology = typology;
  planning.frameSpacingM = 4;
  planning.purlinSpacingM = 1.5;
  planning.trussDepthM = Math.min(heightM * 0.25, Math.max(0.5, widthM / 12));
  planning.panels = widthM <= 8 ? 4 : widthM <= 16 ? 6 : 8;
  planning.specificationNotes = "CONFIGURAÇÃO AUTOMÁTICA PROVISÓRIA. Espaçamentos, painéis, inclinação e seções visuais são valores iniciais editáveis, não escolhidos por dimensionamento estrutural.";
  project.planning = planning;

  // Reuse only the existing 3D shape library, never sample prices, certified
  // properties, material grades or stock lengths from demonstration projects.
  applyShowcaseProfiles(project, typology === "gable" ? "galpao" : "cobertura");
  for (const role of roles) {
    const profile = project.planning.profiles[role];
    profile.name = `VISUAL PROVISÓRIO — ${profile.name}`;
    profile.section = "Pré-visualização geométrica; perfil comercial não selecionado.";
    profile.source = "Seção sintética de visualização 3D; não dimensionada e não cotada.";
    profile.steelGrade = "";
    profile.stockLengthM = null;
    profile.massKgM = null;
    profile.pricePerMeterCents = null;
    if (profile.data) {
      profile.data.areaCm2 = null;
      profile.data.elasticModulusGpa = null;
      profile.data.sourceDate = "";
      profile.data.calculationReference = "";
      profile.data.origin = "declared";
    }
  }
  const validated = projectSchema.parse(project);
  const geometry = generateStructure(validated);
  if (!geometry.model) throw new Error(geometry.pending[0] ?? "Não foi possível gerar a geometria inicial.");
  return validated;
}
