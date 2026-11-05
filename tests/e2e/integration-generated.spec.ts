import {expect,test} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {openEngineeringTool,openResultTab} from "./result-tabs";

test("backup de projeto gerado -> cópia salva -> solver real sem substituir por exemplo",async({page})=>{
  test.setTimeout(90000);
  const backup=JSON.parse(await readFile("validation/m34ab/legacy-backup.json","utf8"));
  const source=backup.data.projects[0];source.name="Minha cobertura gerada restaurada";source.isExample=false;
  const golden=JSON.parse(await readFile("validation/m34ab/legacy-golden.json","utf8"));
  await page.goto("/configuracoes");
  await page.getByLabel("Selecionar backup JSON").setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByText("Backup válido para importação",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Adicionar cópias",exact:true}).click();
  await page.goto("/projetos");await page.getByRole("link",{name:source.name,exact:true}).click();
  const ownerId=new URL(page.url()).pathname.split("/").at(-1)!;expect(ownerId).not.toBe(source.id);
  await page.getByRole("button",{name:/^4\s*Resultado$/}).click();
  await openEngineeringTool(page,"Análise Estrutural Experimental");const panel=page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-scope")).toContainText("OBRA ATUAL");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:25000});
  const response=page.waitForResponse(r=>r.url().endsWith("/api/experimental/mixed3d")&&r.request().method()==="POST");
  await panel.getByRole("button",{name:"Executar análise mista local",exact:true}).click();
  const r=await response;expect(r.status()).toBe(200);const input=r.request().postDataJSON(),out=await r.json();
  expect(input.project.id).toBe(ownerId);expect(input.nodes).toEqual(golden.request.nodes);expect(input.members).toEqual(golden.request.members);
  for(const [combo,result] of Object.entries(golden.result.combinations) as [string,{nodes:Record<string,{translation_m:number[]}>}][]){
    for(const [node,value] of Object.entries(result.nodes)) value.translation_m.forEach((displacement,i)=>expect(out.result.combinations[combo].nodes[node].translation_m[i]).toBeCloseTo(displacement,10));
  }
  await expect(panel.getByTestId("mixed-result-state")).toContainText("Resultado calculado");
  await openResultTab(page,"Materiais");await expect(page.getByTestId("preproduction-dossier")).toContainText("NÃO LIBERADO");
  await openResultTab(page,"Arquivos");const wait=page.waitForEvent("download");await page.getByRole("button",{name:"Baixar desenho em DXF",exact:true}).click();
  expect((await wait).suggestedFilename()).toMatch(/\.dxf$/);
});
