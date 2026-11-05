import { openEngineeringTool } from "./result-tabs";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for(const width of [375,1440]) test(`vento zonal, combinações e Python real em ${width}px`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:950});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/projetos/novo");await page.getByLabel("Largura (m)").fill("10");await page.getByLabel("Comprimento (m)").fill("20");await page.getByLabel("Altura (m)").fill("4");
  await page.getByRole("button",{name:"Gerar modelo 3D"}).click();await openEngineeringTool(page, "Análise Estrutural Experimental");
  const p=page.getByTestId("mixed-workspace");await p.getByRole("button",{name:"Abrir exemplo de vento zonal",exact:true}).click();
  await expect(p.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:60000});
  await p.getByTestId("structural-loads").locator(":scope > summary").click();const wind=p.getByTestId("wind-engineering");await wind.locator(":scope > summary").click();
  await expect(wind.getByTestId("wind-load-trace")).toContainText("2 casos de vento");
  await p.getByRole("button",{name:"Executar análise mista local",exact:true}).click();
  await expect(p.getByTestId("wind-result-trace")).toContainText("validação normativa pendente",{timeout:30000});
  await p.getByLabel("Combinação mista").selectOption("WS");
  const download=page.waitForEvent("download");await p.getByRole("button",{name:"Exportar resultados mistos",exact:true}).click();
  const file=await download,out=JSON.parse(await readFile((await file.path())!,"utf8"));
  expect(out.prepared.wind_load_path.cases).toHaveLength(2);expect(out.prepared.engineering_combinations.approved).toBe(false);
  expect(out.result.input_sha256).toBe(out.prepared.input_sha256);expect(out.prepared.request.members).toHaveLength(243);
  for(const [id,expected] of [["WP",50000],["WS",-50000],["DOUBLE",100000],["SUM",70000]] as const){
    const reaction=Object.values(out.result.combinations[id].nodes).reduce((s:number,n:unknown)=>s+(n as {reaction_force_n:number[]}).reaction_force_n[2],0);
    expect(reaction).toBeCloseTo(expected,4);
  }
  await p.getByRole("button",{name:"Preparação mista",exact:true}).click();await p.getByTestId("structural-loads").locator(":scope > summary").click();await wind.locator(":scope > summary").click();
  await wind.getByRole("button",{name:"Editar declarações de vento atuais",exact:true}).click();
  const editor=wind.getByLabel("Declarações de vento e combinações (JSON)");const pack=JSON.parse(await editor.inputValue());
  pack.wind.cases[0].dynamicPressurePa=600;await editor.fill(JSON.stringify(pack));
  await wind.getByRole("button",{name:"Registrar vento e substituir combinações declaradas",exact:true}).click();await expect(wind.getByRole("status")).toContainText("invalidados");
  await p.getByRole("button",{name:"Resultados 3D",exact:true}).click();await expect(p.getByTestId("mixed-no-results")).toBeVisible();
  // The automatic-action independence review was invalidated and must block.
  await p.getByRole("button",{name:"Executar análise mista local",exact:true}).click();await expect(p.getByRole("alert")).toContainText("POSSIBLE_DOUBLE_COUNT");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
