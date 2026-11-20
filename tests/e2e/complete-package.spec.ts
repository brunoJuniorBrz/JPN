import { openProjectStudio } from "./open-project-studio";
import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {openResultTab} from "./result-tabs";
import {m49GarageProject} from "../../src/domain/test-support/m49-garage-project";

test("exports native interface project as ZIP and individual sheet PDF; edits invalidate prior exports",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await openProjectStudio(page, "Abrir exemplo de levantamento");
  await openResultTab(page,"Arquivos");
  const control=page.getByTestId("complete-package-control");
  const waiting=page.waitForEvent("download");await control.getByRole("button",{name:"Exportar pacote completo",exact:true}).click();
  const download=await waiting;expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const data=await readFile((await download.path())!);expect(data.subarray(0,2).toString()).toBe("PK");
  await download.saveAs("test-results/package-ui.zip");
  await expect(control.getByRole("button",{name:"pranchas/pranchas.pdf",exact:true})).toBeVisible();
  const pdfWaiting=page.waitForEvent("download");await control.getByRole("button",{name:"pranchas/pranchas.pdf",exact:true}).click();
  expect((await readFile((await (await pdfWaiting).path())!)).subarray(0,5).toString()).toBe("%PDF-");
  await control.getByLabel("Formato das pranchas").selectOption("A1");
  await expect(control.getByRole("button",{name:"pranchas/pranchas.pdf",exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("exports a native irregular declared roof with explicitly entered stock lengths",async({page})=>{
  test.setTimeout(90000);
  const p=m49GarageProject();p.name="Cobertura trapezoidal - interface";
  p.workspace.physicalStructure!.nodes.forEach(n=>{n.x*=1+n.y/20000;});
  p.workspace.spatialPreparation!.physicalCatalog!.sections.forEach(s=>{s.designation=`Seção sintética ${s.id}`;});
  p.workspace.cutting={kerfMm:3,endTrimMm:10,minimumRemnantMm:300,useFabrication:false};
  await page.goto("/projetos/novo");
  await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({name:"cobertura-nativa.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(p))});
  await expect(page).toHaveURL(/fluxo=levantamento/);await openResultTab(page,"Arquivos");
  const control=page.getByTestId("complete-package-control");
  await control.getByText("Dados para o plano de corte",{exact:true}).click();
  // Native model import deliberately resets fabrication/cutting declarations.
  await control.getByLabel("Serra (mm)",{exact:true}).fill("3");
  await control.getByLabel("Perda por extremidade (mm)",{exact:true}).fill("10");
  await control.getByLabel("Sobra reaproveitável mínima (mm)",{exact:true}).fill("300");
  const stock=control.getByRole("spinbutton",{name:/Barra comercial/});
  // NumberField uses a text input with inputmode decimal in the current interface.
  const inputs=(await stock.count())?stock:control.getByLabel(/Barra comercial/);
  for(let i=0;i<await inputs.count();i++)await inputs.nth(i).fill("12000");
  expect(await inputs.count()).toBeGreaterThan(0);
  const waiting=page.waitForEvent("download");await control.getByRole("button",{name:"Exportar pacote completo",exact:true}).click();
  const download=await waiting;await download.saveAs("test-results/package-ui-irregular.zip");
  await expect(control.getByRole("button",{name:"corte/plano.csv",exact:true})).toBeVisible();
});
