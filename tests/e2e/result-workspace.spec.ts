import { expect, test } from "@playwright/test";
import { openResultTab } from "./result-tabs";

for (const width of [375, 1440]) test(`resultado organizado preserva modelo, avisos, materiais e dados em ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:950});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/projetos/novo");
  await page.getByLabel("Largura (m)").fill("12");
  await page.getByLabel("Comprimento (m)").fill("35");
  await page.getByLabel("Altura (m)").fill("5");
  await page.getByRole("button",{name:"Gerar modelo 3D"}).click();
  const canvas=page.getByRole("img",{name:"Modelo 3D da estrutura"});
  await expect(canvas).toBeVisible();
  const before=await page.evaluate(()=>localStorage.getItem("jpn-projetos:v1"));
  const totals=await page.getByTestId("takeoff-totals").innerText();
  await expect(page.getByTestId("result-safety-warning")).toContainText("Não usar para comprar, cortar ou fabricar");
  await expect(page.getByTestId("takeoff-totals").locator("strong")).toHaveCount(3);
  await page.evaluate(()=>{
    (window as Window & {__resultCanvas?:Element}).__resultCanvas=document.querySelector('canvas[aria-label="Modelo 3D da estrutura"]')??undefined;
  });
  await openResultTab(page,"Materiais");
  await expect(canvas).toBeHidden();
  expect(await canvas.count()).toBe(1);
  await expect(page.getByRole("heading",{name:"Quantitativos por perfil"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Lista de materiais"})).toBeVisible();
  await expect(page.getByText("Simular aproveitamento de barras")).toBeVisible();
  const rows=page.locator(".result-materials-table tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  await rows.first().locator("details").first().locator("summary").click();
  await expect(rows.first().locator("details").first()).toHaveAttribute("open","");
  await openResultTab(page,"Engenharia");
  await expect(page.getByRole("heading",{name:"Pendências da revisão técnica"})).toBeVisible();
  await expect(page.getByRole("tab",{name:/^Engenharia/})).toContainText("pendências");
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  await page.getByLabel("Ferramenta de engenharia").selectOption({label:"Preparar análise"});
  await expect(page.getByTestId("physical-prep-status")).toBeVisible();
  await openResultTab(page,"Arquivos");
  await expect(page.getByRole("heading",{name:"Arquivos preliminares"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Baixar lista em PDF"})).toBeVisible();
  await expect(page.getByTestId("result-safety-warning")).toBeVisible();
  await openResultTab(page,"Modelo 3D");
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('canvas[aria-label="Modelo 3D da estrutura"]')===
    (window as Window & {__resultCanvas?:Element}).__resultCanvas)).toBe(true);
  expect(await page.getByTestId("takeoff-totals").innerText()).toBe(totals);
  expect(await page.evaluate(()=>localStorage.getItem("jpn-projetos:v1"))).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
