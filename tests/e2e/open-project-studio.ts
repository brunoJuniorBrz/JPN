import { expect, type Page } from "@playwright/test";

type StudioEntry = "Gerar modelo 3D" | "Abrir exemplo de levantamento" | "Abrir exemplo completo de pré-projeto";

export async function openProjectStudio(page: Page, button: StudioEntry) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.waitForURL(url =>
    /^\/projetos\/[a-f0-9-]{36}$/.test(url.pathname) &&
    url.searchParams.get("fluxo") === "levantamento" &&
    url.searchParams.get("etapa") === "3" &&
    url.searchParams.get("vista") === "3d",
    { timeout: 45_000 },
  );
  await expect(page.getByRole("navigation", { name: "Etapas do levantamento" })).toBeVisible({ timeout: 30_000 });
}
