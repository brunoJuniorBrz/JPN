import type { Page } from "@playwright/test";

export type ResultTabName = "Modelo 3D" | "Materiais" | "Engenharia" | "Arquivos";
export type StudioStepName = "Obra" | "Geometria" | "Estrutura" | "Cargas" | "Análise" | "Verificação" | "Materiais" | "Arquivos";

/** Abre uma etapa do estúdio do projeto (F1), sem abrir outro visualizador nem alterar dados. */
export async function openStudioStep(page: Page, label: StudioStepName) {
  await page.getByRole("navigation", {name: "Etapas do levantamento"}).getByRole("button", {name: new RegExp("^" + label)}).click();
}

/**
 * Compatibilidade com as antigas abas do Resultado. No estúdio o modelo fica sempre visível
 * no centro; Materiais e Arquivos viraram etapas; Engenharia corresponde à etapa Análise
 * (as pendências da revisão técnica ficam em Verificação).
 */
export async function openResultTab(page: Page, label: ResultTabName) {
  if (label === "Modelo 3D") { await page.getByRole("region", {name: "Visualização do modelo"}).scrollIntoViewIfNeeded(); return; }
  await openStudioStep(page, label === "Engenharia" ? "Análise" : label);
}

/** Ferramentas que ficavam no select "Ferramenta de engenharia". */
export async function openEngineeringTool(page: Page, label: string) {
  if (label === "Preparar análise") { await openStudioStep(page, "Cargas"); return; }
  await page.getByRole("navigation", {name: "Ferramentas de análise"}).getByRole("button", {name: label, exact: true}).click();
}
