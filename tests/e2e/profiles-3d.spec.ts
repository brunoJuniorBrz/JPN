import { expect, test, type Page } from "@playwright/test";
import { planningExample } from "../../src/domain/planning-example";
import { emptySnapshot } from "../../src/domain/models";
import { roles, sectionDataSchema } from "../../src/domain/structure";
import { visualSectionSchema } from "../../src/domain/profile-section";
import examples from "../../examples/perfis-3d.json" with { type: "json" };

async function seed(page: Page) {
  const p = planningExample(); p.isExample = false;
  roles.forEach((role, i) => {
    const { thicknessMm, expectedAreaMm2: _area, ...v } = examples.sections[i]; void _area;
    p.planning!.profiles[role].visualSection = visualSectionSchema.parse(v);
    p.planning!.profiles[role].data = { ...sectionDataSchema.parse({}), thicknessMm: thicknessMm ?? null };
  });
  // Explicit missing geometry on one category exercises mixed solids/line fallback.
  delete p.planning!.profiles.web.visualSection;
  await page.addInitScript(snapshot => { if (!localStorage.getItem("jpn-projetos:v1")) localStorage.setItem("jpn-projetos:v1", JSON.stringify(snapshot)); }, { ...emptySnapshot(), exampleInstalled: true, projects: [p] });
  await page.goto(`/projetos/${p.id}?fluxo=levantamento&etapa=3`);
  await expect(page.getByTestId("takeoff-totals")).toBeVisible(); return p;
}
for (const width of [375, 1440]) test.describe(`dispositivo ${width}px`, () => {
test.use({ isMobile: width === 375, hasTouch: width === 375, deviceScaleFactor: width === 375 ? 2 : 1 });
test(`perfis 3D, seleção, modos e persistência em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await seed(page);
  const before = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  const totals = await page.getByTestId("takeoff-totals").innerText();
  // Even a previously stored Structural preference must not override the new opening default.
  await page.evaluate(() => localStorage.setItem("jpn-viewer-mode:v1", "structural"));
  await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" }); await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", "profiles");
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("");
  if (width === 375) expect(Number(await canvas.getAttribute("data-pixel-ratio"))).toBeGreaterThanOrEqual(1.75);
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await expect(page.locator(".structure-viewer--expanded")).toBeVisible();
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
  await expect(page.locator(".structure-viewer--expanded")).toHaveCount(0);
  await page.getByRole("button", { name: "Perfis 3D", exact: true }).click(); await expect(canvas).toHaveAttribute("data-mode", "profiles");
  expect(Number(await canvas.getAttribute("data-solid-count"))).toBeGreaterThan(50);
  expect(Number(await canvas.getAttribute("data-fallback-count"))).toBeGreaterThan(0);
  await expect(page.getByTestId("profile-coverage")).toContainText("em linha");
  await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
  await expect(page.getByRole("status").filter({ hasText: "P1" })).toContainText("Largura externa: 100 mm");
  // Selecting or highlighting never zooms in on its own.
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await canvas.screenshot({ path: `test-results/profiles-3d-${width}.png` });
  // Exercise the actual pointer raycaster against rendered solids, independently
  // of the accessible dropdown. Scan a sparse screen grid to find a hit.
  await page.getByLabel("Selecionar peça no desenho").selectOption("");
  const rect = (await canvas.boundingBox())!; let hit = false;
  for (let y = .2; y < .85 && !hit; y += .1) for (let x = .15; x < .9 && !hit; x += .1) {
    const position = { x: rect.width * x, y: rect.height * y };
    if (width === 375) await canvas.tap({ position }); else await canvas.click({ position });
    hit = !!(await page.getByLabel("Selecionar peça no desenho").inputValue());
  }
  expect(hit).toBe(true);
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await page.getByRole("button", { name: "Focar peça selecionada" }).click();
  await expect(canvas).toHaveAttribute("data-framing", "selected-piece");
  await page.getByRole("button", { name: "Isométrica · ajustar 3D" }).click();
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await page.getByRole("button", { name: "Misto", exact: true }).click(); await expect(canvas).toHaveAttribute("data-mode", "mixed");
  await page.getByRole("button", { name: "Estrutural", exact: true }).click(); await expect(canvas).toHaveAttribute("data-mode", "structural");
  // Re-opening 3D resets mode and camera after choosing other modes or pieces.
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click();
  await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mode", "profiles");
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("");
  const box = (await canvas.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + 170); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + 180, { steps: 5 }); await page.mouse.up();
  await page.getByRole("button", { name: "Isométrica · ajustar 3D" }).click();
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(before);
  await page.reload(); await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mode", "profiles");
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  expect(await page.getByTestId("takeoff-totals").innerText()).toBe(totals);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click(); await expect(canvas).toHaveCount(0);
  expect(errors).toEqual([]);
});
});

test("cadastro geométrico incompleto avisa e persiste dimensões sem inferir propriedades", async ({ page }) => {
  await seed(page);
  await page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: "Estrutura" }).click();
  const group = page.locator("details").filter({ has: page.locator("summary", { hasText: "Geometria da seção para visualização 3D" }) }).first();
  if (await group.getAttribute("open") === null) await group.locator(":scope > summary").click();
  const detail = group.locator("details.technical-details").filter({ has: page.locator("summary", { hasText: "Geometria da seção para visualização 3D" }) }).first();
  await detail.locator(":scope > summary").click();
  await detail.getByLabel("Família geométrica 3D").selectOption("angle");
  await expect(detail).toContainText("incompletas");
  await detail.getByLabel("Aba X externa 3D (mm)").fill("100"); await detail.getByLabel("Aba Y externa 3D (mm)").fill("80");
  await detail.getByLabel("Espessura uniforme 3D (mm)").fill("6"); await detail.getByLabel("Giro axial visual (graus)").fill("90");
  await expect(detail).toContainText("Seção ideal completa");
  await page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: "Resultado" }).click();
  await page.getByRole("button", { name: "Salvar levantamento", exact: true }).click(); await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects[0].planning.profiles.column);
  expect(stored.visualSection).toEqual({ family: "angle", legXmm: 100, legYmm: 80, rollDeg: 90 });
  expect(stored.massKgM).toBe(planningExample().planning!.profiles.column.massKgM);
});

for (const width of [375, 1440]) test(`exemplo antigo abre demonstração sólida sem modificar o projeto em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const project = planningExample(); project.isExample = false;
  await page.addInitScript(snapshot => localStorage.setItem("jpn-projetos:v1", JSON.stringify(snapshot)), { ...emptySnapshot(), exampleInstalled: true, projects: [project] });
  await page.goto(`/projetos/${project.id}?fluxo=levantamento&etapa=3`);
  await expect(page.getByTestId("takeoff-totals")).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  const totals = await page.getByTestId("takeoff-totals").innerText();
  await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  await page.getByRole("button", { name: "Perfis 3D", exact: true }).click();
  await expect(page.getByTestId("profile-coverage")).toContainText("0 peças com seção 3D · 123 em linha");
  await page.getByRole("button", { name: "Ver demonstração com perfis" }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toHaveAttribute("data-solid-count", "123"); await expect(canvas).toHaveAttribute("data-fallback-count", "0");
  await expect(page.getByTestId("profile-demo-notice")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", "profiles");
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("");
  await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
  await expect(page.getByRole("status").filter({ hasText: "P1" })).toContainText("I 240 × 160");
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await page.getByRole("button", { name: "Focar peça selecionada" }).click();
  await expect(canvas).toHaveAttribute("data-framing", "selected-piece");
  await page.getByRole("button", { name: "Isométrica · ajustar 3D" }).click();
  await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
  await canvas.screenshot({ path: `test-results/demo-profile-focus-${width}.png` });
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(original);
  expect(await page.getByTestId("takeoff-totals").innerText()).toBe(totals);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Voltar ao meu projeto" }).click();
  await expect(canvas).toHaveAttribute("data-solid-count", "0");
  await page.getByLabel("Selecionar peça no desenho").selectOption("P9");
  await page.getByRole("button", { name: "Cadastrar dimensões", exact: true }).click();
  const fields = page.locator("details.technical-details").filter({ has: page.getByLabel("Família geométrica 3D") }).first();
  await expect(fields.getByLabel("Família geométrica 3D")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(original);
});

for (const width of [375, 1440]) test(`atalho visível abre o 3D da estrutura no fluxo em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir exemplo completo de pré-projeto" }).click();
  await page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: "Obra" }).click();
  await expect(page.getByRole("button", { name: "Abrir modelo 3D" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir modelo 3D" }).click();
  await expect(page.getByRole("button", { name: "Voltar às vistas 2D" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Perfis 3D", exact: true })).toBeVisible();
  const shortcutCanvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(shortcutCanvas).toBeVisible();
  await expect(shortcutCanvas).toHaveAttribute("data-mode", "profiles");
  await expect(shortcutCanvas).toHaveAttribute("data-framing", "whole-structure");
  await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
  await page.getByRole("button", { name: "Focar peça selecionada" }).click();
  await expect(shortcutCanvas).toHaveAttribute("data-framing", "selected-piece");
  // Repeating the shortcut on Resultado must reset the camera and mode.
  await page.getByRole("button", { name: "Abrir modelo 3D" }).click();
  await expect(shortcutCanvas).toHaveAttribute("data-mode", "profiles");
  await expect(shortcutCanvas).toHaveAttribute("data-framing", "whole-structure");
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("");
  await page.getByRole("button", { name: "Voltar às vistas 2D" }).click();
  await page.getByRole("button", { name: "Abrir modelo 3D" }).click();
  await expect(shortcutCanvas).toHaveAttribute("data-mode", "profiles");
  await expect(shortcutCanvas).toHaveAttribute("data-framing", "whole-structure");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


for (const width of [375, 1440]) test(`Studio 3D filtra camadas, isola peça e preserva câmera em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await seed(page);
  const before = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  const totals = await page.getByTestId("takeoff-totals").innerText();
  await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await expect(canvas).toHaveAttribute("data-mode", "profiles");
  await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
  await page.getByRole("button", { name: "Isolar peça" }).click();
  await expect(canvas).toHaveAttribute("data-isolated-piece", "P1");
  await expect(page.getByRole("button", { name: "Sair do isolamento" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mostrar tudo" }).click();
  await expect(canvas).toHaveAttribute("data-isolated-piece", "");
  await page.locator(".inspection-layers summary").click();
  await page.getByLabel("Pilares", { exact: true }).uncheck();
  await expect(canvas).toHaveAttribute("data-visible-roles", /topChord/);
  expect((await canvas.getAttribute("data-visible-roles"))!.split(",")).not.toContain("column");
  await page.getByRole("button", { name: "Mostrar tudo" }).click();
  expect((await canvas.getAttribute("data-visible-roles"))!.split(",")).toContain("column");
  await page.getByRole("group", { name: "Orientação da câmera 3D" }).getByRole("button", { name: "Superior" }).click();
  await expect(canvas).toHaveAttribute("data-camera-view", "top");
  await page.setViewportSize({ width, height: 760 });
  await expect(canvas).toHaveAttribute("data-camera-view", "top");
  await page.getByRole("button", { name: "Isométrica · ajustar 3D" }).click();
  await expect(canvas).toHaveAttribute("data-camera-view", "iso");
  await page.getByRole("group", { name: "Modo de visualização 3D" }).getByRole("button", { name: "Acabado" }).click();
  await expect(page.locator(".inspection-tools")).toHaveCount(0);
  await page.getByRole("group", { name: "Modo de visualização 3D" }).getByRole("button", { name: "Perfis 3D" }).click();
  await expect(page.locator(".inspection-tools")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(before);
  expect(await page.getByTestId("takeoff-totals").innerText()).toBe(totals);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [375, 1440]) test(`Studio 3D mostra ficha rápida e recolhe ferramentas em ${width}px`, async ({ page }) => {
  await page.setViewportSize({width, height: 850});
  await seed(page);
  const before = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  await page.getByRole("button", {name: "Visualizar em 3D", exact: true}).click();
  const canvas = page.getByRole("img", {name: "Modelo 3D da estrutura"});
  await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
  const card = page.getByTestId("inspection-selected-piece");
  await expect(card).toContainText("P1");
  await expect(card).toContainText("Pilares");
  await expect(card).toContainText("NÃO DIMENSIONADO");
  await card.getByRole("button", {name: "Aproximar"}).click();
  await expect(canvas).toHaveAttribute("data-framing", "selected-piece");
  await page.getByRole("button", {name: "Isométrica · ajustar 3D"}).click();
  await page.locator(".inspection-layers summary").click();
  await page.getByLabel("Pilares", {exact:true}).uncheck();
  await expect(card).toContainText("oculta nas camadas");
  await card.getByRole("button", {name:"Mostrar categoria"}).click();
  await expect(canvas).toHaveAttribute("data-visible-roles", /column/);
  await expect(card.getByRole("button", {name:"Aproximar"})).toBeVisible();
  await page.getByRole("button", {name:"Recolher ferramentas"}).click();
  await expect(page.getByRole("button", {name:"Mostrar ferramentas"})).toHaveAttribute("aria-expanded","false");
  await expect(page.locator(".inspection-layers")).toHaveCount(0);
  await expect(canvas).toBeVisible();
  await page.getByRole("button", {name:"Mostrar ferramentas"}).click();
  await expect(page.locator(".inspection-layers")).toBeVisible();
  await card.getByRole("button", {name:"Limpar seleção"}).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByLabel("Selecionar peça no desenho")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
