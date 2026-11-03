import type { Page } from "@playwright/test";

export type ResultTabName = "Modelo 3D" | "Materiais" | "Engenharia" | "Arquivos";

/** Navigation helper for the result workspace, independent of UI implementation
 * details and without opening a second viewer or modifying project data. */
export async function openResultTab(page: Page, label: ResultTabName) {
  await page.getByRole("tab", {name: new RegExp("^" + label)}).click();
}

export async function openEngineeringTool(page: Page, label: string) {
  await openResultTab(page, "Engenharia");
  await page.getByLabel("Ferramenta de engenharia").selectOption({label});
}
