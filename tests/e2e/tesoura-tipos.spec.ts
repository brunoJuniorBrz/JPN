import { test, expect } from "@playwright/test";

test("dois tipos de tesoura na mesma obra: cada linha com o seu desenho e o resumo soma tudo", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tesoura");
  await page.getByRole("button", { name: "Exemplo 8×10" }).click();
  const summary = page.getByRole("region", { name: "Resumo" });
  const webBars = summary.locator('[class*="kpis"] > div').nth(1).locator("b");
  await expect(webBars).toHaveText("9");
  await page.getByRole("button", { name: /Novo tipo/ }).click();
  await page.getByLabel("Nome do tipo").fill("Ponta");
  await page.getByLabel("Painel (cm)").fill("75");
  await page.getByLabel("Painel (cm)").blur();
  await page.getByLabel("Tesoura 1").selectOption("T2");
  await page.getByLabel("Tesoura 3").selectOption("T2");
  await expect(webBars).toHaveText("8");
  await expect(page.getByLabel("Desenhando").locator("option:checked")).toHaveText("Ponta · linhas 1, 3");
  // Voltar ao tipo 1 mostra o desenho original.
  await page.getByLabel("Desenhando").selectOption("T1");
  await expect(page.getByLabel("Painel (cm)")).toHaveValue("50");
  // Remover o tipo devolve as linhas ao tipo 1.
  await page.getByLabel("Desenhando").selectOption("T2");
  await page.getByRole("button", { name: "Remover tipo" }).click();
  await expect(webBars).toHaveText("9");
  expect(errors).toEqual([]);
});
