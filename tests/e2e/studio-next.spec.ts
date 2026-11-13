import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { planningExample } from "../../src/domain/planning-example";
import { emptySnapshot } from "../../src/domain/models";
import { roles, sectionDataSchema } from "../../src/domain/structure";
import { visualSectionSchema } from "../../src/domain/profile-section";
import examples from "../../examples/perfis-3d.json" with { type: "json" };

const shots = "validation/3d-studio/depois"; mkdirSync(shots, { recursive: true });
async function seed(page: Page) {
  const p = planningExample(); p.isExample = false;
  roles.forEach((role, i) => {
    const { thicknessMm, expectedAreaMm2: _area, ...v } = examples.sections[i]; void _area;
    p.planning!.profiles[role].visualSection = visualSectionSchema.parse(v);
    p.planning!.profiles[role].data = { ...sectionDataSchema.parse({}), thicknessMm: thicknessMm ?? null };
  });
  await page.addInitScript(snapshot => { if (!localStorage.getItem("jpn-projetos:v1")) localStorage.setItem("jpn-projetos:v1", JSON.stringify(snapshot)); }, { ...emptySnapshot(), exampleInstalled: true, projects: [p] });
  await page.goto(`/projetos/${p.id}?fluxo=levantamento&etapa=3`);
  await expect(page.getByTestId("takeoff-totals")).toBeVisible();
}

for (const width of [375, 1440]) test(`Studio releases WebGL after repeated mounts at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await seed(page);
  const saved = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  let triangles: string | null = null;
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
    const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
    await expect(canvas).toHaveAttribute("data-environment", "procedural");
    if (triangles === null) triangles = await canvas.getAttribute("data-triangles");
    else await expect(canvas).toHaveAttribute("data-triangles", triangles);
    const handle = await canvas.elementHandle();
    await page.getByLabel("Acabamento do aço (visual)").selectOption(cycle % 2 ? "painted" : "galvanized");
    await page.getByRole("button", { name: "Voltar às vistas 2D", exact: true }).click();
    await expect(canvas).toHaveCount(0);
    // forceContextLoss releases GPU resources as well as removing the DOM node.
    await expect.poll(() => handle!.evaluate(element => (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost())).toBe(true);
    expect(await handle!.evaluate(element => element.isConnected)).toBe(false);
    await handle!.dispose();
  }
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(saved);
  expect(errors).toEqual([]);
});

for (const width of [375, 1440]) test.describe(`studio-next ${width}px`, () => {
  test.use({ isMobile: width === 375, hasTouch: width === 375, deviceScaleFactor: width === 375 ? 2 : 1 });
  test("view tools are visual only", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await seed(page);
    const before = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
    const totals = await page.getByTestId("takeoff-totals").innerText();
    await page.getByRole("button", { name: "Visualizar em 3D", exact: true }).click();
    const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" }); await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-projection", "perspective");
    await expect(canvas).toHaveAttribute("data-environment", "procedural");
    await expect(canvas).toHaveAttribute("data-shadows", "on");
    const shot = async (name: string) => { await page.waitForTimeout(700); await canvas.screenshot({ path: `${shots}/e2e-${width}-${name}.png` }); };

    // True orthographic projection, and it survives camera presets and resize.
    const projection = page.getByRole("button", { name: "Perspectiva", exact: true });
    await projection.click();
    await expect(canvas).toHaveAttribute("data-projection", "orthographic");
    await expect(page.getByRole("button", { name: "Ortográfica", exact: true })).toHaveAttribute("aria-pressed", "true");
    const views = page.getByRole("group", { name: "Orientação da câmera 3D" });
    await views.getByRole("button", { name: "Frontal" }).click();
    await expect(canvas).toHaveAttribute("data-camera-view", "front");
    await shot("ortografica-frontal");
    await page.setViewportSize({ width, height: 780 });
    await expect(canvas).toHaveAttribute("data-camera-view", "front");
    await expect(canvas).toHaveAttribute("data-projection", "orthographic");
    await views.getByRole("button", { name: "Vista isométrica" }).click();
    await expect(canvas).toHaveAttribute("data-camera-view", "iso");
    await page.getByRole("button", { name: "Ortográfica", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-projection", "perspective");

    // Steel finish is a rendering preset.
    await page.getByLabel("Acabamento do aço (visual)").selectOption("galvanized");
    await expect(canvas).toHaveAttribute("data-finish", "galvanized");
    await shot("galvanizado");
    await page.getByLabel("Acabamento do aço (visual)").selectOption("painted");

    // Section cut: position is reported in project metres and follows the slider.
    await page.getByRole("button", { name: "Corte 3D", exact: true }).click();
    const section = page.getByTestId("3d-section");
    await expect(section).toBeVisible();
    await expect(canvas).toHaveAttribute("data-section-axis", "y");
    const middle = Number(await canvas.getAttribute("data-section-position-mm"));
    const full = Number(await canvas.getAttribute("data-triangles"));
    await expect(page.getByTestId("3d-section-position")).toContainText(" m");
    await section.getByLabel("Posição do corte").fill("0.25");
    await expect.poll(async () => Number(await canvas.getAttribute("data-section-position-mm"))).toBeLessThan(middle);
    await section.getByLabel("Eixo do corte").selectOption("z");
    await expect(canvas).toHaveAttribute("data-section-axis", "z");
    await section.getByLabel("Inverter lado visível").check();
    await expect(canvas).toHaveAttribute("data-section-flipped", "true");
    await section.getByLabel("Eixo do corte").selectOption("y");
    await section.getByLabel("Inverter lado visível").uncheck();
    await section.getByLabel("Posição do corte").fill("0.5");
    await shot("corte");
    expect(Number(await canvas.getAttribute("data-triangles"))).toBe(full); // geometry is clipped on the GPU, never rebuilt
    await page.getByRole("button", { name: "Encerrar corte" }).click();
    await expect(canvas).toHaveAttribute("data-section-axis", "");
    await expect(section).toHaveCount(0);

    // Contextual transparency needs a selected piece and never moves the camera.
    await page.getByRole("button", { name: "Raio-X da seleção" }).click();
    await expect(canvas).toHaveAttribute("data-ghost", "false");
    await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
    await expect(canvas).toHaveAttribute("data-ghost", "true");
    await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
    const card = page.getByTestId("inspection-selected-piece");
    await expect(card).toContainText("P1"); await expect(card).toContainText("Nós ");
    await shot("raio-x");
    await page.getByRole("button", { name: "Raio-X ligado" }).click();
    await expect(canvas).toHaveAttribute("data-ghost", "false");

    // Finished mode: relief roof, x-ray shortcut, and no technical cut left behind.
    await page.getByRole("button", { name: "Corte 3D", exact: true }).click();
    await page.getByRole("group", { name: "Modo de visualização 3D" }).getByRole("button", { name: "Acabado" }).click();
    await expect(canvas).toHaveAttribute("data-context-loaded", "true", { timeout: 20000 });
    await expect(canvas).toHaveAttribute("data-roof-relief", "procedural");
    await expect(canvas).toHaveAttribute("data-section-axis", "");
    await expect(page.locator(".presentation-label")).toContainText("NÃO DIMENSIONADO");
    await page.waitForTimeout(1500); await shot("acabado");
    await page.getByRole("button", { name: "Ver estrutura sob o telhado" }).click();
    await expect(page.getByLabel(/Opacidade do telhado/)).toHaveValue("0.3");
    await shot("acabado-telhado-translucido");
    await page.getByLabel("Tipo de telha").selectOption("sandwich");
    await page.getByRole("button", { name: "Telhado opaco" }).click();
    await shot("acabado-termoacustica");
    expect(Number(await canvas.getAttribute("data-draw-calls"))).toBeLessThan(200);

    expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(before);
    await page.getByRole("group", { name: "Modo de visualização 3D" }).getByRole("button", { name: "Perfis 3D" }).click();
    expect(await page.getByTestId("takeoff-totals").innerText()).toBe(totals);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
