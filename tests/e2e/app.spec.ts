import { expect, test } from "@playwright/test";
import { EXAMPLE_ID, exampleProject, exampleMaterials } from "../../src/domain/example";
import { emptySnapshot } from "../../src/domain/models";

// Legacy commercial flow remains independently covered by a controlled fixture.
// Production no longer installs this obsolete example automatically.
test.beforeEach(async ({ page }) => {
  const fixture = {
    ...emptySnapshot(), exampleInstalled: true,
    projects: [{ ...exampleProject(), isExample: false }],
    materials: exampleMaterials().map(item => ({ ...item, isExample: false })),
  };
  await page.addInitScript(value => {
    if (!localStorage.getItem("jpn-projetos:v1")) localStorage.setItem("jpn-projetos:v1", JSON.stringify(value));
  }, fixture);
});

const step = (page: import("@playwright/test").Page, name: string) => page.getByRole("navigation", { name: "Etapas do projeto" }).getByRole("button", { name, exact: false });

test("obra real: cliente, medidas com vírgula, material próprio, custos e resumo persistido", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/projetos/novo");
  await page.getByRole("button", { name: "Orçamento de venda", exact: true }).click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Informe o nome do projeto.")).toBeVisible();
  await page.getByLabel("Nome do projeto *", { exact: true }).fill("Cobertura real de teste");
  await page.getByLabel("Cliente *", { exact: true }).fill("João de teste");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page).toHaveURL(/projetos\/[a-f0-9-]{36}\?etapa=1$/);
  await page.getByLabel("Largura (m)", { exact: true }).fill("6,5");
  await page.getByLabel("Comprimento (m)", { exact: true }).fill("10");
  await page.getByLabel("Altura do lado mais baixo (m)").fill("3");
  await page.getByLabel("Inclinação (%)", { exact: true }).fill("10");
  await page.getByRole("heading", { name: "Quais são as medidas da cobertura?" }).click();
  await expect(page.getByRole("img", { name: "Desenho preliminar: planta" })).toBeVisible();
  await expect(page.getByText("65,324 m²", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ir para materiais" }).click();
  await page.getByRole("button", { name: "Cadastrar outro material" }).click();
  await page.getByLabel("Nome do material *").fill("Telha própria do teste");
  await page.getByLabel("Unidade de compra", { exact: true }).selectOption("m²");
  await page.getByLabel("Preço por unidade de compra (R$)").fill("100,50");
  await page.getByRole("button", { name: "Salvar material" }).click();
  await page.getByLabel("Quantidade do material 1: como calcular?").selectOption("roof-area");
  await page.getByLabel("Sobra / perdas do material 1 (%)").fill("5");
  await page.getByRole("button", { name: "Ir para custos" }).click();
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await page.getByLabel("Descrição da mão de obra 1").fill("Montagem");
  await page.getByLabel("Quantidade de serviço 1").fill("2");
  await page.getByLabel("Unidade de serviço 1", { exact: true }).fill("dia");
  await page.getByLabel("Valor por unidade de serviço 1 (R$)").fill("500");
  await page.getByRole("button", { name: "Adicionar despesa" }).click();
  await page.getByLabel("Descrição da despesa 1").fill("Frete");
  await page.getByLabel("Quantidade de despesa 1").fill("1");
  await page.getByLabel("Valor por unidade de despesa 1 (R$)").fill("250");
  await page.getByLabel("Acrescentar ao custo (%)").fill("25");
  await page.getByRole("button", { name: "Ir para resumo" }).click();
  await expect(page.getByTestId("sale-price")).toContainText("10.179,25");
  await page.getByRole("button", { name: "Salvar orçamento" }).click();
  await expect(page.getByText("Tudo salvo neste navegador.")).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Largura (m)", { exact: true })).toHaveValue("6,5");
  await step(page, "Resumo").click(); await expect(page.getByTestId("sale-price")).toContainText("10.179,25");
  await step(page, "Medidas").click(); await page.getByLabel("Largura (m)", { exact: true }).fill("8");
  await step(page, "Resumo").click(); await expect(page.getByTestId("sale-price")).not.toContainText("10.179,25");
  await expect(page.getByTestId("sale-price")).not.toContainText("Complete");
  await page.getByRole("link", { name: "Todos os projetos" }).click();
  await page.getByRole("button", { name: "Duplicar Cobertura real de teste", exact: true }).click();
  await expect(page.getByText("3 projetos encontrados")).toBeVisible();
  await page.getByLabel("Pesquisar por nome ou cliente").fill("joao"); await expect(page.getByText("2 projetos encontrados")).toBeVisible();
  await page.getByLabel("Filtrar por status").selectOption("Finalizado"); await expect(page.getByText("Nenhum resultado")).toBeVisible();
  expect(errors).toEqual([]);
});

test("exemplo: desenho, zoom, apoios, pendências e exclusão de materiais sem alterar projeto", async ({ page }) => {
  await page.goto(`/projetos/${EXAMPLE_ID}?etapa=1`);
  const drawing = page.getByRole("img", { name: "Desenho preliminar: planta" }); await expect(drawing).toBeVisible();
  const originalBox = await drawing.getAttribute("viewBox");
  await page.getByRole("button", { name: "Ampliar desenho" }).click(); await expect(drawing).not.toHaveAttribute("viewBox", originalBox!);
  await page.getByRole("button", { name: "Ajustar à tela" }).click(); await expect(drawing).toHaveAttribute("viewBox", originalBox!);
  await page.getByRole("button", { name: "De frente", exact: true }).click(); await expect(page.getByRole("img", { name: "Desenho preliminar: frente" })).toBeVisible();
  await page.getByRole("button", { name: "De lado", exact: true }).click(); await expect(page.getByRole("img", { name: "Desenho preliminar: lateral" })).toBeVisible();
  await page.getByText("Apoios e perfis (opcional)", { exact: true }).click();
  await page.getByRole("button", { name: "Informar um apoio" }).click();
  await page.getByLabel("Apoio 1: X (m)").fill("7"); await page.getByLabel("Apoio 1: Y (m)").fill("0");
  await expect(page.getByText(/Há apoios incompletos ou fora da cobertura/)).toBeVisible();
  await page.getByLabel("Apoio 1: X (m)").fill("0");
  await expect(page.getByText(/Há apoios incompletos ou fora da cobertura/)).toHaveCount(0);
  await step(page, "Resumo").click(); await expect(page.getByTestId("sale-price")).toContainText("9.831,50");
  await step(page, "Materiais").click(); await page.getByLabel("Preço do material 1 por m² (R$)").fill("");
  await step(page, "Resumo").click(); await expect(page.getByTestId("sale-price")).toContainText("Complete os itens abaixo");
  await expect(page.getByText(/Informe o preço de compra/)).toBeVisible();
  await step(page, "Materiais").click(); await page.getByLabel("Preço do material 1 por m² (R$)").fill("80");
  await page.getByRole("link", { name: "Todos os projetos" }).click();
  await page.goto("/materiais");
  page.once("dialog", d => d.accept()); await page.locator("article").filter({ hasText: "Telha por m²" }).getByRole("button", { name: "Excluir", exact: true }).click();
  await page.goto(`/projetos/${EXAMPLE_ID}?etapa=4`); await expect(page.getByTestId("sale-price")).toContainText("9.831,50");
});

test("backup versão 2 com geometria, custos e referências e exclusão confirmada", async ({ page }) => {
  await page.goto("/configuracoes");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Exportar backup JSON" }).click();
  const file = await download; const path = await file.path();
  await page.getByLabel("Selecionar backup JSON").setInputFiles(path!);
  await expect(page.getByText("Backup válido para importação")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar cópias" }).click();
  await expect(page.getByText("Importação concluída: 1 projetos e 3 materiais adicionados.")).toBeVisible();
  await page.goto("/projetos"); await expect(page.getByText("2 projetos encontrados")).toBeVisible();
  page.once("dialog", d => d.dismiss()); await page.getByRole("button", { name: /^Excluir/ }).first().click();
  await expect(page.getByText("2 projetos encontrados")).toBeVisible();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: /^Excluir/ }).first().click();
  await expect(page.getByText("1 projeto encontrado")).toBeVisible();
  await page.getByRole("link", { name: "EXEMPLO — Cobertura da garagem" }).click(); await page.getByRole("button", { name: "Orçamento de venda", exact: true }).click(); await step(page, "Resumo").click();
  await expect(page.getByTestId("sale-price")).toContainText("9.831,50");
});

test("configurações com vírgula e proteção de dados corrompidos", async ({ page }) => {
  await page.goto("/configuracoes");
  await page.getByLabel("Selecionar backup JSON").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByText(/Backup inválido ou de versão incompatível/)).toBeVisible();
  await page.getByLabel("Nome da empresa *").fill("JPN Oficina"); await page.getByLabel("Perdas padrão (%)").fill("5,5");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByText("Configurações salvas neste navegador.")).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Perdas padrão (%)")).toHaveValue("5,5");
  await page.evaluate(() => localStorage.setItem("jpn-projetos:v1", "{broken"));
  await page.reload(); await expect(page.getByRole("heading", { name: "Não foi possível abrir os dados" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe("{broken");
});

test("amplia e movimenta o desenho com gestos de toque", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(value => {
    if (!localStorage.getItem("jpn-projetos:v1")) localStorage.setItem("jpn-projetos:v1", JSON.stringify(value));
  }, { ...emptySnapshot(), exampleInstalled: true,
    projects: [{ ...exampleProject(), isExample: false }],
    materials: exampleMaterials().map(item => ({ ...item, isExample: false })) });
  const page = await context.newPage();
  await page.goto(`/projetos/${EXAMPLE_ID}?etapa=1`);
  const svg = page.getByRole("img", { name: "Desenho preliminar: planta" });
  await svg.scrollIntoViewIfNeeded(); const rect = (await svg.boundingBox())!;
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  const box = await svg.getAttribute("viewBox"); const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60, y, id: 1 }, { x: x + 60, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(svg).not.toHaveAttribute("viewBox", box!);
  const zoomed = await svg.getAttribute("viewBox");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 35, y: y + 30, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(svg).not.toHaveAttribute("viewBox", zoomed!);
  await page.getByRole("button", { name: "Ajustar à tela" }).click(); await expect(svg).toHaveAttribute("viewBox", box!);
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`cinco etapas preenchidas e navegação em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/projetos", "/materiais", "/configuracoes", `/projetos/${EXAMPLE_ID}?etapa=1`]) {
      await page.goto(route); await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    for (const label of ["Cliente", "Medidas", "Materiais", "Custos", "Resumo"]) {
      await step(page, label).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const small = await page.locator(".app button:visible, .app .button:visible, .app .nav-item:visible").evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().height < 44).map(el => el.textContent)); expect(small).toEqual([]);
      if (label === "Medidas" || label === "Resumo") await page.screenshot({ path: `test-results/${label}-${width}.png`, fullPage: true });
    }
    await expect(page.getByTestId("sale-price")).toContainText("9.831,50");
  });
}
