import { expect, test } from "@playwright/test";

// UI F5: menu de contexto do 3D (teclado), paleta Ctrl+K e pós-processamento só no modo Acabado.
test("menu de contexto, Ctrl+K e acabado realista no estúdio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" }); await expect(canvas).toBeVisible({ timeout: 20000 });
  await page.getByLabel("Selecionar peça no desenho").selectOption("T1-BS1");

  // Menu de contexto pelo teclado (Shift+F10) sobre a área do modelo.
  await page.getByTestId("studio-canvas-zone").focus(); await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Ações do modelo 3D" });
  await expect(menu).toContainText("T1-BS1");
  await menu.getByRole("menuitem", { name: /^Ocultar família/ }).click();
  await expect(menu).toBeHidden();
  await page.getByTestId("studio-canvas-zone").focus(); await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Mostrar tudo" }).click();
  await page.getByTestId("studio-canvas-zone").focus(); await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Ver esforços" }).click();
  await expect(page.getByTestId("studio-selection")).toContainText("T1-BS1");

  // Paleta de comandos: Ctrl+K, digitar e Enter leva à etapa.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Comandos do projeto" });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder(/Etapa, ferramenta/).fill("Cargas"); await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: /^Cargas/ })).toHaveAttribute("aria-current", "step");

  // Acabado: GTAO + contorno só aqui (e só fora de aparelho fraco); volta a desligar nos modos técnicos.
  await page.getByRole("button", { name: "Acabado", exact: true }).click();
  const quality = await canvas.getAttribute("data-quality");
  await expect(canvas).toHaveAttribute("data-postprocessing", quality === "reduced" ? "off" : "gtao+outline");
  expect(Number(await canvas.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
  await page.getByRole("combobox", { name: "Tipo de telha" }).selectOption("corrugated");
  await page.getByRole("button", { name: "Perfis 3D", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-postprocessing", "off");
  expect(errors).toEqual([]);
});
