import { expect, test } from "@playwright/test";
import { openResultTab } from "./result-tabs";

async function createQuickRoof(page: import("@playwright/test").Page) {
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("12");
  await page.getByLabel("Comprimento (m)").fill("35");
  await page.getByLabel("Altura (m)").fill("5");
  await page.getByRole("button", { name: "Gerar modelo 3D" }).click();
  await expect(page.getByRole("tab", { name: /^Modelo 3D/ })).toBeVisible();
}

for (const width of [375, 1440]) {
  test(`encontrar uma peça por ID sem navegar por milhares de opções em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createQuickRoof(page);
    const search = page.getByRole("searchbox", { name: "Buscar peça por ID ou categoria" });
    await search.fill("t1-bs1");
    await expect(page.getByTestId("piece-search-count")).toContainText("1 peça encontrada");
    await search.press("Enter");
    await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("T1-BS1");
    await search.fill("id-que-nao-existe");
    await expect(page.getByTestId("piece-search-count")).toContainText("Nenhuma peça");
    await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("T1-BS1");
  });

  test(`pendências cadastrais levam à etapa de edição em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createQuickRoof(page);
    await openResultTab(page, "Engenharia");
    await expect(page.getByRole("heading", { name: "Pendências da revisão técnica" })).toBeVisible();
    await page.getByRole("button", { name: "Corrigir na estrutura" }).first().click();
    await expect(page.getByRole("heading", { name: "Como distribuir a estrutura?" })).toBeVisible();
  });
}
