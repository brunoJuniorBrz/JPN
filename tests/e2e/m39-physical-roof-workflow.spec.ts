import {expect,test} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {openResultTab} from "./result-tabs";

for(const width of [375,1440]){
  test("M39-P3: panos XYZ, terças, área e revisão persistidos em "+width+"px",async({page})=>{
    test.setTimeout(120000);
    await page.setViewportSize({width,height:950});
    const failures:string[]=[];
    page.on("pageerror",error=>failures.push(error.message));
    const input=JSON.parse(await readFile("src/domain/test-support/m34ab-declared.json","utf8"));
    input.name="M39-P3 cobertura física "+width;
    input.workspace.physicalStructure={
      schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
      provenance:"Geometria física de ensaio com quatro nós e duas terças explícitas",
      revision:"Revisão do levantamento M39-P3",
      nodes:[
        {id:"A0",x:0,y:0,z:3000},{id:"A5",x:0,y:5000,z:3000},
        {id:"B0",x:4000,y:0,z:3400},{id:"B5",x:4000,y:5000,z:3400},
      ],
      pieces:[
        {id:"T1",role:"purlin",start:"A0",end:"A5"},
        {id:"T2",role:"purlin",start:"B0",end:"B5"},
        {id:"CH0",role:"topChord",start:"A0",end:"B0"},
        {id:"CH5",role:"topChord",start:"A5",end:"B5"},
      ],
    };
    input.workspace.spatialPreparation.cases=[{
      id:"AREA",source:"Carga física de referência específica deste ensaio",
    }];
    input.workspace.spatialPreparation.combinations=[{
      id:"ELASTIC",factors:{AREA:1},
    }];
    input.workspace.spatialPreparation.loads=[];
    await page.goto("/projetos/novo");
    await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();
    await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({
      name:"m39-workflow.json",mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify(input)),
    });
    await expect(page).toHaveURL(/fluxo=levantamento/);
    await openResultTab(page,"Engenharia");
    const panel=page.getByTestId("mixed-workspace");
    await panel.getByRole("button",{name:"Preparação mista",exact:true}).click();
    await panel.getByRole("button",{name:"3. Cargas e combinações"}).click();
    const roof=panel.getByTestId("physical-roof-workflow");
    await expect(roof).toBeVisible();
    await roof.getByText("Cadastrar novo pano físico",{exact:true}).click();
    await roof.getByLabel("ID do pano físico").fill("PANO-1");
    await roof.getByLabel("Fonte do levantamento XYZ").fill("Levantamento de cobertura conferido no desenho técnico");
    await roof.getByLabel("Revisão do pano físico").fill("REV-M39-1");
    await roof.getByLabel(/Vértices externos em mm/).fill(
      "0; 0; 3000\n4000; 0; 3400\n4000; 5000; 3400\n0; 5000; 3000"
    );
    await roof.getByLabel("Terça existente para associar ao pano").selectOption("T1");
    await roof.getByRole("button",{name:"Associar terça"}).click();
    await roof.getByLabel("Terça existente para associar ao pano").selectOption("T2");
    await roof.getByRole("button",{name:"Associar terça"}).click();
    await roof.getByRole("button",{name:"Salvar pano físico"}).click();
    await expect(roof.getByText("PANO-1 · 2 terças · REV-M39-1")).toBeVisible();
    await expect(roof.getByText(/Área projetada declarada: 20\.000 m²/)).toBeVisible();
    await roof.getByText("Registrar ação de área",{exact:true}).click();
    await roof.getByLabel("Caso físico da ação").selectOption("AREA");
    await roof.getByLabel("Intensidade da pressão (kN/m²)").fill("0,2");
    await roof.getByLabel("Origem da ação").fill("Pressão física de exemplo, sem valores normativos");
    await roof.getByLabel("Revisão da ação").fill("REV-CARGA-M39");
    await roof.getByLabel("Hipótese declarada de transmissão da telha à terça").fill(
      "Chapas simplesmente apoiadas entre duas terças modeladas, distribuição física conservativa"
    );
    await roof.getByRole("button",{name:"Salvar ação de área"}).click();
    await expect(roof.getByText(/AREA · 0\.2 kN\/m²/)).toBeVisible();
    await roof.getByRole("button",{name:"Conferir distribuição física das cargas"}).click();
    await expect(roof.getByText(/Distribuição física conferida para 1 ação/)).toBeVisible();
    await page.getByRole("button",{name:"Salvar levantamento",exact:true}).click();
    await expect.poll(async()=>page.evaluate(()=>{
      const snapshot=JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
      const found=snapshot.projects.find((p:{name:string})=>p.name.startsWith("M39-P3 cobertura física"));
      return found?.workspace?.spatialPreparation?.loading?.roofDistribution?.method??"";
    })).toBe("parallel-purlin-strips");
    await page.reload();
    await openResultTab(page,"Engenharia");
    const after=page.getByTestId("mixed-workspace");
    await after.getByRole("button",{name:"Preparação mista",exact:true}).click();
    await after.getByRole("button",{name:"3. Cargas e combinações"}).click();
    const persisted=after.getByTestId("physical-roof-workflow");
    await expect(persisted.getByText("PANO-1 · 2 terças · REV-M39-1")).toBeVisible();
    await expect(persisted.getByText(/AREA · 0\.2 kN\/m²/)).toBeVisible();
    await persisted.getByRole("button",{name:"Editar pano PANO-1"}).click();
    await persisted.getByLabel("Revisão do pano físico").fill("REV-M39-2");
    await persisted.getByRole("button",{name:"Salvar pano físico"}).click();
    await page.getByRole("button",{name:"Salvar levantamento",exact:true}).click();
    const afterChange=await page.evaluate(()=>{
      const snapshot=JSON.parse(localStorage.getItem("jpn-projetos:v1")!);
      return snapshot.projects.find((p:{name:string})=>p.name.startsWith("M39-P3 cobertura física"));
    });
    expect(afterChange.workspace.spatialPreparation.physicalRoofFaces.faces[0].revision).toBe("REV-M39-2");
    expect(afterChange.workspace.spatialPreparation.loading.roofDistribution).toBeUndefined();
    expect(afterChange.technicalStatus).toBe("preliminary");
    expect(failures).toEqual([]);
  });
}
