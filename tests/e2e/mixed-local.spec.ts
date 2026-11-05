import { openEngineeringTool } from "./result-tabs";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("health BUSY transitório espera o executor e recupera sem intervenção", async ({ page }) => {
  test.setTimeout(60000);
  let busyChecks = 0;
  await page.route("**/api/experimental/mixed3d", async route => {
    if (route.request().method() === "GET" && route.request().headers()["x-jpn-request"] === "1" && busyChecks < 3) {
      busyChecks++;
      await route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: { code: "BUSY", message: "Executor ocupado." } }) });
      return;
    }
    await route.continue();
  });
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("10");
  await page.getByLabel("Comprimento (m)").fill("20");
  await page.getByLabel("Altura (m)").fill("4");
  await page.getByRole("button", { name: "Gerar modelo 3D" }).click();
  await page.getByRole("button", { name: "Salvar levantamento" }).click();
  await openEngineeringTool(page, "Análise Estrutural Experimental");
  const panel = page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1", { timeout: 40000 });
  expect(busyChecks).toBe(3);
});

for (const width of [375, 1440]) test(`fluxo misto real, rastreabilidade 3D e invalidação em ${width}px`, async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width, height: 930 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("10"); await page.getByLabel("Comprimento (m)").fill("20"); await page.getByLabel("Altura (m)").fill("4");
  await page.getByRole("button", { name: "Gerar modelo 3D" }).click();
  await page.getByRole("button", { name: "Salvar levantamento" }).click();
  await openEngineeringTool(page, "Análise Estrutural Experimental");
  const panel = page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1", { timeout: 20000 });
  await panel.getByRole("button", { name: "Executar análise mista local" }).click();
  await expect(panel.getByRole("alert")).toContainText(/ELEMENT_KIND|PROPERTIES|SUPPORTS/);
  const before = await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"));
  await panel.getByRole("button", { name: "Abrir exemplo misto independente" }).click();
  await expect(panel.getByLabel("Tipo físico do grupo")).toHaveValue("frame");
  await expect(panel.getByLabel("Elasticidade E (GPa)")).toHaveValue("200");
  await panel.getByRole("button", { name: "2. Apoios e ligações" }).click();
  await expect(panel.getByLabel(/ · UX/)).toHaveValue("fixed");
  await panel.getByRole("button", { name: "3. Cargas e combinações" }).click();
  await expect(panel.getByLabel("Fonte e hipótese de TESTE")).not.toBeEmpty();
  await panel.getByRole("button", { name: "Executar análise mista local" }).click();
  await expect(panel.getByTestId("mixed-results")).toContainText("132 nós · 207 peças · 243 segmentos · 36 axiais", { timeout: 30000 });
  const entries = panel.getByLabel("Peça na análise mista");
  // Obtain an axial original ID from the real export, never a hardcoded renderer index.
  const downloadPromise = page.waitForEvent("download"); await panel.getByRole("button", { name: "Exportar resultados mistos" }).click();
  const download = await downloadPromise, output = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(output.result.solver.version).toBe("3.2.1"); expect(output.result.input_sha256).toBe(output.prepared.input_sha256);
  const axial = output.prepared.request.members.find((m: { kind: string }) => m.kind === "axial");
  const mapping = output.prepared.mapping.members.find((m: { id: string }) => m.id === axial.id);
  await entries.selectOption(mapping.originalId);
  await expect(panel.getByTestId("mixed-selection")).toHaveAttribute("data-segment", axial.id);
  await expect(panel.getByTestId("mixed-selection")).toHaveAttribute("data-kind", "axial");
  const firstAxial = await panel.getByTestId("mixed-axial").textContent();
  expect(firstAxial).toContain((output.result.combinations["TESTE-1"].members[axial.id].axial_n / 1000).toExponential(5));
  await panel.getByLabel("Combinação mista").selectOption("INVERSO-1");
  await expect(panel.getByTestId("mixed-axial")).toContainText((-output.result.combinations["TESTE-1"].members[axial.id].axial_n / 1000).toExponential(5));
  const viewer = panel.getByTestId("mixed-viewer"), canvas = viewer.locator("canvas");
  await viewer.getByRole("button", { name: "Focar peça selecionada" }).click();
  await expect(canvas).toHaveAttribute("data-analysis-mode", "experimental");
  await canvas.click();
  const picked = await canvas.getAttribute("data-picked-piece"); expect(picked).toBeTruthy();
  await expect(panel.getByTestId("mixed-selection")).toHaveAttribute("data-original-piece", picked!);
  await expect(entries).toHaveValue(picked!);
  await page.screenshot({ path: `../m16-mixed-results-${width}.png` });
  expect(await page.evaluate(() => localStorage.getItem("jpn-projetos:v1"))).toBe(before);
  await panel.getByRole("button", { name: "Preparação mista", exact: true }).click();
  await panel.getByLabel("Fonte do material / fabricante").fill("Revisão posterior ao cálculo");
  await panel.getByRole("button", { name: "Resultados 3D", exact: true }).click();
  await expect(panel.getByTestId("mixed-no-results")).toBeVisible(); await expect(panel.getByTestId("mixed-results")).toHaveCount(0);
  if (width === 1440) {
    // Delay delivery of an ACTUAL Python response; editing while it is in
    // flight must discard it. The numerical response itself is never mocked.
    let release!: () => void, calculated!: () => void, finished!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }), responseReady = new Promise<void>(resolve => { calculated = resolve; }), done = new Promise<void>(resolve => { finished = resolve; });
    await page.route("**/api/experimental/mixed3d", async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const response = await route.fetch(); calculated(); await hold;
      try { await route.fulfill({ response }); } catch {} finally { finished(); }
    });
    await panel.getByRole("button", { name: "Preparação mista", exact: true }).click();
    await panel.getByRole("button", { name: "Executar análise mista local" }).click(); await responseReady;
    await panel.getByLabel("Fonte do material / fabricante").fill("Mudança enquanto a resposta real estava em trânsito"); release(); await done;
    await panel.getByRole("button", { name: "Resultados 3D", exact: true }).click();
    await expect(panel.getByTestId("mixed-no-results")).toBeVisible(); await expect(panel.getByTestId("mixed-results")).toHaveCount(0);
    await page.unroute("**/api/experimental/mixed3d");
  }
  await panel.getByRole("button", { name: "Voltar à obra" }).click();
  await expect(panel.getByLabel("Tipo físico do grupo")).toHaveValue("pending");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
