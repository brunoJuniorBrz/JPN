import { expect, type Locator } from "@playwright/test";

/** C1/INT-1a: declare the reviewed roll (Z-up system) of every frame piece through the UI panel "Eixos locais".
 * The same explicit step a user performs; nothing is defaulted by the application. */
export async function declareAxes(workspace: Locator, roll = "0") {
  const panel = workspace.getByTestId("local-axes-panel");
  if (!(await panel.getByTestId("local-axes-pending").isVisible().catch(() => false))) return;   // nothing pending: nothing to declare
  await panel.getByLabel("Giro comum a todas as peças (graus)", { exact: true }).fill(roll);
  await panel.getByRole("button", { name: "Aplicar a todas as peças", exact: true }).click();
  await panel.getByLabel("Fonte da revisão dos giros", { exact: true }).fill("Giro revisado pelo ensaio: Iy resiste ao plano vertical da barra");
  await panel.getByLabel("Revisão", { exact: true }).fill("Ensaio E2E INT-1d");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Registrar giros revisados", exact: true }).click();
  await expect(panel.getByTestId("local-axes-pending")).toBeHidden();
}
