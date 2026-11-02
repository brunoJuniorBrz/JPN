import { expect,test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for(const width of [390,1440]){
  test(`dossiê M25 continua preliminar e exporta PDF/Excel em ${width}px`,async({page})=>{
    test.setTimeout(120000);
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.setViewportSize({width,height:900});
    await page.goto("/projetos/novo");
    await page.getByLabel("Largura (m)").fill("8");
    await page.getByLabel("Comprimento (m)").fill("12");
    await page.getByLabel("Altura (m)").fill("4");
    await page.getByRole("button",{name:"Gerar modelo 3D"}).click();
    await expect(page.getByTestId("takeoff-totals")).toBeVisible();
    await page.getByRole("button",{name:"Pré-fabricação",exact:true}).click();
    const panel=page.getByTestId("preproduction-dossier");
    await expect(panel).toContainText("NÃO LIBERADO PARA COMPRA OU CORTE");
    await expect(panel).toContainText("pendentes ou obsoletos");
    await expect(panel).toContainText("Pilares", {timeout:5000}).catch(async()=>{
      // Role identifiers are preserved in English by the physical model.
      await expect(panel).toContainText("column");
    });
    const pdfWait=page.waitForEvent("download");
    await panel.getByRole("button",{name:"Baixar dossiê preliminar PDF"}).click();
    const pdf=await pdfWait;
    expect(pdf.suggestedFilename()).toMatch(/dossie-pre-fabricacao-preliminar.*\.pdf$/);
    const pdfBytes=await readFile((await pdf.path())!);
    expect(pdfBytes.subarray(0,4).toString()).toBe("%PDF");
    const xlsxWait=page.waitForEvent("download");
    await panel.getByRole("button",{name:"Baixar dossiê preliminar Excel"}).click();
    const xlsx=await xlsxWait;
    expect(xlsx.suggestedFilename()).toMatch(/dossie-pre-fabricacao-preliminar.*\.xlsx$/);
    const zipBytes=await readFile((await xlsx.path())!);
    expect(zipBytes.subarray(0,2).toString()).toBe("PK");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
