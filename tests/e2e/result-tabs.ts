import type { Page } from "@playwright/test";

export type ResultTabName = "Modelo 3D" | "Materiais" | "Engenharia" | "Arquivos";
export type StudioStepName = "Obra" | "Geometria" | "Estrutura" | "Tesoura" | "Cargas" | "Análise" | "Verificação" | "Materiais" | "Arquivos";

/** A navegação F0–F6 substitui as antigas abas Resultado. */
export async function openStudioStep(page: Page, label: StudioStepName) {
  await page.getByRole("navigation", { name: "Etapas do levantamento" })
    .getByRole("button", { name: new RegExp("^" + label) }).click();
}

export async function openResultTab(page: Page, label: ResultTabName) {
  if (label === "Modelo 3D") {
    await page.getByRole("region", { name: "Visualização do modelo" }).scrollIntoViewIfNeeded();
    return;
  }
  await openStudioStep(page, label === "Engenharia" ? "Análise" : label);
}

/** Abre a etapa antes da ferramenta; no modelo declarado a análise já está montada nessa etapa. */
export async function openEngineeringTool(page: Page, label: string) {
  if (label === "Preparar análise") {
    await openStudioStep(page, "Cargas");
    return;
  }
  await openStudioStep(page, "Análise");
  const tools = page.getByRole("navigation", { name: "Ferramentas de análise" });
  if (await tools.isVisible().catch(() => false)) {
    await tools.getByRole("button", { name: label, exact: true }).click();
    return;
  }
  if (label === "Análise Estrutural Experimental") {
    const open = page.getByRole("button", { name: "Preparar e analisar este projeto" });
    if (await open.count()) await open.first().click();
  }
}
