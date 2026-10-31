import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createQuickProject } from "../../src/domain/quick-project";
import { generateStructure } from "../../src/domain/calculations/structure";
import { spatialRequestSchema } from "../../src/domain/spatial-analysis";
import { emptySnapshot } from "../../src/domain/models";

for (const mobile of [true, false]) test.describe(mobile ? "iPhone 375" : "desktop 1440", () => {
  test.use({ viewport: { width: mobile ? 375 : 1440, height: 950 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  test("entrada rápida preservada, pórtico 3D real, edição e resposta obsoleta", async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto("/projetos/novo");
    await page.getByLabel("Largura (m)", { exact: true }).fill("10");
    await page.getByLabel("Comprimento (m)", { exact: true }).fill("20");
    await page.getByLabel("Altura (m)", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Gerar modelo 3D", exact: true }).click();
    await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Perfis 3D", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Análise 3D experimental", exact: true }).click();
    await expect(page.getByTestId("spatial-readiness")).toContainText("Faltam dados para análise");
    const saved = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
    await page.getByRole("button", { name: "Carregar exemplo espacial validado", exact: true }).click();
    await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click();
    const results = page.getByTestId("spatial-results");
    await expect(results).toContainText("Análise experimental executada"); await expect(results).toContainText("PyNiteFEA 3.2.1"); await expect(results).toContainText("0,55022");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await results.screenshot({ path: `test-results/spatial-results-${mobile ? 375 : 1440}.png` });
    const input = page.getByLabel("Entrada do modelo físico 3D (JSON SI)");
    const payload = JSON.parse(await input.inputValue()); payload.nodal_loads[0].fy_n *= 2;
    await input.fill(JSON.stringify(payload, null, 2));
    await expect(results).toHaveCount(0); await expect(page.getByRole("status").filter({ hasText: "Modelo alterado: resultado desatualizado" })).toBeVisible();
    await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click(); await expect(results).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(saved);
    // Model change while worker is in flight: never publish the stale response.
    await page.route("**/api/analysis3d", async route => { const response = await route.fetch(); await new Promise(resolve => setTimeout(resolve, 250)); await route.fulfill({ response }); });
    await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click();
    payload.nodal_loads[0].fx_n += 1; await input.fill(JSON.stringify(payload));
    await expect(page.getByRole("alert").filter({ hasText: "resultado descartado" })).toBeVisible(); await expect(results).toHaveCount(0);
    await page.reload(); await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible();
    await page.getByRole("button", { name: "Análise 3D experimental", exact: true }).click(); await expect(results).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("falha do serviço 3D não interrompe a visualização, o levantamento ou a edição", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento", exact: true }).click();
  await page.getByRole("button", { name: "Análise 3D experimental", exact: true }).click();
  await page.getByRole("button", { name: "Carregar exemplo espacial validado", exact: true }).click();
  await page.route("**/api/analysis3d", route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Serviço não configurado" } } }));
  await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Serviço de análise indisponível" })).toBeVisible();
  await expect(page.getByTestId("takeoff-totals")).toBeVisible(); await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible();
});

test("modelo explicitamente vinculado exige nova revisão ao mudar hipótese de ligação", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 950 });
  const project = createQuickProject({ typology: "mono", widthM: 10, lengthM: 20, heightM: 4 }); project.planning!.purlinSpacingM = 100;
  const model = generateStructure(project).model!, input = spatialRequestSchema.parse(JSON.parse(readFileSync("engine/examples/spatial-portal.json", "utf8")));
  input.nodes = model.nodes.map(n => ({ id: n.id, x_m: n.x / 1000, y_m: n.y / 1000, z_m: n.z / 1000 }));
  input.members = model.pieces.map(p => ({ ...input.members[0], id: p.id, start: p.start, end: p.end }));
  input.supports = model.nodes.filter(n => n.z === 0).map(n => ({ node: n.id, restrained: [true, true, true, true, true, true] }));
  input.nodal_loads[0].node = model.nodes.find(n => n.z > 0)!.id;
  await page.addInitScript(value => localStorage.setItem("jpn-projetos:v1", JSON.stringify(value)), { ...emptySnapshot(), exampleInstalled: true, projects: [project] });
  await page.goto(`/projetos/${project.id}?fluxo=levantamento&etapa=3`);
  await page.getByRole("button", { name: "Análise 3D experimental", exact: true }).click();
  await page.getByRole("button", { name: "Carregar exemplo espacial validado", exact: true }).click();
  await page.getByLabel("Entrada do modelo físico 3D (JSON SI)").fill(JSON.stringify(input));
  await page.getByText("Vincular modelo explícito à obra · revisão técnica", { exact: true }).click();
  await page.getByLabel("Revisão das ligações", { exact: true }).fill("Fixture: juntas rígidas declaradas R1");
  await page.getByLabel("Sistema de estabilidade lateral declarado", { exact: true }).fill("Fixture: ação de pórtico espacial");
  await page.getByRole("button", { name: "Vincular JSON revisado a esta obra", exact: true }).click();
  await expect(page.getByTestId("spatial-readiness")).toContainText("pronto para análise experimental");
  await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click();
  await expect(page.getByTestId("spatial-results")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const oldHash = await page.getByTestId("spatial-results").locator(".hash-label").innerText();
  await page.getByLabel("Revisão das ligações", { exact: true }).fill("Fixture: juntas rígidas reavaliadas R2");
  await expect(page.getByTestId("spatial-results")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Executar análise 3D experimental", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Vincular JSON revisado a esta obra", exact: true }).click();
  await page.getByRole("button", { name: "Executar análise 3D experimental", exact: true }).click();
  await expect(page.getByTestId("spatial-results")).toBeVisible();
  expect(await page.getByTestId("spatial-results").locator(".hash-label").innerText()).not.toBe(oldHash);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
