import { expect, test } from "@playwright/test";
import { emptySnapshot, newProject } from "../../src/domain/models";
import { exampleMaterials, exampleProject, EXAMPLE_ID } from "../../src/domain/example";
import { planningExample, PLANNING_EXAMPLE_ID } from "../../src/domain/planning-example";
import { preprojectExample, PREPROJECT_EXAMPLE_ID } from "../../src/domain/preproject-example";
import { SHOWCASE_IDS } from "../../src/domain/showcase-projects";

for (const width of [375, 1440]) test(`demonstrações 3D com orçamento completo em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  for (const [kind, button, id] of [
    ["cobertura", "Abrir exemplo de levantamento", SHOWCASE_IDS.cobertura],
    ["galpao", "Abrir exemplo completo de pré-projeto", SHOWCASE_IDS.galpao],
  ] as const) {
    await page.getByRole("button", { name: button }).click();
    await expect(page).toHaveURL(new RegExp(`/projetos/${id}.*vista=3d`));
    const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-mode", "profiles");
    await expect(canvas).toHaveAttribute("data-framing", "whole-structure");
    await expect(canvas).toHaveAttribute("data-fallback-count", "0");
    expect(Number(await canvas.getAttribute("data-solid-count"))).toBeGreaterThan(100);
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
    const demo = snapshot.projects.find((p: { id: string }) => p.id === id);
    expect(demo.isExample).toBe(true);
    expect(demo.estimate.materials.filter((m: { source: string }) => m.source === "takeoff")).toHaveLength(5);
    await page.getByRole("button", { name: "Orçamento de venda", exact: true }).click();
    await page.getByRole("navigation", { name: "Etapas do projeto" }).getByRole("button", { name: "Resumo" }).click();
    await expect(page.getByTestId("sale-price")).not.toContainText("Complete");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/");
    // Clicking the same built-in example again must not accumulate duplicates.
    await page.getByRole("button", { name: button }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
    expect(stored.projects.filter((p: { id: string }) => p.id === id)).toHaveLength(1);
    await page.goto("/");
  }
});

test("remove exemplos antigos do navegador, preservando projetos reais e cópias", async ({ page }) => {
  const real = { ...newProject(), name: "Obra real", client: "Cliente real" };
  const old = [exampleProject(), planningExample(), preprojectExample()];
  const duplicate = { ...exampleProject(), id: crypto.randomUUID(), name: "Cópia preservada do exemplo" };
  await page.addInitScript(value => localStorage.setItem("jpn-projetos:v1", JSON.stringify(value)), {
    ...emptySnapshot(), exampleInstalled: true, projects: [...old, real, duplicate], materials: exampleMaterials(),
  });
  await page.goto("/");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
  expect(stored.projects.some((p: { id: string }) => p.id === EXAMPLE_ID || p.id === PLANNING_EXAMPLE_ID || p.id === PREPROJECT_EXAMPLE_ID)).toBe(false);
  expect(stored.projects.some((p: { id: string }) => p.id === real.id)).toBe(true);
  expect(stored.projects.some((p: { id: string }) => p.id === duplicate.id)).toBe(true);
  expect(stored.materials).toHaveLength(3); // Materiais referenciados por cópia preservada.
  await page.reload();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("jpn-projetos:v1")!));
  expect(after.projects).toHaveLength(2);
});
