import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildingProject } from "../../src/domain/test-support/m41-building-fixture";
import { declareAxes } from "./axes";
import { openResultTab } from "./result-tabs";

/** INT-1e — the gate journey, ONLY through the interface (no page.request, no direct API calls):
 * cadastro (import of the declared structure) -> geometria -> apoios -> cargas -> fachadas/vento NBR 6123 -> combinações NBR 8681
 * -> giros revisados -> análise /3 (PyNite real) -> resistência + avaliação -> norma por peça (NBR 8800) -> relatório.
 * Desktop and phone viewport. Provisional normative sources must stay visible everywhere. */
const src = "Levantamento sintético do ensaio INT-1e";
function registeredProject(name: string) {
  const p = buildingProject(["G", "Q"], ["EAST"]);
  const d = p.workspace.spatialPreparation!;
  d.physicalFacades = undefined; d.engineeringCombinations = undefined;
  d.combinations = [{ id: "COMB-INICIAL", factors: { G: 1, Q: 0 } }];
  d.loading = { version: 1, selfWeight: null, roofArea: [], uniform: [0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => [
    { id: "G-TOP" + i, pieceId: "TOP" + i, caseId: "G", coordinates: "global" as const, knM: [0, 0, -.5] as [number, number, number], source: src, revision: "INT-1e v1" },
    { id: "Q-TOP" + i, pieceId: "TOP" + i, caseId: "Q", coordinates: "global" as const, knM: [0, 0, -.75] as [number, number, number], source: src, revision: "INT-1e v1" }]) };
  d.resistance = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ pieceId: "TOP" + i, family: "welded" as const, fyMpa: 345, fuMpa: 450, bucklingYM: 3, bucklingZM: 3, lateralRestraintM: 3, source: "Cadastro resistente sintético INT-1e", revision: "1",
    sectionProperties: {}, restraintDescription: "Contenção lateral nos nós do anel (ensaio)", normativeReference: "NBR 8800:2024 (ensaio)", profileDesignation: "I soldado sintético",
    geometry: { version: 1 as const, basis: "physical-engineer-declaration" as const, shape: "i" as const, dimensionsMm: { height: 400, width: 200, webThickness: 8, flangeThickness: 16 }, source: "Geometria declarada do ensaio", revision: "1" } }));
  p.name = name; p.client = "Cliente de integração INT-1e";
  return p;
}
const FACADES = [
  { id: "EAST", outward: "+X", plane: "12000", u0: "0", u1: "6000", pieces: "C12000_0,C12000_3000,C12000_6000" },
  { id: "WEST", outward: "-X", plane: "0", u0: "-6000", u1: "0", pieces: "C0_0,C0_3000,C0_6000" },
  { id: "NORTH", outward: "+Y", plane: "6000", u0: "-12000", u1: "0", pieces: "C0_6000,C6000_6000,C12000_6000" },
  { id: "SOUTH", outward: "-Y", plane: "0", u0: "0", u1: "12000", pieces: "C0_0,C6000_0,C12000_0" },
];
async function fill(scope: Locator, label: string, value: string) { await scope.getByLabel(label, { exact: true }).fill(value); }

for (const width of [390, 1440]) test(`jornada completa pela interface: galpão com vento NBR 6123, combinações NBR 8681, /3, resistência NBR 8800 e relatório em ${width}px`, async ({ page }: { page: Page }) => {
  test.setTimeout(420000); page.setDefaultTimeout(15000);
  await page.setViewportSize({ width, height: 950 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // --- cadastro + geometria + apoios (import of the declared structure through the interface)
  const project = registeredProject(`Galpão declarado INT-1e ${width}`);
  await page.goto("/projetos/novo"); await page.getByText("Importar modelo estrutural declarado", { exact: true }).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({ name: "galpao.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page).toHaveURL(/\/projetos\/[a-f0-9-]+\?fluxo=levantamento/);
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  const view = page.getByTestId("declared-line-view").filter({ visible: true }); await expect(view.locator("[data-piece-id]")).toHaveCount(16);
  await openResultTab(page, "Engenharia"); const p = page.getByTestId("mixed-workspace");
  await expect(p.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1", { timeout: 30000 });
  await p.getByRole("button", { name: "Preparação mista", exact: true }).click();
  // --- eixos locais (C1): without reviewed axes nothing runs
  await expect(p.getByTestId("local-axes-pending")).toBeVisible();
  await p.getByRole("button", { name: /Executar análise mista/ }).click();
  await expect(p.getByRole("alert").filter({ hasText: "Giro por peça pendente" })).toBeVisible();
  await declareAxes(p);
  // --- fachadas físicas (editor)
  const panel = p.getByTestId("normative-integration"); const fac = panel.getByTestId("facade-editor");
  for (const f of FACADES) {
    await fill(fac, "Identificador da fachada", f.id); await fac.getByLabel("Orientação externa", { exact: true }).selectOption(f.outward);
    await fill(fac, "Plano da fachada (mm)", f.plane); await fill(fac, "u mínimo (mm)", f.u0); await fill(fac, "u máximo (mm)", f.u1); await fill(fac, "z mínimo (mm)", "0"); await fill(fac, "z máximo (mm)", "4000");
    await fill(fac, "Pilares de apoio (IDs separados por vírgula)", f.pieces);
    await fill(fac, "Fonte da fachada", src); await fill(fac, "Revisão da fachada", "INT-1e v1"); await fill(fac, "Fonte do revestimento", "Inspeção física sintética do revestimento");
    await fac.getByRole("button", { name: "Adicionar fachada", exact: true }).click();
    await expect(fac).toContainText(`${f.id} · ${f.outward}`);
  }
  // --- vento NBR 6123 nas paredes (PROVISÓRIO)
  const wind = panel.getByTestId("wind-nbr6123");
  for (const [label, value] of [["Maior dimensão a (m)", "12"], ["Menor dimensão b (m)", "6"], ["Altura h (m)", "4"], ["V0 (m/s)", "10"], ["S3", "1"],
    ["Fonte de V0 e dos fatores", "Dados sintéticos do ensaio INT-1e"], ["Revisão da velocidade", "INT-1e v1"], ["Responsável técnico pela velocidade", "Responsável de referência"]]) await fill(wind, label, value);
  await wind.getByLabel("Eixo da maior dimensão", { exact: true }).selectOption("X");
  await wind.getByRole("checkbox", { name: /Detalhe I da Tabela 7/ }).check();
  await wind.getByRole("button", { name: "Vento NBR 6123 nas paredes", exact: true }).click();
  await expect(panel.getByTestId("normative-error")).toHaveCount(0);
  await expect(panel.getByTestId("provisional-notices")).toContainText("NBR 6123");
  // --- combinações NBR 8681 (PROVISÓRIAS)
  const gen = panel.getByTestId("nbr8681-generator");
  await gen.getByLabel("Natureza do caso G", { exact: true }).selectOption("permanent");
  await gen.getByLabel("Natureza do caso Q", { exact: true }).selectOption("variable");
  for (const id of ["VENTOPX", "VENTONX", "VENTOPY", "VENTONY"]) await gen.getByLabel(`Natureza do caso ${id}`, { exact: true }).selectOption("wind");
  await gen.getByRole("checkbox", { name: "Família sls-quasi-permanent" }).uncheck(); await gen.getByRole("checkbox", { name: "Família sls-frequent" }).uncheck();
  await gen.getByRole("button", { name: "Gerar combinações NBR 8681", exact: true }).click();
  await expect(panel.getByTestId("normative-error")).toHaveCount(0);
  await expect(panel.getByTestId("provisional-notices")).toContainText("NBR 8681");
  // --- confirmação de duplicidade (ações automáticas + manuais), depois de gerar as combinações (a revisão amarra a configuração atual)
  await p.getByTestId("structural-loads").evaluate(el => { (el as HTMLDetailsElement).open = true; });
  if (await p.getByTestId("self-weight-overlap-review").isVisible()) {
    await p.getByLabel("Fonte da conferência de duplicidade", { exact: true }).fill("Controle sintético: G, Q e vento são ações independentes, conforme declarações do ensaio");
    await p.getByLabel("Revisão da conferência de duplicidade", { exact: true }).fill("Revisão INT-1e v1");
    await p.getByRole("button", { name: "Confirmo que as ações manuais combinadas e as ações por área não repetem as ações automáticas", exact: true }).click();
  }
  // --- análise /3 (PyNite real)
  const response = page.waitForResponse(r => r.url().endsWith("/api/experimental/mixed3d") && r.request().method() === "POST", { timeout: 120000 });
  await p.getByRole("button", { name: /Executar análise mista/ }).first().click();
  const r = await response; expect(r.status(), await r.text()).toBe(200);
  const sent = r.request().postDataJSON(); expect(sent.schema_version).toBe("jpn.mixed3d/3"); expect(sent.local_axes).toBe("jpn-z-up/1");
  expect(sent.combinations.length).toBeGreaterThan(10);
  await expect(p.getByTestId("mixed-results")).toBeVisible({ timeout: 60000 });
  await expect(p.getByTestId("result-provisional-notice").first()).toContainText("PROVISÓRIO");
  // --- resistência + avaliação (visíveis, nunca aprovação)
  await expect(p.getByTestId("resistance-report")).toBeVisible({ timeout: 30000 });
  await expect(p.getByTestId("assessment-panel")).toBeVisible({ timeout: 60000 });
  // --- norma por peça: NBR 8800 nos anéis (a escolha não invalida o resultado) e matriz
  const standards = p.getByTestId("member-standards");
  for (let i = 0; i < 8; i++) await standards.getByLabel(`Norma da peça TOP${i}`, { exact: true }).selectOption("NBR8800");
  await expect(p.getByTestId("mixed-results")).toBeVisible();   // selecting the standard does not invalidate the analysis
  await p.getByTestId("member-standards").getByRole("button", { name: "Verificar peças NBR 8800 (matriz ELU)", exact: true }).click();
  const matrix = p.getByTestId("steel-matrix"); await expect(matrix).toBeVisible({ timeout: 120000 });
  await expect(matrix).toContainText("NBR8800"); await expect(matrix).toContainText("Não é aprovação estrutural");
  // --- relatório
  const wait = page.waitForEvent("download"); await p.getByRole("button", { name: "Exportar relatório resistente preliminar", exact: true }).click();
  const report = JSON.parse(await readFile((await (await wait).path())!, "utf8"));
  expect(report.computedStructuralApproval).toBe(false); expect(report.approvedForFabrication).toBe(false);
  expect(report.normativeStatus).toBe("PROVISIONAL"); expect(report.normativeNotices.join(" ")).toMatch(/NBR 6123[\s\S]*NBR 8681|NBR 8681[\s\S]*NBR 6123/);
  expect(errors).toEqual([]);
});
