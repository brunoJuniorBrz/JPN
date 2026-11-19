import { expect, test } from "@playwright/test";
import { openStudioStep } from "./result-tabs";

// Regressão do Studio compacto: o material é prioridade e o 3D não perde a tela cheia.
// Apenas interface; o domínio e os quantitativos não são alterados por esta suíte.
test("Studio compacto: resumo visível primeiro, 3D dominante e tela cheia fechável", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("12");
  await page.getByLabel("Comprimento (m)").fill("20");
  await page.getByLabel("Altura (m)").fill("4");
  await page.getByRole("button", { name: "Gerar modelo 3D" }).click();

  const model = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(model).toBeVisible({ timeout: 30000 });
  const viewBox = await page.getByRole("region", { name: "Visualização do modelo" }).boundingBox();
  expect(viewBox?.width ?? 0).toBeGreaterThan(720);

  await openStudioStep(page, "Tesoura");
  const inspector = page.locator(".studio-inspector");
  const summary = inspector.getByRole("region", { name: "Resumo" });
  const drawing = inspector.getByRole("img", { name: /Elevação da tesoura/ });
  await expect(summary).toBeVisible();
  await expect(drawing).toBeVisible();
  const summaryBox = await summary.boundingBox();
  const drawingBox = await drawing.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(drawingBox).not.toBeNull();
  expect(summaryBox!.y).toBeLessThan(drawingBox!.y);

  await page.getByRole("button", { name: "Expandir modelo 3D em tela cheia" }).click();
  const expanded = page.locator(".structure-viewer--expanded");
  await expect(expanded).toBeVisible();
  const totals = expanded.getByLabel("Quantitativos do modelo em tela cheia");
  await expect(totals).toContainText(/\d+ peças/);
  await expect(totals).toContainText("m de perfis");
  await expect(totals).toContainText("Fabricação bloqueada");
  const close = expanded.getByRole("button", { name: "Fechar tela cheia" });
  await expect(close).toBeVisible();
  await close.click();
  await expect(expanded).toHaveCount(0);
  await expect(model).toBeVisible();
});
