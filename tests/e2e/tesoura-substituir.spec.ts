import { test, expect } from "@playwright/test";

test("obra completa com pilares: Aplicar na Tesoura pede confirmação antes de substituir a estrutura", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Abrir exemplo de levantamento/ }).click();
  await expect(page).toHaveURL(/\/projetos\/[^/]+\?/, { timeout: 30000 });
  const nav = page.getByRole("navigation", { name: "Etapas do levantamento" });
  await nav.getByRole("button", { name: /Tesoura/ }).click();
  const apply = page.getByRole("button", { name: /Aplicar na obra e atualizar o 3D/ });
  await apply.scrollIntoViewIfNeeded();
  await apply.click();
  const warning = page.getByTestId("truss-replace-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Pilares:");
  await expect(warning).toContainText("Terças:");
  // Cancelar não muda nada.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(warning).toBeHidden();
  await expect(page.getByRole("button", { name: /Aplicar na obra e atualizar o 3D/ })).toBeVisible();
  // Confirmando, aplica; depois disso a obra já é do editor e não avisa de novo.
  await page.getByRole("button", { name: /Aplicar na obra e atualizar o 3D/ }).click();
  await page.getByRole("button", { name: "Substituir mesmo assim" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aplicado." })).toBeVisible();
  await page.getByRole("button", { name: /Aplicar na obra e atualizar o 3D/ }).click();
  await expect(page.getByTestId("truss-replace-warning")).toBeHidden();
  expect(errors).toEqual([]);
});
