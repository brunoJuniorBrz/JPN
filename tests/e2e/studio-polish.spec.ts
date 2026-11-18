import { expect, test } from "@playwright/test";

// UI F6: ferramentas avançadas num menu, tour curto e tema escuro persistente, sem quebrar o celular.
for (const width of [390, 1440]) test(`ferramentas avançadas, tour e tema escuro em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/"); await page.getByRole("button", { name: "Abrir exemplo de levantamento" }).click();
  await expect(page.getByTestId("project-studio")).toBeVisible();

  // Menu "Ferramentas avançadas" leva à referência do Tom (etapa Obra, painel aberto).
  await page.getByRole("button", { name: "Ferramentas avançadas" }).click();
  await page.getByRole("menuitem", { name: "Referência comercial do Tom" }).click();
  await expect(page.getByRole("navigation", { name: "Etapas do levantamento" }).getByRole("button", { name: /^Obra/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Carregar orçamento auditado do Tom" })).toBeVisible();

  // Tour: 4 passos, teclado e "Concluir" marcam como visto.
  await page.getByRole("button", { name: /Tour do estúdio/ }).click();
  const tour = page.getByRole("dialog");
  await expect(tour).toContainText("1 de 4");
  for (let i = 0; i < 3; i++) await tour.getByRole("button", { name: "Próximo" }).click();
  await expect(tour).toContainText("4 de 4"); await tour.getByRole("button", { name: "Concluir" }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByRole("button", { name: /Tour do estúdio/ })).not.toContainText("novo");

  // Tema escuro: aplica, persiste após recarregar e não esconde o selo de bloqueio.
  const toggle = page.getByRole("button", { name: "Tema escuro" });
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("fabrication-seal")).toBeVisible();
  await page.getByRole("button", { name: "Tema escuro" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
