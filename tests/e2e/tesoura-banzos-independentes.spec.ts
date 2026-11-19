import { test, expect } from "@playwright/test";

test("banzo inferior pode ter perfil próprio em muro, pilar e tipo de tesoura", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tesoura");
  await page.getByRole("button", { name: "Exemplo 8×10" }).click();
  const same = page.getByRole("checkbox", { name: /Banzo inferior com o mesmo perfil do superior/ });
  await expect(same).toBeChecked();
  for (const support of ["walls", "columns"]) {
    await page.getByLabel("Apoio da tesoura").selectOption(support);
    await same.uncheck();
    const lower = page.getByLabel("Banzo inferior: escolher");
    await expect(lower).toBeVisible();
    await lower.selectOption("U 75x40x2.65 mm");
    const summary = page.getByRole("region", { name: "Resumo" });
    await expect(summary).toContainText("Banzo inferior U 75x40x2.65 mm");
    await expect(summary).toContainText("Banzo superior U 100x40x2.65 mm");
    await same.check();
    await expect(lower).toHaveCount(0);
  }
  await page.getByRole("button", { name: /Novo tipo/ }).click();
  await expect(same).toBeChecked();
  await same.uncheck();
  await page.getByLabel("Banzo inferior: escolher").selectOption("U 75x40x2.65 mm");
  await page.getByLabel("Desenhando").selectOption("T1");
  await expect(same).toBeChecked();
  await page.getByLabel("Desenhando").selectOption("T2");
  await expect(same).not.toBeChecked();
  await expect(page.getByLabel("Banzo inferior: escolher")).toHaveValue("U 75x40x2.65 mm");
  expect(errors).toEqual([]);
});
