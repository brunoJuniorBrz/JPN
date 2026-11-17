import { expect, test } from "@playwright/test";
import { openStudioStep, type StudioStepName } from "./result-tabs";

const steps: StudioStepName[] = ["Obra", "Geometria", "Estrutura", "Cargas", "Análise", "Verificação", "Materiais", "Arquivos"];

// UI F4: totais ao vivo, selo de bloqueio em todas as etapas e painel de pendências agrupadas.
for (const width of [390, 1440]) test(`selo, pendências e totais ao vivo em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  await expect(page.getByTestId("takeoff-totals")).toContainText("123");
  const seal = page.getByTestId("fabrication-seal");
  for (const step of steps) { await openStudioStep(page, step); await expect(seal).toBeVisible(); await expect(seal).toContainText("Bloqueado para fabricação"); }
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  await expect(page.getByTestId("studio-analysis-state")).toContainText(/Sem análise|não aberta/);

  // Painel de pendências: modal acessível, três grupos, NOT_READY_BLOCKED explícito, Esc devolve o foco.
  await seal.click();
  const dialog = page.getByRole("dialog", { name: "Pendências do projeto" });
  await expect(dialog).toContainText("NOT_READY_BLOCKED");
  await expect(dialog.getByRole("tab")).toHaveText([/^Normativas/, /^Dados faltando/, /^Revisão do engenheiro/]);
  await dialog.getByRole("tab", { name: /^Revisão do engenheiro/ }).click();
  await expect(dialog.getByRole("tabpanel")).toContainText("fabricationRelease = false");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden(); await expect(seal).toBeFocused();

  // Totais ao vivo: mudar o espaçamento atualiza peças em menos de 200 ms (mesmo render da edição).
  await openStudioStep(page, "Estrutura");
  const field = page.getByLabel("Espaçamento máximo entre tesouras (m)", { exact: true });
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="takeoff-totals"]')!, start = { t: 0 };
    (window as Window & { __totals?: { start: { t: number }; ms: number | null } }).__totals = { start, ms: null };
    new MutationObserver(() => { const w = window as Window & { __totals?: { start: { t: number }; ms: number | null } }; if (w.__totals && w.__totals.ms === null && w.__totals.start.t) w.__totals.ms = performance.now() - w.__totals.start.t; })
      .observe(target, { subtree: true, characterData: true, childList: true });
  });
  await field.evaluate((input: HTMLInputElement) => {
    (window as Window & { __totals?: { start: { t: number } } }).__totals!.start.t = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, "4"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByTestId("takeoff-totals")).toContainText("149");
  const ms = await page.evaluate(() => (window as Window & { __totals?: { ms: number | null } }).__totals!.ms);
  expect(ms).not.toBeNull(); expect(ms!).toBeLessThan(200);
  await expect(page.getByTestId("studio-live-totals")).toContainText("Massa");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
