import { expect,test } from "@playwright/test";
import { readFile,mkdir,writeFile } from "node:fs/promises";
import { openResultTab } from "./result-tabs";
import { calculateEstimate } from "../../src/domain/calculations/estimate";

for(const width of [375,1440])test.describe(`M35 ${width}px`,()=>{
  test.use({isMobile:width===375,hasTouch:width===375,deviceScaleFactor:width===375?2:1});
  test("declared geometry -> native UDL Python -> traced takeoff -> budget -> stale results",async({page})=>{
    test.setTimeout(150000);await page.setViewportSize({width,height:950});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    const p=JSON.parse(await readFile("src/domain/test-support/m34ab-declared.json","utf8"));p.name=`M35 synthetic irregular test ${width}`;p.workspace.spatialPreparation.loads=[];
    await page.goto("/projetos/novo");await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({name:"synthetic-irregular.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(p))});
    await expect(page).toHaveURL(/fluxo=levantamento/);const savedURL=page.url(),id=new URL(savedURL).pathname.split("/").at(-1)!;
    await openResultTab(page,"Engenharia");const panel=page.getByTestId("mixed-workspace");await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:30000});
    for(const [section,price] of [["S1","10"],["S2","20"],["SAX","30"]]){
      await panel.getByLabel("Seção física cadastrada",{exact:true}).selectOption(section);
      await panel.getByLabel(`Seção ${section} · designação do perfil`,{exact:true}).fill(`Synthetic ${section}`);
      await panel.getByLabel(`Seção ${section} · preço declarado (R$/m)`,{exact:true}).fill(price);
      await panel.getByLabel(`Seção ${section} · fonte comercial`,{exact:true}).fill("Synthetic rate explicitly per metre");await panel.getByLabel(`Seção ${section} · revisão comercial`,{exact:true}).fill("1");
    }
    const loads=panel.getByTestId("structural-loads");await loads.locator(":scope > summary").click();
    for(const piece of ["F1","F2"]){
      await loads.getByLabel("Peça da carga uniforme",{exact:true}).selectOption(piece);await loads.getByLabel("Sistema da carga uniforme",{exact:true}).selectOption("global");
      for(const [axis,value] of [["X","0"],["Y","0"],["Z","-0.1"]])await loads.getByLabel(`Carga uniforme ${axis} (kN/m)`,{exact:true}).fill(value);
      await loads.getByLabel("Fonte da carga uniforme",{exact:true}).fill("Synthetic -100 N/m; not Tom roof loading");await loads.getByLabel("Revisão da carga uniforme",{exact:true}).fill("1");await loads.getByRole("button",{name:"Registrar carga uniforme",exact:true}).click();
    }
    const response=page.waitForResponse(r=>r.url().endsWith("/api/experimental/mixed3d")&&r.request().method()==="POST");await panel.getByRole("button",{name:"Executar análise mista local",exact:true}).click();const r=await response;expect(r.status()).toBe(200);const input=r.request().postDataJSON(),out=await r.json();
    expect(input.schema_version).toBe("jpn.mixed3d/2");expect(input.project.id).toBe(id);expect(input.member_loads).toHaveLength(2);
    const q=-100,E=200e9,L=2,I1=1e-6,I2=2e-6;const independent=q/(8*E)*((L**4-1)/I1+1/I2);
    expect(out.result.combinations.Q1.nodes.B2.translation_m[2]).toBeCloseTo(independent,10);expect(out.result.combinations.Q1.nodes.B0.reaction_force_n[2]).toBeCloseTo(200,8);
    await expect(panel.getByTestId("declared-load-trace")).toContainText("F1");await expect(panel.getByTestId("declared-load-trace")).toContainText("F2");await expect(panel.getByTestId("mixed-result-state")).toContainText("Fabricação bloqueada");
    const event=page.waitForEvent("download");await panel.getByRole("button",{name:"Exportar resultados mistos",exact:true}).click();const exported=await readFile((await(await event).path())!,"utf8");
    await openResultTab(page,"Materiais");await expect(page.getByTestId("declared-takeoff")).toContainText("3 peças");await page.getByRole("button",{name:"Atualizar quantitativos no orçamento",exact:true}).click();
    await expect.poll(async()=>page.evaluate(id=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((p:{id:string})=>p.id===id).estimate.materials.filter((l:{source:string})=>l.source==="takeoff").length,id)).toBe(3);
    const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((p:{id:string})=>p.id===id),id);expect(calculateEstimate(stored).directCostCents).toBe(6000);expect(calculateEstimate(stored).pending).toEqual([]);
    expect(stored.estimate.materials.flatMap((l:{quantityOrigin:{pieceIds:string[]}})=>l.quantityOrigin.pieceIds).sort()).toEqual(["AX1","F1","F2"]);
    const takeoff=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar quantitativo declarado JSON",exact:true}).click();const quantity=JSON.parse(await readFile((await(await takeoff).path())!,"utf8"));expect(quantity.totals.lengthM).toBe(3);expect(quantity.totals.massKg).toBeNull();expect(quantity.fabricationRelease).toBe(false);
    await openResultTab(page,"Arquivos");const geometry=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar modelo estrutural JSON",exact:true}).click();const saved=JSON.parse(await readFile((await(await geometry).path())!,"utf8"));expect(saved.workspace.physicalStructure).toEqual(stored.workspace.physicalStructure);expect(saved.workspace.spatialPreparation.physicalCatalog).toEqual(stored.workspace.spatialPreparation.physicalCatalog);
    await page.reload();await openResultTab(page,"Engenharia");await panel.getByText("Recuperar resultado exportado",{exact:true}).click();await panel.getByLabel("Restaurar resultado misto JSON").setInputFiles({name:"result.json",mimeType:"application/json",buffer:Buffer.from(exported)});await expect(panel.getByTestId("mixed-result-state")).toContainText("Resultado restaurado");
    const editor=page.getByTestId("declared-geometry-editor");await editor.locator(":scope > summary").click();await editor.getByRole("button",{name:"Editar nó B2",exact:true}).click();await editor.getByLabel("Coordenada X do nó (mm)",{exact:true}).fill("2500");await editor.getByRole("button",{name:"Adicionar ou atualizar nó",exact:true}).click();await editor.getByLabel("Revisão da geometria declarada",{exact:true}).fill("M35 changed physical geometry");await editor.getByRole("button",{name:"Registrar geometria e invalidar dependências",exact:true}).click();
    await openResultTab(page,"Engenharia");await expect(panel.getByTestId("mixed-stale")).toBeVisible();await panel.getByLabel("Restaurar resultado misto JSON").setInputFiles({name:"stale.json",mimeType:"application/json",buffer:Buffer.from(exported)});await expect(panel.getByRole("alert").filter({hasText:"Resultado não restaurado"})).toBeVisible();
    await expect.poll(async()=>page.evaluate(id=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((p:{id:string})=>p.id===id).workspace.physicalStructure.nodes.find((n:{id:string})=>n.id==="B2").x,id)).toBe(2500);
    const changed=await page.evaluate(id=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((p:{id:string})=>p.id===id),id);expect(calculateEstimate(changed).pending.join(" ")).toContain("Levantamento alterado");
    await openResultTab(page,"Materiais");await page.getByRole("button",{name:"Atualizar quantitativos no orçamento",exact:true}).click();await expect(page.getByTestId("declared-takeoff")).toContainText("3,5 m geométricos");
    await mkdir("validation/m35",{recursive:true});await writeFile(`validation/m35/browser-${width}.json`,JSON.stringify({width,request:input,result:out.result,independentTipM:independent,takeoff:quantity},null,2));await page.screenshot({path:`validation/m35/declared-${width}.png`,fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  });
  test("manual node/element editor, negative coordinates, cutout polygon and Tom commercial data stay independent",async({page})=>{
    test.setTimeout(120000);await page.setViewportSize({width,height:950});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    // Start with an empty user-owned saved project, without writing geometry JSON.
    await page.goto("/projetos/novo");await page.getByRole("button",{name:"Usar cadastro completo",exact:true}).click();
    await page.getByLabel("Nome do projeto *",{exact:true}).fill(`Tom reference and synthetic shape ${width}`);await page.getByLabel("Cliente *",{exact:true}).fill("Audit user");
    await page.getByText("Referência comercial auditada — Tom",{exact:true}).click();await page.getByRole("button",{name:"Carregar orçamento auditado do Tom",exact:true}).click();
    const editor=page.getByTestId("declared-geometry-editor");await editor.locator(":scope > summary").click();await editor.getByLabel("Revisão da geometria declarada",{exact:true}).fill("SYNTHETIC-NOT-TOM-1");await editor.getByLabel("Fonte da geometria declarada",{exact:true}).fill("Illustrative segment only; not the Tom member layout");
    for(const [id,x,y,z] of [["N1","-1000","0","0"],["N2","4380","0","0"]]){await editor.getByLabel("ID do nó",{exact:true}).fill(id);for(const [axis,value] of [["X",x],["Y",y],["Z",z]])await editor.getByLabel(`Coordenada ${axis} do nó (mm)`,{exact:true}).fill(value);await editor.getByRole("button",{name:"Adicionar ou atualizar nó",exact:true}).click();}
    await editor.getByLabel("ID da barra",{exact:true}).fill("ILLUSTRATIVE");await editor.getByLabel("Nó inicial da barra",{exact:true}).selectOption("N1");await editor.getByLabel("Nó final da barra",{exact:true}).selectOption("N2");await editor.getByLabel("Função identificada da barra",{exact:true}).selectOption("Viga");await editor.getByRole("button",{name:"Adicionar ou atualizar barra",exact:true}).click();await editor.getByRole("button",{name:"Registrar geometria e invalidar dependências",exact:true}).click();
    await expect(page).toHaveURL(/fluxo=levantamento/);const id=new URL(page.url()).pathname.split("/").at(-1)!;
    const outline=page.getByTestId("roof-outline");await outline.locator(":scope > summary").click();await outline.getByLabel("Fonte do contorno",{exact:true}).fill("SYNTHETIC L outline; do not attribute this shape to Tom");await outline.getByLabel("Revisão do contorno",{exact:true}).fill("1");
    for(const [x,y] of [[0,0],[6000,0],[6000,2000],[3000,2000],[3000,4000],[0,4000]]){await outline.getByLabel("Ponto do contorno X (mm)",{exact:true}).fill(String(x));await outline.getByLabel("Ponto do contorno Y (mm)",{exact:true}).fill(String(y));await outline.getByRole("button",{name:"Adicionar ponto ao polígono",exact:true}).click();}
    await outline.getByRole("button",{name:"Fechar polígono",exact:true}).click();await expect(outline.getByTestId("roof-outline-area")).toContainText("18 m²");await outline.getByRole("button",{name:"Registrar contorno validado",exact:true}).click();
    await page.reload();const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem("jpn-projetos:v1")!).projects.find((p:{id:string})=>p.id===id),id);expect(saved.workspace.physicalStructure.nodes[0].x).toBe(-1000);expect(saved.workspace.physicalStructure.pieces).toHaveLength(1);expect(saved.workspace.roofOutline.outer).toHaveLength(7);
    expect(calculateEstimate(saved).directCostCents).toBe(965129);expect(saved.estimate.materials[0].manualQuantity).toBe(6);expect(saved.estimate.materials[1].manualQuantity).toBe(20);expect(saved.workspace.spatialPreparation.supports).toEqual([]);expect(saved.workspace.spatialPreparation.loads).toEqual([]);
    await openResultTab(page,"Engenharia");const panel=page.getByTestId("mixed-workspace");await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:30000});await panel.getByRole("button",{name:"Executar análise mista local",exact:true}).click();await expect(panel.getByRole("alert").first()).toContainText(/SUPPORTS|PROPERTIES|PREPARATION/);await expect(panel.getByTestId("mixed-results")).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  });
});
