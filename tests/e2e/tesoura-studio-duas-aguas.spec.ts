import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) test(`editor duas águas → Studio 3D → pacote CAD em ${width}px`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 920 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tesoura");
  await expect(page.getByRole("heading", { level: 1, name: "Tesoura" })).toBeVisible();
  const fallBefore = await page.getByLabel("Caída (%)").inputValue();
  await page.getByLabel("Tipo de cobertura").selectOption("two-slopes");
  await expect(page.getByRole("img", { name: /Elevação da tesoura/ })).toContainText("2 água(s)");
  await expect(page.getByLabel("Caída (%)")).toHaveValue(fallBefore);
  await expect(page.getByRole("button", { name: "Criar projeto com esta tesoura" })).toBeEnabled();
  await page.getByRole("button", { name: "Criar projeto com esta tesoura" }).click();
  await expect(page).toHaveURL(/\/projetos\/[^/]+\?fluxo=levantamento&etapa=3/);
  await expect(page.getByTestId("project-studio")).toBeVisible();

  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toBeVisible({ timeout: 45000 });
  await expect(canvas).toHaveAttribute("data-site-slopes", "2");
  await expect(canvas).toHaveAttribute("data-site-gutters", "2");
  await expect(canvas).toHaveAttribute("data-site-anchors", "6");
  await expect(page.getByTestId("fabrication-seal")).toBeVisible();
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Etapas do levantamento" });
  await navigation.getByRole("button", { name: /Arquivos/ }).click();
  await expect(page.getByTestId("complete-package-control")).toBeVisible();
  await navigation.getByRole("button", { name: /Tesoura/ }).click();
  await expect(page.getByLabel("Tipo de cobertura")).toHaveValue("two-slopes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("obra do Tom continua com apenas uma água", async ({ page }) => {
  await page.goto("/tesoura");
  await page.getByRole("button", { name: "Exemplo 8×10" }).click();
  await expect(page.getByLabel("Tipo de cobertura")).toHaveValue("one-slope");
  await expect(page.getByRole("button", { name: "Criar projeto com esta tesoura" })).toBeEnabled();
});
