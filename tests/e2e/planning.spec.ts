import { expect, test } from "@playwright/test";
import { PLANNING_EXAMPLE_ID } from "../../src/domain/planning-example";

for (const width of [390, 1440]) test(`levantamento sem preços, revisão ao final e downloads em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("123");
  await expect(page.getByTestId("takeoff-totals")).toContainText("200,998");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Uma tesoura", exact: true }).click();
  await page.getByLabel("Selecionar peça no desenho").selectOption("T1-BS1");
  await expect(page.getByRole("status").filter({ hasText: "T1-BS1" })).toContainText("2,512");
  await page.getByRole("button", { name: "Ampliar desenho" }).click();
  const pdfWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar lista em PDF" }).click();
  const pdf = await pdfWait; expect(pdf.suggestedFilename()).toMatch(/levantamento-.*\.pdf/);
  await pdf.saveAs(`test-results/levantamento-${width}.pdf`);
  const xlsxWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar lista em Excel" }).click();
  expect((await xlsxWait).suggestedFilename()).toMatch(/\.xlsx$/);
  const nav = page.getByRole("navigation", { name: "Etapas do levantamento" });
  await nav.getByRole("button", { name: "Estrutura" }).click();
  await page.getByLabel("Espaçamento máximo entre tesouras (m)", { exact: true }).fill("4");
  await nav.getByRole("button", { name: "Resultado" }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("149");
  await page.getByRole("button", { name: "Salvar levantamento" }).click(); await page.reload();
  await expect(page.getByTestId("takeoff-totals")).toContainText("149");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/levantamento-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Orçamento de venda", exact: true }).click();
  await page.getByRole("navigation", { name: "Etapas do projeto" }).getByRole("button", { name: "Resumo" }).click();
  // Changing the span invalidates takeoff quantities; a new transfer is required.
  await expect(page.getByTestId("sale-price")).toContainText("Complete");
  expect(errors).toEqual([]);
});

test("cria levantamento com perfis pendentes e preserva os dados no backup", async ({ page }) => {
  await page.goto("/projetos/novo");
  await page.getByLabel("Nome do projeto *", { exact: true }).fill("Levantamento sem preços");
  await page.getByLabel("Cliente *", { exact: true }).fill("Engenheiro de teste");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByLabel("Largura (m)", { exact: true }).fill("10"); await page.getByLabel("Comprimento (m)", { exact: true }).fill("20");
  await page.getByLabel("Altura do lado mais baixo (m)").fill("4"); await page.getByLabel("Inclinação (%)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Ir para estrutura" }).click();
  await page.getByLabel("Espaçamento máximo entre tesouras (m)", { exact: true }).fill("5");
  await page.getByLabel("Espaçamento máximo entre terças (m)", { exact: true }).fill("2");
  await page.getByLabel("Altura da tesoura no lado baixo (m)").fill("0,8");
  await page.getByLabel("Número de painéis por tesoura").fill("4");
  await page.getByRole("button", { name: "Ir para resultado" }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("123");
  await expect(page.getByRole("button", { name: "Baixar lista em PDF" })).toBeEnabled();
  await expect(page.getByText("Pilares: perfil não definido.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salvar levantamento" }).click();
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
  expect(snapshot.version).toBe(4); const project = snapshot.projects.find((p: { name: string }) => p.name === "Levantamento sem preços");
  expect(project.planning.frameSpacingM).toBe(5); expect(project.estimate.materials).toEqual([]);
  expect(project.id).not.toBe(PLANNING_EXAMPLE_ID);
});
