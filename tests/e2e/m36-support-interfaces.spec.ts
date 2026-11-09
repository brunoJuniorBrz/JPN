import {expect,test} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {openResultTab} from "./result-tabs";

for(const width of [375,1440]){
  test("M36-P2: apoio misto declarado, sem vínculo presumido, persistido em "+width+"px",async({page})=>{
    test.setTimeout(120000);
    await page.setViewportSize({width,height:950});
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    const input=JSON.parse(await readFile("src/domain/test-support/m34ab-declared.json","utf8"));
    input.name="M36 apoios reais "+width;
    input.workspace.guidedSupport={version:1,arrangement:"mixed",
      left:"existing-masonry",right:"new-column",coverage:"whole",
      source:"Registro da escolha de obra para ensaio automatizado",note:"Dados sintéticos, não dimensionamento"};
    await page.goto("/projetos/novo");
    await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();
    await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({
      name:"m36-apoios.json",mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify(input))
    });
    await expect(page).toHaveURL(/fluxo=levantamento/);
    await openResultTab(page,"Engenharia");
    const panel=page.getByTestId("mixed-workspace");
    await panel.getByRole("button",{name:"Preparação mista",exact:true}).click();
    await panel.getByRole("button",{name:"2. Apoios e ligações"}).click();

    const support=panel.getByLabel("Nó do apoio misto");
    await expect(support).toBeVisible();
    await support.selectOption("B0");
    await expect(panel.getByLabel("B0 · UX")).toHaveValue("fixed");
    await expect(panel.getByLabel("B0 · UZ")).toHaveValue("fixed");

    await panel.getByText("Registrar ou atualizar interface física de apoio",{exact:true}).click();
    const add=async(nodeId:string,side:"A"|"B",kind:string,revision:string)=>{
      await panel.getByLabel("Nó com vínculos já declarados").selectOption(nodeId);
      await panel.getByLabel("Lado da obra").selectOption(side);
      await panel.getByLabel("Tipo de elemento que recebe os esforços").selectOption(kind);
      await panel.getByLabel("Situação da revisão").selectOption("site-reviewed");
      await panel.getByLabel("Fonte do levantamento").fill("Registro de inspeção explicitamente declarado");
      await panel.getByLabel("Revisão / data").fill(revision);
      await panel.getByLabel("Como a carga passa da barra para o apoio").fill("Fluxo de transmissão descrito para a estrutura real");
      await panel.getByLabel("Justificativa dos seis vínculos físicos").fill("Condições de contorno registradas em memorial de revisão");
      await panel.getByRole("button",{name:"Salvar interface física",exact:true}).click();
    };
    await add("B0","A","existing-masonry","REV-R1-A");
    await add("A1","B","new-steel-column","REV-R1-B");
    await expect(panel.getByText("B0 · Alvenaria existente · lado A")).toBeVisible();
    await expect(panel.getByText("A1 · Pilar metálico novo · lado B")).toBeVisible();
    await page.getByRole("button",{name:"Salvar levantamento",exact:true}).click();

    const loaded=await expect.poll(async()=>page.evaluate(()=>{
      const s=JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
      const p=s.projects.find((p:{name:string})=>p.name.startsWith("M36 apoios reais"));
      return p?.workspace?.spatialPreparation?.supportInterfaces?.length??0;
    })).toBe(2);
    void loaded;
    await page.reload();
    await openResultTab(page,"Engenharia");
    const again=page.getByTestId("mixed-workspace");
    await again.getByRole("button",{name:"Preparação mista",exact:true}).click();
    await again.getByRole("button",{name:"2. Apoios e ligações"}).click();
    await expect(again.getByText("B0 · Alvenaria existente · lado A")).toBeVisible();
    await expect(again.getByText("A1 · Pilar metálico novo · lado B")).toBeVisible();
    const current=await page.evaluate(()=>{
      const s=JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
      return s.projects.find((p:{name:string})=>p.name.startsWith("M36 apoios reais"));
    });
    expect(current.workspace.spatialPreparation.supportInterfaces.map(
      (s:{nodeId:string;kind:string})=>[s.nodeId,s.kind])).toEqual([
        ["B0","existing-masonry"],["A1","new-steel-column"]
      ]);
    expect(current.workspace.spatialPreparation.supports).toEqual(input.workspace.spatialPreparation.supports);
    expect(errors).toEqual([]);
  });
}
