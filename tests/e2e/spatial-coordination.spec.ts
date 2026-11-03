import { openEngineeringTool, openResultTab } from "./result-tabs";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const width of [375, 1440]) {
  test(`roteiro estrutural conecta preparação e análise sem cálculo falso em ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:950});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/projetos/novo");
    await page.getByLabel("Largura (m)").fill("10");
    await page.getByLabel("Comprimento (m)").fill("20");
    await page.getByLabel("Altura (m)").fill("4");
    await page.getByRole("button",{name:"Gerar modelo 3D"}).click();
    await expect(page.getByRole("img",{name:"Modelo 3D da estrutura"})).toBeVisible();
    const before=await page.getByTestId("takeoff-totals").innerText();
    await openEngineeringTool(page, "Roteiro estrutural");
    const status=page.getByTestId("coordination-status");
    await expect(status).toContainText("análise da obra ainda bloqueada");
    await expect(status).toContainText("207 peças");
    await expect(page.getByTestId("coordination-stages").locator(".spatial-overview-step")).toHaveCount(6);
    const downloadPromise=page.waitForEvent("download");
    await page.getByRole("button",{name:"Exportar pacote técnico para revisão"}).click();
    const download=await downloadPromise;
    const payload=JSON.parse(readFileSync(await download.path(),"utf8"));
    expect(payload.schema_version).toBe("jpn.spatial-handoff/1");
    expect(payload.analysis_ready).toBe(false);
    expect(payload.approved_for_fabrication).toBe(false);
    expect(payload.geometry.members).toHaveLength(207);
    expect(payload.geometry.nodes.length).toBeGreaterThan(100);
    expect(payload.preparation.groups.column.eGpa).toBeNull();
    expect(payload.review.detected_contacts.length).toBeGreaterThan(0);
    await page.locator(".spatial-overview-step").filter({hasText:"Materiais e seções"}).getByRole("button",{name:"Abrir esta etapa"}).click();
    await expect(page.getByLabel("Classe do aço")).toBeVisible();
    await page.getByLabel("Classe do aço").fill("Declaração para conferência");
    await page.getByRole("button",{name:"4. Conferência"}).click();
    await page.getByRole("button",{name:"Consultar análise 3D experimental"}).click();
    await expect(page.getByTestId("spatial-analysis-link")).toContainText("Restam");
    await page.getByRole("button",{name:"Conferir preparação e pendências"}).click();
    await expect(page.getByRole("heading",{name:"Pendências para análise estrutural"})).toBeVisible();
    expect(await page.getByTestId("takeoff-totals").innerText()).toBe(before);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("roteiro detecta preparação obsoleta depois de alterar geometria e preserva declaração",async({page})=>{
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("8");
  await page.getByLabel("Comprimento (m)").fill("12");
  await page.getByLabel("Altura (m)").fill("3");
  await page.getByRole("button",{name:"Gerar modelo 3D"}).click();
  await openEngineeringTool(page, "Preparar análise");
  await page.getByLabel("Classe do aço").fill("Aço declarado, não aprovado");
  await page.getByRole("navigation",{name:"Etapas do levantamento"}).getByRole("button",{name:/Estrutura/}).click();
  await page.getByLabel("Espaçamento máximo entre tesouras (m)").fill("3");
  await page.getByRole("navigation",{name:"Etapas do levantamento"}).getByRole("button",{name:/Resultado/}).click();
  await openEngineeringTool(page, "Roteiro estrutural");
  await expect(page.getByTestId("coordination-status")).toContainText("Geometria alterada");
  await page.locator(".spatial-overview-step").filter({hasText:"Geometria e revisão"}).getByRole("button",{name:"Revisar geometria"}).click();
  await expect(page.getByLabel("Espaçamento máximo entre tesouras (m)")).toHaveValue("3");
});
