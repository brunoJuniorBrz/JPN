import { expect, test } from "@playwright/test";

test("o 3D usa largura total sem menu global, com retorno seguro aos projetos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tesoura");
  await expect(page.getByRole("heading", { level: 1, name: "Tesoura" })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.getByRole("button", { name: "Criar projeto com esta tesoura" }).click();
  await expect(page).toHaveURL(/projetos.*fluxo=levantamento&etapa=3/);
  // Ocultar só a navegação duplicada, preservando o retorno ao gerenciador.
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".workspace-exit-link")).toBeVisible();
  await expect(page.locator(".app")).toHaveCSS("grid-template-columns", /^[0-9.]+px$/);
  await page.locator(".workspace-exit-link").click();
  await expect(page).toHaveURL(/projetos$/);
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("o trilho do Studio recolhe e reaparece sem perder os controles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tesoura");
  // Teste da rota real, não de um elemento artificial inserido no DOM.
  await page.getByRole("button", { name: "Criar projeto com esta tesoura" }).click();
  await expect(page.getByTestId("project-studio")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  const toggle = page.locator(".workspace-rail-toggle");
  await expect(toggle).toBeVisible();
  await expect(page.locator(".studio-rail")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".studio-rail")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".studio-rail")).toBeVisible();
});
