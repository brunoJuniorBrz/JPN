import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Regressão F1/F3: o projeto salvo abre diretamente no Studio e o declarado tem 3D real.
test("3D central abre no projeto existente e o selo permanece acessível no celular", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toBeVisible({ timeout: 40000 });
  await expect(page.getByTestId("fabrication-seal")).toBeVisible();
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click();
  await expect(page.getByRole("button", { name: "Visualizar em 3D" })).toBeVisible();
});

for (const width of [390, 1440]) test(`modelo físico declarado: 3D, 2D e bloqueio (${width}px)`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 920 });
  const physical = JSON.parse(await readFile("src/domain/test-support/m34ab-declared.json", "utf8"));
  physical.name = `Auditoria visual F0-F6 ${width}`;
  await page.goto("/projetos/novo");
  await page.getByText("Importar modelo estrutural declarado", { exact: true }).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({
    name: "auditoria.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(physical)),
  });
  await expect(page).toHaveURL(/fluxo=levantamento/);
  await expect(page.getByRole("button", { name: "Modelo 3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible({ timeout: 40000 });
  await expect(page.getByTestId("fabrication-seal")).toBeVisible();
  await page.getByRole("button", { name: "Vista simples 2D" }).click();
  await expect(page.getByTestId("declared-line-view")).toBeVisible();
  await page.getByRole("button", { name: "Modelo 3D", exact: true }).click();
  await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible({ timeout: 40000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
