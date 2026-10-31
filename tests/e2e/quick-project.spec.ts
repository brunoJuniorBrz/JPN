import { expect, test } from "@playwright/test";

for (const width of [375, 1440]) {
  test(`criação rápida abre perfis sólidos 3D e permite refinar o projeto em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/projetos/novo");
    await expect(page.getByRole("heading", { name: "Seu projeto em 3D, sem burocracia" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar modelo 3D" })).toBeDisabled();
    await page.getByLabel("Largura (m)").fill("10");
    await page.getByLabel("Comprimento (m)").fill("20");
    await page.getByLabel("Altura (m)").fill("4");
    await page.getByRole("button", { name: "Gerar modelo 3D" }).click();
    await expect(page).toHaveURL(/fluxo=levantamento&etapa=3&vista=3d/);
    const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-mode", "profiles");
    await expect(canvas).toHaveAttribute("data-fallback-count", "0");
    await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
    expect(Number(await canvas.getAttribute("data-solid-count"))).toBeGreaterThan(100);
    const original = await page.getByTestId("takeoff-totals").innerText();
    expect(original).toContain("Peças geradas");
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
    const project = snapshot.projects.at(-1);
    expect(project.isExample).toBe(false);
    expect(project.estimate.materials).toEqual([]);
    expect(project.planning.profiles.column.data.areaCm2).toBeNull();
    expect(project.planning.profiles.column.pricePerMeterCents).toBeNull();
    expect(project.planning.profiles.column.visualSection.family).toBe("i");
    await page.getByLabel("Selecionar peça no desenho").selectOption("P1");
    await expect(page.getByRole("button", { name: "Editar perfil deste grupo" })).toBeVisible();
    await page.getByRole("button", { name: "Editar perfil deste grupo" }).click();
    await expect(page.getByRole("heading", { name: "Como distribuir a estrutura?" })).toBeVisible();
    await expect(page.getByText(/Pilares · VISUAL PROVISÓRIO/)).toBeVisible();
    await page.getByLabel("Espaçamento máximo entre tesouras (m)").fill("3");
    await page.getByRole("button", { name: "Abrir modelo 3D" }).click();
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-mode", "profiles");
    await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
    await expect(page.getByTestId("takeoff-totals")).not.toHaveText(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByTestId("takeoff-totals")).not.toHaveText(original);
    await expect(canvas).toHaveAttribute("data-mode", "profiles");
    expect(errors).toEqual([]);
  });
}

test("mantém formulário técnico completo acessível para quem prefere preencher tudo", async ({ page }) => {
  await page.goto("/projetos/novo");
  await page.getByRole("button", { name: "Usar cadastro completo" }).click();
  await expect(page.getByLabel("Nome do projeto *")).toBeVisible();
  await page.getByRole("button", { name: "Voltar à entrada rápida" }).click();
  await expect(page.getByRole("button", { name: "Gerar modelo 3D" })).toBeVisible();
});

test("sincroniza linhas vinculadas ao levantamento ao editar geometria, sem alterar materiais manuais", async ({ page }) => {
  await page.goto("/projetos/novo");
  await page.getByLabel("Formato da cobertura").selectOption("mono");
  await page.getByLabel("Largura (m)").fill("8");
  await page.getByLabel("Comprimento (m)").fill("12");
  await page.getByLabel("Altura (m)").fill("3");
  await page.getByRole("button", { name: "Gerar modelo 3D" }).click();
  await expect(page.getByTestId("takeoff-totals")).toBeVisible();
  await page.getByRole("button", { name: "Atualizar quantitativos no orçamento" }).click();
  const before = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
    const project = data.projects.at(-1);
    return project.estimate.materials.filter((line: { source: string }) => line.source === "takeoff").find((line: { quantityOrigin: { role: string } }) => line.quantityOrigin.role === "purlin").manualQuantity;
  });
  await page.getByRole("button", { name: "Editar distribuição e espaçamentos" }).click();
  await page.getByLabel("Espaçamento máximo entre tesouras (m)").fill("2");
  await page.getByRole("button", { name: "Salvar levantamento" }).count(); // keep UI responsive
  await page.getByRole("button", { name: "Abrir modelo 3D" }).click();
  await expect(page.getByTestId("takeoff-totals")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
    const project = data.projects.at(-1);
    return project.estimate.materials.filter((line: { source: string }) => line.source === "takeoff").find((line: { quantityOrigin: { role: string } }) => line.quantityOrigin.role === "purlin").manualQuantity;
  })).not.toBe(before);
});
