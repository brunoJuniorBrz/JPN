import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { declareAxes } from "./axes";
import { openResultTab, openStudioStep } from "./result-tabs";

// UI F2/F3: resultados da análise real aparecem no estúdio (inspetor, legenda, combinação) sem liberar nada.
for (const width of [390, 1440]) test(`estúdio mostra resultado real: combinação, legenda acessível e seleção em ${width}px`, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: 950 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const physical = JSON.parse(await readFile("src/domain/test-support/m34ab-declared.json", "utf8")); physical.name = `Estúdio resultados ${width}`;
  await page.goto("/projetos/novo"); await page.getByText("Importar modelo estrutural declarado", { exact: true }).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({ name: "m.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(physical)) });
  await expect(page).toHaveURL(/fluxo=levantamento/);
  const results = page.getByTestId("studio-results");
  await expect(results).toContainText("Sem resultados no 3D");
  await openResultTab(page, "Engenharia"); const panel = page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA", { timeout: 25000 });
  await declareAxes(panel); await panel.getByRole("button", { name: "Executar análise mista local", exact: true }).click();
  await expect(panel.getByTestId("mixed-result-state")).toContainText("Resultado calculado", { timeout: 30000 });
  // Combinação e camada no viewport do estúdio, ligadas à mesma sessão da análise.
  const combo = results.getByLabel("Combinação exibida");
  await expect(combo).toHaveValue("Q1");
  await results.getByLabel("Camada no 3D do estúdio").selectOption("axial");
  const legend = page.getByTestId("studio-legend");
  await expect(legend.getByRole("img")).toHaveAttribute("aria-label", /Escala de cores de Axial: azul = .* até vermelho = .*Combinação Q1/);
  await expect(panel.getByTestId("studio-layer-kind")).toHaveValue("axial");
  // Inspetor: buscar a peça mostra N da combinação ativa e o selo de bloqueio.
  await openStudioStep(page, "Verificação");
  const search = page.getByTestId("studio-selection").getByLabel("Buscar peça"); await search.fill("AX1"); await search.press("Enter");
  await expect(page.getByTestId("selection-forces")).toContainText("N máx.");
  await expect(page.getByTestId("studio-selection")).toContainText("bloqueada para fabricação");
  // O selo de bloqueio continua visível com resultado calculado.
  await expect(page.getByText("Bloqueado para fabricação", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("cubo de orientação e rótulo da peça selecionada no 3D do estúdio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" }); await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-orientation-cube", "on");
  await page.getByLabel("Selecionar peça no desenho").selectOption("T1-BS1");
  await expect(canvas).toHaveAttribute("data-labels", "1");
  await expect(page.locator(".viewer-label")).toHaveText(/T1-BS1 · \d/);
  await page.getByRole("button", { name: "Acabado", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-orientation-cube", "off");
});
