import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { buildingProject } from "../../src/domain/test-support/m41-building-fixture";
import { declareAxes } from "./axes";
import { openResultTab } from "./result-tabs";
import {secondOrderResistanceProject} from "../../src/domain/test-support/second-order-resistance-project";

test("same declared I member: amplified second-order demands reach the NBR8800 matrix",async({page})=>{
  test.setTimeout(120000);
  const project=secondOrderResistanceProject(true);
  await page.goto("/projetos/novo");
  await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({name:"column.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await openResultTab(page,"Engenharia");
  const panel=page.getByTestId("mixed-workspace"),utilizations:number[]=[];
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:25000});
  for(const order of ["linear","second-order"]){
    await panel.getByLabel("Ordem da análise",{exact:true}).selectOption(order);
    await panel.getByRole("button",{name:"Executar análise mista local",exact:true}).click();
    await expect(panel.getByTestId("mixed-results")).toBeVisible({timeout:30000});
    await panel.getByRole("button",{name:"Verificar peças NBR 8800 (matriz ELU)",exact:true}).click();
    await expect(panel.getByTestId("steel-matrix")).toBeVisible({timeout:20000});
    utilizations.push(Number(await panel.getByTestId("steel-matrix").locator("tbody tr").first().locator("td").nth(4).innerText()));
    if(order==="second-order")await expect(panel.getByTestId("steel-matrix")).toContainText("SECOND_ORDER_CONTINUOUS_EXTREMA_PENDING");
  }
  expect(utilizations[1]).toBeGreaterThan(1.1*utilizations[0]);
});

for (const width of [390, 1440]) test(`galpão real em segunda ordem pela tela e fila em ${width}px`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 950 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const project = buildingProject(["G"], ["EAST"]), d = project.workspace.spatialPreparation!;
  d.physicalFacades = undefined;
  project.name = `Galpão sintético de segunda ordem ${width}`;
  d.engineeringCombinations = undefined;
  d.combinations = [{ id: "ELS-G", factors: { G: 1 } }];
  d.loads = [];
  d.loading = { version: 1, selfWeight: null, roofArea: [], uniform: [{ id: "G-TOP", pieceId: "TOP0", caseId: "G", coordinates: "global", knM: [0, 0, -.01], source: "Ensaio mecânico sintético; não normativo", revision: "1" }] };
  // The calculation uses the REAL local HTTP/Python worker. Only the durable
  // queue storage is simulated locally; receipt/result hashes are checked by the browser.
  let payload: Record<string, unknown> = {}, result: Record<string, unknown> = {}, sha = "";
  let reply: unknown;
  await page.route("**/api/experimental/jobs/ui-second-order**", route => route.fulfill({ json: route.request().url().includes("result=1") ? reply : { status: "ready", request_sha256: sha, result_url: "/api/experimental/jobs/ui-second-order?result=1" }, headers: { "X-JPN-Request-Sha256": sha } }));
  await page.route("**/api/experimental/mixed3d", async route => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().headers().prefer).toBe("respond-async");
    payload = route.request().postDataJSON();
    const actual = await route.fetch();
    reply = await actual.json();
    expect(actual.status(), JSON.stringify(reply)).toBe(200);
    result = (reply as { result: Record<string, unknown> }).result;
    sha = createHash("sha256").update(route.request().postData()!).digest("hex");
    await route.fulfill({ status: 202, json: { job: "ui-second-order", request_sha256: sha, status_url: "/api/experimental/jobs/ui-second-order" }, headers: { "Retry-After": "1" } });
  });
  await page.goto("/projetos/novo");
  await page.getByText("Importar modelo estrutural declarado", { exact: true }).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({ name: "galpao.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await openResultTab(page, "Engenharia");
  const panel = page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1", { timeout: 25000 });
  await declareAxes(panel);
  await panel.getByLabel("Ordem da análise", { exact: true }).selectOption("second-order");
  await panel.getByRole("button", { name: "Executar análise mista local", exact: true }).click();
  await expect(panel.getByTestId("mixed-results")).toBeVisible({ timeout: 30000 });
  expect(payload).toMatchObject({ analysis_order: "second-order", solution_mode: "per-combination" });
  expect(result).toMatchObject({ analysis_order: "second-order", computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED" });
  await expect(panel.getByTestId("analysis-order-result")).toContainText("ELS-G");
  await expect(panel.getByTestId("analysis-order-result")).toContainText("amplificação");
  await expect(panel.getByTestId("sway-normative-pending")).toContainText("pendentes");
  await panel.getByTestId("studio-layer-kind").selectOption("deformed-shape");
  await expect(panel.getByTestId("studio-layer-legend")).toContainText("corotational-newton");
  for (const kind of ["bending-moment", "reaction"]) {
    await panel.getByTestId("studio-layer-kind").selectOption(kind);
    await expect(panel.getByTestId("studio-layer-legend")).toContainText("ELS-G");
  }
  await expect(panel.getByTestId("assessment-blocked")).toContainText("SECOND_ORDER_RESTRAINT_ACTIONS_REQUIRED");
  // Reopening restores only after rebuilding the current input and checking its hash.
  await page.reload();
  await openResultTab(page, "Engenharia");
  await expect(panel.getByTestId("mixed-result-state")).toContainText("Resultado restaurado");
  await expect(panel.getByLabel("Ordem da análise", { exact: true })).toHaveValue("second-order");
  await expect(panel.getByTestId("analysis-order-result")).toContainText("ELS-G");
  await panel.getByLabel("Ordem da análise", { exact: true }).selectOption("linear");
  await expect(panel.getByTestId("mixed-no-results")).toBeVisible();
  await panel.getByLabel("Ordem da análise", { exact: true }).selectOption("second-order");
  await page.unroute("**/api/experimental/mixed3d");
  for (const code of ["SECOND_ORDER_MESH_NOT_CONVERGED", "SECOND_ORDER_NOT_CONVERGED", "SECOND_ORDER_BEYOND_CRITICAL"]) {
    await page.route("**/api/experimental/mixed3d", route => route.request().method() === "POST"
      ? route.fulfill({ status: 422, json: { error: { code, combination_id: "ELS-G", message: "Recusa sintética do teste de interface" }, result } })
      : route.continue());
    await panel.getByRole("button", { name: "Executar análise mista local", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText(code);
    await expect(panel.getByRole("alert")).toContainText("ELS-G");
    await expect(panel.getByTestId("mixed-results")).toHaveCount(0);
    await page.unroute("**/api/experimental/mixed3d");
  }
  await page.evaluate(() => {
    const key="jpn-projetos:v1",snapshot=JSON.parse(localStorage.getItem(key)!);
    snapshot.projects.at(-1).workspace.spatialPreparation.loading.uniform[0].knM[2]=-.02;
    localStorage.setItem(key,JSON.stringify(snapshot));
  });
  await page.reload();await openResultTab(page,"Engenharia");
  await expect(panel.getByTestId("analysis-cache-notice")).toContainText("STALE_ANALYSIS");
  await expect(panel.getByTestId("mixed-results")).toHaveCount(0);
  expect(errors).toEqual([]);
});
