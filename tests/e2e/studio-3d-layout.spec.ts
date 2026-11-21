import { openProjectStudio } from "./open-project-studio";
import { expect, test, type Page } from "@playwright/test";
import { openStudioStep } from "./result-tabs";

// Layout do Studio (#148): o 3D é a área principal; vistas sempre visíveis; recolher o painel não
// recria a cena; peça ↔ tabela de materiais. Medidas genéricas (12 × 20 m), sem caso único do Tom.
async function createRoof(page: Page) {
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("12");
  await page.getByLabel("Comprimento (m)").fill("20");
  await page.getByLabel("Altura (m)").fill("4");
  await openProjectStudio(page, "Gerar modelo 3D");
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toBeVisible({ timeout: 30000 });
  return canvas;
}

const cameraButtons = (page: Page) => [
  page.getByRole("button", { name: "Vista isométrica" }),
  page.getByRole("button", { name: "Superior", exact: true }),
  page.getByRole("button", { name: "Frontal", exact: true }),
  page.getByRole("button", { name: "Lateral", exact: true }),
  page.locator(".studio-projection"),
];

test("1440px: 3D ocupa a área principal, vistas visíveis e painel recolhível sem recriar a cena", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const canvas = await createRoof(page);

  // A página não rola: cada painel rola sozinho.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  const open = (await canvas.boundingBox())!;
  expect(open.width).toBeGreaterThan(1440 * 0.5);
  expect(open.height).toBeGreaterThan(900 * 0.4);

  // Vistas prontas dentro da tela 3D, inteiras e clicáveis.
  for (const button of cameraButtons(page)) {
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(open.x); expect(box.y).toBeGreaterThanOrEqual(open.y);
    expect(box.x + box.width).toBeLessThanOrEqual(open.x + open.width + 1); expect(box.y + box.height).toBeLessThanOrEqual(open.y + open.height + 1);
  }
  await page.getByRole("button", { name: "Superior", exact: true }).click();
  await page.getByRole("button", { name: "Vista isométrica" }).click();
  // Ferramentas de inspeção permanecem acessíveis no painel com rolagem própria.
  const tools = page.getByRole("button", { name: "Medir entre nós" });
  await expect(tools).toBeVisible();
  await tools.scrollIntoViewIfNeeded();
  await expect(tools).toBeInViewport();
  await tools.click();
  await expect(page.getByTestId("3d-measurement")).toBeVisible();
  await page.getByRole("button", { name: "Encerrar medição" }).click();

  // Recolher o painel amplia o 3D sem trocar o elemento WebGL.
  await canvas.evaluate(el => { (el as HTMLElement).dataset.e2eMarker = "same-canvas"; });
  await page.getByRole("button", { name: "Ampliar 3D" }).click();
  await expect(page.locator(".studio-inspector")).toBeHidden();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(open.width + 250);
  await expect(canvas).toHaveAttribute("data-e2e-marker", "same-canvas");
  await page.getByRole("button", { name: /^Mostrar painel/ }).click();
  await expect(page.locator(".studio-inspector")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-e2e-marker", "same-canvas");

  // Painel recolhido reabre ao trocar de etapa.
  await page.getByRole("button", { name: "Ampliar 3D" }).click();
  await expect(page.locator(".studio-inspector")).toBeHidden();
  await openStudioStep(page, "Estrutura");
  await expect(page.locator(".studio-inspector")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-e2e-marker", "same-canvas");

  // Tabela de materiais → peça no 3D.
  await openStudioStep(page, "Materiais");
  const lengths = page.locator(".result-material-lengths").first();
  await lengths.locator(":scope > summary").click();
  const ids = (await lengths.locator("details span").first().textContent())!.split(",").map(id => id.trim());
  await lengths.getByRole("button", { name: "Mostrar no 3D" }).first().click();
  await expect(page.getByTestId("inspection-selected-piece")).toContainText(ids[0]);
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue(ids[0]);
  await expect(canvas).toHaveAttribute("data-e2e-marker", "same-canvas");

  // Bloqueios permanecem visíveis.
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  await expect(page.getByText("Bloqueado para fabricação").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("375px: 3D na largura da tela, vistas sem cortar e painel com botão próprio", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const canvas = await createRoof(page);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThan(375 * 0.85);
  for (const button of cameraButtons(page)) {
    await expect(button).toBeVisible();
    const b = (await button.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(b.height).toBeGreaterThanOrEqual(34);
  }
  // No celular o painel usa o botão da gaveta; o atalho "Ampliar 3D" fica oculto.
  await expect(page.getByRole("button", { name: "Ampliar 3D" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Recolher painel" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("1440px: fechar tela cheia permanece acima do canvas e recebe clique real", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const canvas = await createRoof(page);
  await page.getByRole("button", { name: "Expandir modelo 3D em tela cheia", exact: true }).click();
  const expanded = page.locator(".structure-viewer--expanded");
  const close = expanded.getByRole("button", { name: "Fechar tela cheia", exact: true });
  await expect(expanded).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(close).toBeVisible();
  // O ponto central do botão deve acertar o próprio botão, jamais o WebGL.
  expect(await close.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await close.click();
  await expect(expanded).toHaveCount(0);
  await expect(canvas).toBeVisible();
});
