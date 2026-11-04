import {expect,test,type Page} from "@playwright/test";
import {planningExample} from "../../src/domain/planning-example";
import {emptySnapshot} from "../../src/domain/models";

async function seed(page:Page){
  const p=planningExample();p.isExample=false;
  await page.addInitScript(snapshot=>{
    if(!localStorage.getItem("jpn-projetos:v1"))
      localStorage.setItem("jpn-projetos:v1",JSON.stringify(snapshot));
  },{...emptySnapshot(),exampleInstalled:true,projects:[p]});
  await page.goto("/projetos/"+p.id+"?fluxo=levantamento&etapa=3");
  await expect(page.getByTestId("takeoff-totals")).toBeVisible();
}

for(const width of [375,1440]){
  test.describe("measurement "+width+"px",()=>{
    test.use({isMobile:width===375,hasTouch:width===375,deviceScaleFactor:width===375?2:1});
    test("measures model nodes, shows overlay and never updates saved project",async({page})=>{
      await page.setViewportSize({width,height:900});
      const errors:string[]=[];page.on("pageerror",err=>errors.push(err.message));
      await seed(page);
      const stored=await page.evaluate(()=>localStorage.getItem("jpn-projetos:v1"));
      await page.getByRole("button",{name:"Visualizar em 3D",exact:true}).click();
      const canvas=page.getByRole("img",{name:"Modelo 3D da estrutura"});
      await expect(canvas).toBeVisible();
      await page.getByRole("button",{name:"Medir entre nós"}).click();
      await expect(canvas).toHaveAttribute("data-measuring","true");
      expect(Number(await canvas.getAttribute("data-node-markers"))).toBeGreaterThan(1);
      const start=page.getByRole("combobox",{name:"Nó inicial da medição"});
      const end=page.getByRole("combobox",{name:"Nó final da medição"});
      const ids=await start.locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value).filter(Boolean));
      expect(ids.length).toBeGreaterThan(1);
      await start.selectOption(ids[0]);await end.selectOption(ids[1]);
      await expect(canvas).toHaveAttribute("data-measurement-nodes",ids.slice(0,2).join(","));
      const length=Number(await canvas.getAttribute("data-measurement-length-mm"));
      expect(length).toBeGreaterThan(0);
      await expect(page.getByTestId("3d-measurement")).toContainText("ΔX");
      await page.getByRole("button",{name:"Nova medida"}).click();
      await expect(canvas).toHaveAttribute("data-measurement-length-mm","");
      await page.getByRole("button",{name:"Encerrar medição"}).click();
      await expect(canvas).toHaveAttribute("data-measuring","false");
      await expect(canvas).toHaveAttribute("data-node-markers","0");
      expect(await page.evaluate(()=>localStorage.getItem("jpn-projetos:v1"))).toBe(stored);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
