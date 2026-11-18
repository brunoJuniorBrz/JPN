import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edita tesoura, mantém quantidades e cria projeto na aba Tesoura com pacote CAD", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tesoura");
  await expect(page.getByRole("heading", { level: 1, name: "Tesoura", exact: true })).toBeVisible();

  await page.getByLabel("Painel (cm)").fill("60");
  await page.getByLabel("Painel (cm)").blur();
  const summary = page.getByRole("region", { name: "Resumo" });
  const webBars = summary.locator('[class*="kpis"] > div').nth(1).locator("b");
  await expect(webBars).toHaveText("8");
  await summary.getByRole("checkbox", { name: /Orçar pela medida cheia/ }).check();
  await expect(webBars).toHaveText("13");

  await page.getByRole("button", { name: "Criar projeto com esta tesoura" }).click();
  await expect(page).toHaveURL(/\/projetos\/[^/]+\?fluxo=levantamento&etapa=3/);
  const nav = page.getByRole("navigation", { name: "Etapas do levantamento" });
  const trussStep = nav.getByRole("button", { name: /Tesoura/ });
  const filesStep = nav.getByRole("button", { name: /Arquivos/ });
  await expect(trussStep).toHaveAttribute("aria-current", "step");
  await filesStep.click();
  await expect(filesStep).toHaveAttribute("aria-current", "step");
  // O trilho F1 substituiu as abas: navegação com Enter continua acessível.
  await trussStep.focus();
  await trussStep.press("Enter");
  await expect(trussStep).toHaveAttribute("aria-current", "step");
  await filesStep.focus();
  await filesStep.press("Enter");
  await expect(filesStep).toHaveAttribute("aria-current", "step");
  const control = page.getByTestId("complete-package-control");
  await expect(control).toBeVisible();
  await control.getByText("Dados para o plano de corte", { exact: true }).click();
  const stocks = control.getByLabel(/Barra comercial \(mm\)/);
  expect(await stocks.count()).toBe(3);
  for (let i = 0; i < await stocks.count(); i++) await stocks.nth(i).fill("6000");

  const pendingDownload = page.waitForEvent("download");
  await control.getByRole("button", { name: "Exportar pacote completo", exact: true }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect((await readFile((await download.path())!)).subarray(0, 2).toString()).toBe("PK");
  await expect(control.getByRole("button", { name: "corte/plano.csv", exact: true })).toBeVisible();
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  expect(errors).toEqual([]);
});
