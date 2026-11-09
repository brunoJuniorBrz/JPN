import { expect,test } from "@playwright/test";

for(const width of [375,1440])test.describe("Guided builder "+width+"px",()=>{
 test.use({isMobile:width===375,hasTouch:width===375,deviceScaleFactor:width===375?2:1});
 test("wall, concrete and partial roof options persist and cannot invent columns or roof area",async({page})=>{
   test.setTimeout(95000);await page.setViewportSize({width,height:920});
   const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("/projetos/novo");
   await page.getByRole("button",{name:"Usar cadastro completo",exact:true}).click();
   await page.getByLabel("Nome do projeto *",{exact:true}).fill("Teste guiado de apoio em alvenaria");
   await page.getByLabel("Cliente *",{exact:true}).fill("Montador de coberturas");
   await page.getByRole("button",{name:"Salvar e continuar",exact:true}).click();
   await expect(page).toHaveURL(/etapa=1/);
   const guided=page.getByTestId("guided-roof-setup");await expect(guided).toBeVisible();
   await guided.getByTestId("roof-type-gable").click();
   await guided.getByTestId("support-option-mixed").click();
   await guided.getByTestId("support-side-b").selectOption("existing-concrete");
   await guided.getByTestId("support-coverage").selectOption("partial");
   await expect(guided).toContainText("O JPN não");
   await page.getByLabel("Largura (m)",{exact:true}).fill("12");
   await page.getByLabel("Comprimento (m)",{exact:true}).fill("20");
   await page.getByLabel("Altura do lado mais baixo (m)",{exact:true}).fill("5");
   await page.getByLabel("Inclinação (%)",{exact:true}).fill("10");
   await guided.getByTestId("guided-starter").click();
   await expect(guided.getByRole("status")).toContainText("NÃO é dimensionamento");
   await expect(page.getByText("o desenho retangular é apenas um envelope ilustrativo")).toBeVisible();
   const id=new URL(page.url()).pathname.split("/").at(-1)!;
   await expect.poll(async()=>page.evaluate(id=>{
     const p=JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((v:{id:string})=>v.id===id);
     return p?.workspace.guidedSupport?.right;
   },id)).toBe("existing-concrete");
   await page.reload();
   const after=page.getByTestId("guided-roof-setup");
   await expect(after.getByTestId("support-option-mixed")).toHaveAttribute("aria-pressed","true");
   await expect(after.getByTestId("roof-type-gable")).toHaveAttribute("aria-pressed","true");
   await expect(after.getByTestId("support-side-b")).toHaveValue("existing-concrete");
   await expect(after.getByTestId("support-coverage")).toHaveValue("partial");
   await expect(page.getByRole("button",{name:"Configurar modelo 3D"})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(errors).toEqual([]);
 });
});
