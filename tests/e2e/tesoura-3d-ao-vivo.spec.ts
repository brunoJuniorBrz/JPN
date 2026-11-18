import { expect, test, type Page } from "@playwright/test";

/** Cria o projeto do Tom (8×10) pela página /tesoura e abre o passo Tesoura do estúdio. */
async function openTrussStep(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto("/tesoura");
  await page.getByRole("button", { name: "Exemplo 8×10" }).click();
  await page.getByRole("button", { name: "Criar projeto com esta tesoura" }).click();
  // A primeira visita à rota do projeto compila no servidor de desenvolvimento.
  await expect(page).toHaveURL(/\/projetos\/[^/]+\?fluxo=levantamento&etapa=3/, { timeout: 60000 });
  const viewport = page.getByTestId("truss-viewport");
  const canvas = viewport.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toBeVisible({ timeout: 45000 });
  await expect(canvas).toHaveAttribute("data-geometries", /\d+/);
  return { viewport, canvas };
}
const form = (page: Page) => page.getByTestId("truss-form");
async function openSection(page: Page, id: string) {
  const section = form(page).locator(`details[data-section="${id}"]`);
  if (await section.locator("summary").isVisible()) await section.locator("summary").click();
  else await form(page).getByRole("tab", { name: id === "tesoura" ? "Tesoura" : id }).click();
  await expect(section).toHaveAttribute("open", "");
}

test("rascunho ao vivo: o 3D muda sem aplicar, um só canvas, sem vazamento; Descartar volta ao aplicado", async ({ page }) => {
  // 50 reconstruções da cena com WebGL por software (swiftshader) levam alguns minutos.
  test.setTimeout(480000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const { viewport, canvas } = await openTrussStep(page, 1440);
  await expect(page.getByTestId("fabrication-seal")).toContainText("Estudo · fabricação bloqueada");
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  // Modo construtor: sem recalcular/pendências de análise na barra do passo Tesoura.
  await expect(page.locator(".studio-status").getByRole("button", { name: /Recalcular/ })).toHaveCount(0);
  await expect(page.getByTestId("truss-draft-badge")).toHaveCount(0);
  const geometries = await canvas.getAttribute("data-geometries");
  const rebuilds = Number(await canvas.getAttribute("data-rebuilds"));
  await expect(viewport).toHaveAttribute("data-high-mm", "800");

  await openSection(page, "tesoura");
  const plus = page.getByRole("button", { name: "Aumentar Altura no lado alto (cm) em 1 cm" });
  for (let i = 0; i < 5; i++) await plus.click();
  await expect(viewport).toHaveAttribute("data-high-mm", "850");
  await expect(page.getByTestId("truss-draft-badge")).toContainText("RASCUNHO — não aplicado");
  await expect(page.getByTestId("truss-draft-badge")).toContainText("Δ");
  await expect.poll(async () => Number(await canvas.getAttribute("data-rebuilds"))).toBeGreaterThan(rebuilds);
  expect(await viewport.locator("canvas").count()).toBe(1);
  expect(Number(await viewport.getAttribute("data-draft-ms"))).toBeLessThanOrEqual(50);
  // Nada foi salvo: o projeto gravado continua com 80 cm no lado alto.
  const stored = () => page.evaluate(() => JSON.stringify(localStorage.getItem("jpn-projetos:v1")).includes('\\"highHeightMm\\":850'));
  expect(await stored()).toBe(false);

  // 50 edições: o renderer é reaproveitado e a contagem de geometrias volta ao mesmo valor.
  for (let i = 0; i < 50; i++) { await plus.click(); await page.waitForTimeout(170); }
  await expect(viewport).toHaveAttribute("data-high-mm", "1350");
  await expect.poll(async () => canvas.getAttribute("data-geometries")).toBe(geometries);
  expect(await viewport.locator("canvas").count()).toBe(1);

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(viewport).toHaveAttribute("data-high-mm", "800");
  await expect(page.getByTestId("truss-draft-badge")).toHaveCount(0);
  expect(await stored()).toBe(false);
  expect(errors).toEqual([]);
});

test("tocar um montante no 3D seleciona a mesma estação na elevação e abre o painel do ponto", async ({ page }) => {
  test.setTimeout(180000);
  const { canvas } = await openTrussStep(page, 1440);
  await page.getByRole("group", { name: "Camadas do 3D" }).getByRole("button", { name: "Telha" }).click();
  await page.getByRole("button", { name: "Frente da tesoura" }).click();
  await page.waitForTimeout(600);
  const panel = page.getByTestId("truss-point-panel"), box = (await canvas.boundingBox())!;
  let hit = false;
  for (let y = .3; y < .85 && !hit; y += .04) for (let x = .08; x < .95 && !hit; x += .02) {
    await canvas.click({ position: { x: box.width * x, y: box.height * y } });
    hit = await panel.isVisible();
  }
  expect(hit).toBe(true);
  const title = await panel.locator("strong").first().innerText(); // "Montante N"
  const n = Number(/Montante (\d+)/.exec(title)![1]);
  await page.getByRole("button", { name: "Elevação", exact: true }).click();
  await expect(page.getByTestId("truss-drawing").locator(`[data-station="${n - 1}"]`)).toHaveAttribute("aria-pressed", "true");
});

test("arrastar um montante na Elevação muda a cota (snap 1 cm) e mostra a medida ao vivo", async ({ page }) => {
  test.setTimeout(120000);
  await openTrussStep(page, 1440);
  await page.getByRole("button", { name: "Elevação", exact: true }).click();
  const post = page.getByTestId("truss-drawing").locator('[data-station="2"]');
  const b = (await post.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 15, y, { steps: 4 });
  await expect(page.getByTestId("truss-live-dimension")).toContainText("cm da ponta");
  await page.mouse.move(x + 30, y, { steps: 4 }); await page.mouse.up();
  const field = page.getByTestId("truss-point-panel").getByRole("textbox", { name: "Distância da ponta (cm)" });
  await expect(field).toBeVisible();
  const value = Number((await field.inputValue()).replace(",", "."));
  expect(Number.isInteger(value)).toBe(true); // snap de 1 cm
  await expect(page.getByTestId("truss-draft-badge")).toBeVisible();
  await expect(page.getByTestId("truss-live-dimension")).toHaveCount(0);
});

for (const [width, height] of [[390, 844], [1440, 900]] as const) for (const theme of ["light", "dark"] as const)
  test(`prints ${width}px ${theme}: canvas acima da dobra e nada coberto pela barra`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(t => { if (t === "dark") localStorage.setItem("jpn-theme:v1", "dark"); }, theme);
    const { canvas } = await openTrussStep(page, width, height);
    const c = (await canvas.boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y + Math.min(c.height, 200)).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Selo e aviso permanente de segurança inteiros dentro da largura da tela (sem ficar escondidos na rolagem).
    for (const id of ["fabrication-seal", "result-safety-warning"]) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(width + 1);
    }
    if (width < 1000) {
      // Painel inferior: rodapé Aplicar/Descartar acima da barra de etapas; o 3D fica preso no topo.
      await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(300);
      const footer = (await page.locator(".truss-inspector-footer").boundingBox())!, steps = (await page.locator(".studio-steps").boundingBox())!;
      expect(footer.y + footer.height).toBeLessThanOrEqual(steps.y + 1);
      const vp = (await page.locator(".studio-viewport").boundingBox())!;
      expect(vp.y).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `test-results/tesoura-3d-${width}-${theme}.png` });
  });
