import { expect, test, type Page } from "@playwright/test";
import { planningExample } from "../../src/domain/planning-example";
import { emptySnapshot } from "../../src/domain/models";
import { sectionDataSchema } from "../../src/domain/structure";
import { trussGeometry } from "../../src/domain/analysis";
import { openEngineeringTool, openResultTab } from "./result-tabs";

async function openCutting(page: Page) {
  await openResultTab(page,"Materiais");
  const panel=page.locator(".result-cutting-details");
  if(await panel.getAttribute("open")===null)await panel.locator(":scope > summary").click();
}

function fixture() {
  const p = planningExample(); p.isExample = false;
  p.description = "Fornecimento preliminar de estrutura metálica, sujeito ao dimensionamento e detalhamento.";
  p.estimate.paymentTerms = "Condição fictícia para teste"; p.estimate.validity = "10 dias (teste)"; p.estimate.deadline = "Prazo a confirmar no teste";
  for (const profile of Object.values(p.planning!.profiles)) {
    profile.pricePerMeterCents = 1000; profile.source = "Catálogo sintético para teste";
    profile.data = { ...sectionDataSchema.parse({}), areaCm2: 10, elasticModulusGpa: 200, sourceDate: "2026-10-30" };
  }
  return p;
}
async function seed(page: Page) {
  const p = fixture();
  const data = { ...emptySnapshot(), exampleInstalled: true, projects: [p] };
  await page.addInitScript(value => { if (!localStorage.getItem("jpn-projetos:v1")) localStorage.setItem("jpn-projetos:v1", JSON.stringify(value)); }, data);
  await page.goto(`/projetos/${p.id}?fluxo=levantamento&etapa=3`);
  await expect(page.getByTestId("takeoff-totals")).toContainText("123");
  return p;
}

for (const width of [320, 375, 768, 1440]) test(`pré-projeto, corte, revisão, CAD e proposta em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await seed(page);
  await page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: "Estrutura" }).click();
  await page.getByLabel("Tipologia da cobertura").selectOption("gable");
  await page.getByLabel("Balanço longitudinal na frente (m)").fill("0,5");
  await page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: "Resultado" }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("130");
  await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  await expect(page.getByRole("img", { name: "Modelo 3D da estrutura" })).toBeVisible();
  await page.getByRole("img", { name: "Modelo 3D da estrutura" }).screenshot({ path: `test-results/structure-3d-${width}.png` });
  await page.getByLabel("Selecionar peça no desenho").selectOption("T1-BS1");
  await expect(page.getByRole("status").filter({ hasText: "T1-BS1" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click();
  await openCutting(page);
  await page.getByLabel("Espessura do corte (mm)").fill("3");
  await page.getByLabel("Perda em cada extremidade (mm)").fill("10");
  await page.getByLabel("Sobra mínima aproveitável (mm)").fill("500");
  await expect(page.getByTestId("cutting-results")).toContainText("barras comerciais estimadas");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cut = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar simulação de corte em PDF" }).click(); expect((await cut).suggestedFilename()).toMatch(/simulacao-corte.*\.pdf$/);
  await openResultTab(page,"Arquivos");
  await page.getByLabel("Identificação da revisão").fill("R01 de levantamento"); await page.getByLabel("Responsável pelo registro").fill("Engenheiro do teste");
  await page.getByRole("button", { name: "Registrar revisão preliminar" }).click();
  await expect(page.getByText("R01 de levantamento", { exact: false }).first()).toBeVisible();
  const dxf = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar desenho em DXF" }).click(); await (await dxf).saveAs(`test-results/cad/e2e-${width}.dxf`);
  const svg = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar desenho em SVG" }).click(); expect((await svg).suggestedFilename()).toMatch(/\.svg$/);
  await openResultTab(page,"Materiais");
  await page.getByRole("button", { name: "Atualizar quantitativos no orçamento" }).click();
  await page.getByRole("button", { name: "Salvar levantamento", exact: true }).click(); await page.reload();
  await openResultTab(page,"Arquivos");
  await expect(page.getByRole("button", { name: "Copiar revisão para rascunho" })).toHaveCount(1);
  await page.getByRole("button", { name: "Orçamento de venda", exact: true }).click();
  const steps = page.getByRole("navigation", { name: "Etapas do projeto" }); await steps.getByRole("button", { name: "Resumo" }).click();
  await expect(page.getByTestId("sale-price")).not.toContainText("Complete");
  const proposal = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar orçamento em PDF" }).click(); expect((await proposal).suggestedFilename()).toMatch(/orcamento.*\.pdf$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/platform-${width}.png`, fullPage: true }); expect(errors).toEqual([]);
});

test("análise real de tesoura e invalidação ao alterar a carga", async ({ page }) => {
  const p = await seed(page), nodes = trussGeometry(p).nodes;
  const left = nodes.find(n => n.xMm === 0 && n.yMm === 3200)!.id, right = nodes.find(n => n.xMm === 10000 && n.yMm === 3200)!.id;
  const load = nodes.filter(n => n.xMm === 5000).sort((a, b) => b.yMm - a.yMm)[0].id;
  await openEngineeringTool(page,"Análise disponível");
  await page.getByRole("button", { name: "Configurar tesoura isolada", exact: true }).click();
  await page.getByLabel("Hipótese declarada:", { exact: false }).check();
  await page.getByRole("button", { name: "Adicionar apoio da tesoura" }).click();
  await page.getByLabel("Nó do apoio 1").selectOption(left);
  const support1 = page.locator(".estimate-line").filter({ has: page.getByLabel("Nó do apoio 1") });
  await support1.getByLabel("Restringir deslocamento horizontal em zero").check(); await support1.getByLabel("Restringir deslocamento vertical em zero").check();
  await page.getByRole("button", { name: "Adicionar apoio da tesoura" }).click(); await page.getByLabel("Nó do apoio 2").selectOption(right);
  await page.locator(".estimate-line").filter({ has: page.getByLabel("Nó do apoio 2") }).getByLabel("Restringir deslocamento vertical em zero").check();
  await page.getByRole("button", { name: "Adicionar carga nodal" }).click(); await page.getByLabel("Nó da carga 1").selectOption(load);
  await page.getByLabel("Fx da carga 1 (kN)").fill("0"); await page.getByLabel("Fy da carga 1 (kN)").fill("-10");
  await page.getByRole("button", { name: "Executar análise experimental" }).click();
  await expect(page.getByTestId("analysis-results")).toContainText("SHA-256"); await expect(page.getByTestId("analysis-results")).toContainText("Compressão");
  await page.getByLabel("Fy da carga 1 (kN)").fill("-20"); await expect(page.getByTestId("analysis-results")).toHaveCount(0);
  await expect(page.getByText("Resultado anterior desatualizado:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Executar análise experimental" }).click(); await expect(page.getByTestId("analysis-results")).toBeVisible();
});

test("dispositivo sem WebGL mantém fallback 2D utilizável", async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) { if (type.startsWith("webgl")) return null; return Reflect.apply(original, this, [type, ...args]); } as typeof original; });
  await seed(page); await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "3D indisponível neste dispositivo." })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click(); await expect(page.getByRole("img", { name: "Desenho preliminar: planta" })).toBeVisible();
});
test("exemplo completo nasce apenas ao clicar e preserva a configuração na recarga", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir exemplo completo de pré-projeto", exact: true }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("130");
  await openCutting(page);
  await expect(page.getByTestId("cutting-results")).toContainText("barras comerciais estimadas");
  await page.reload(); await openCutting(page); await expect(page.getByTestId("cutting-results")).toBeVisible();
  await openEngineeringTool(page,"Análise disponível");
  await page.getByRole("button", { name: "Executar análise experimental" }).click();
  await expect(page.getByTestId("analysis-results")).toContainText("SHA-256");
});
