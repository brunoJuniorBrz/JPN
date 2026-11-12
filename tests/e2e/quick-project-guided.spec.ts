import { expect, test } from "@playwright/test";

for (const width of [375,1440]) {
  test(`assistente visual cria pré-projeto editável em ${width}px sem fingir dimensionamento`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/projetos/novo");
    await expect(page.getByTestId("guided-live-preview")).toBeVisible();
    await page.getByTestId("guided-roof-mono").click();
    await expect(page.getByLabel("Formato da cobertura")).toHaveValue("mono");
    await page.getByLabel("Largura (m)").fill("10");
    await page.getByLabel("Comprimento (m)").fill("20");
    await page.getByLabel("Altura (m)").fill("4");
    await page.getByRole("group",{name:"Distância entre tesouras"}).getByRole("button",{name:"3 m"}).click();
    await page.getByRole("group",{name:"Distância entre terças"}).getByRole("button",{name:"1 m",exact:true}).click();
    await page.getByRole("group",{name:"Divisões visuais da tesoura"}).getByRole("button",{name:"8"}).click();
    await page.getByText("Mais detalhes da montagem (opcionais)").click();
    await page.getByRole("button",{name:"Parcial",exact:true}).click();
    await page.getByRole("button",{name:"Em pilares"}).click();
    await page.getByRole("button",{name:"U enrijecido"}).click();
    await page.getByText("Detalhes opcionais (podem ficar para depois)").click();
    await page.getByLabel("Cidade da obra").fill("Capão Bonito / SP");
    await page.getByRole("button",{name:"Gerar modelo 3D"}).click();
    await expect(page).toHaveURL(/vista=3d/);
    const item=await page.evaluate(()=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.at(-1));
    expect(item.roof.widthM).toBe(10);expect(item.roof.lengthM).toBe(20);
    expect(item.planning.typology).toBe("mono");expect(item.planning.frameSpacingM).toBe(3);
    expect(item.planning.purlinSpacingM).toBe(1);expect(item.planning.panels).toBe(8);
    expect(item.location).toBe("Capão Bonito / SP");
    expect(item.commercialNotes).toContain("U enrijecido");
    expect(item.commercialNotes).toContain("Parcialmente fechado");
    expect(item.planning.profiles.column.data.areaCm2).toBeNull();
    expect(item.estimate.materials).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
