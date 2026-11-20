import { test, expect } from "@playwright/test";

// TESTE OBRIGATÓRIO 3 (docs/CRITERIOS-DE-APROVACAO.md): fluxo normal simples, sem dados de engenharia.
test("obra mista em poucos cliques: muro até a tesoura 1, pilares no resto, orçamento sem engenharia", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tesoura");
  await page.getByRole("button", { name: "Exemplo 8×10" }).click();
  const card = page.getByTestId("truss-supports"), summary = page.getByRole("region", { name: "Resumo" });
  // Fluxo do dia a dia: nenhuma pergunta de engenharia aparece aberta.
  await expect(card.getByTestId("truss-supports-advanced")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("truss-wall-review")).toBeHidden();
  await expect(summary).not.toContainText("Pilares");
  await page.getByTestId("truss-support-mode").selectOption("mixed");
  await page.getByTestId("truss-side-mode-right").selectOption("range");
  const side = page.getByTestId("truss-side-right");
  await side.getByLabel("até a tesoura").fill("1");
  await side.getByLabel("até a tesoura").blur();
  await expect(page.getByTestId("truss-supports-summary")).toContainText("4 ponta(s) em muro · 2 em pilar");
  await expect(summary).toContainText("2 pilares");
  await expect(summary).toContainText("Chapa de base");
  await expect(summary).toContainText("Chapa de ancoragem");
  // Criar o projeto funciona sem nenhuma informação de engenharia.
  await expect(page.getByRole("button", { name: "Criar projeto com esta tesoura" })).toBeEnabled();
  await card.screenshot({ path: "test-results/apoios-simples.png" });
  // Voltar para "tudo sobre muros" em um clique.
  await page.getByTestId("truss-support-mode").selectOption("walls");
  await expect(summary).not.toContainText("Pilares");
  expect(errors).toEqual([]);
});
