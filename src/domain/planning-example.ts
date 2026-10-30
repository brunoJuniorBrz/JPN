import { newProject, type Project } from "./models";
import { emptyPlanning, roles, roleLabels } from "./structure";

export const PLANNING_EXAMPLE_ID = "a853d12f-fd55-418d-88e4-3f44d0a50001";
export function planningExample(): Project {
  const project = newProject(); const planning = emptyPlanning();
  planning.frameSpacingM = 5; planning.purlinSpacingM = 2; planning.trussDepthM = .8; planning.panels = 4;
  planning.specificationNotes = "Exemplo exclusivamente geométrico. Perfis e massas fictícios para demonstrar totais, sem dimensionamento de resistência.";
  for (const role of roles) planning.profiles[role] = { name: `Exemplo - ${roleLabels[role]}`, steelGrade: "Aço fictício", section: "Seção não dimensionada", source: "Dados fictícios de demonstração", massKgM: role === "column" ? 10 : role === "web" ? 2 : 4, stockLengthM: 6 };
  return { ...project, id: PLANNING_EXAMPLE_ID, name: "EXEMPLO — Levantamento 10 × 20 m", client: "Cliente fictício", isExample: true, description: "Cobertura de uma água para demonstrar distribuição, peças e quantitativos.",
    roof: { ...project.roof, widthM: 10, lengthM: 20, lowHeightM: 4, slopePercent: 10 }, planning };
}
