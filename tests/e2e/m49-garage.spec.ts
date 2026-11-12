import {expect,test} from "@playwright/test";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {m49GarageProject} from "../../src/domain/test-support/m49-garage-project";
import {garageClosedForm} from "../../validation/m49/analytical-reference";
import {mixedInputHash} from "../../src/domain/mixed-analysis";
import {openResultTab} from "./result-tabs";

test("M49: garagem sem tesoura, ligação à flexão declarada na interface -> Python real -> sucção e relatório bloqueado",async({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width:390,height:950});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const project=m49GarageProject();
  // The user must select the new end hypothesis; importing a beam never does it.
  project.workspace.spatialPreparation!.memberConnections[0].start="rigid";
  await page.goto("/projetos/novo");
  await page.getByText("Importar modelo estrutural declarado",{exact:true}).click();
  await page.getByLabel("Importar modelo estrutural JSON").setInputFiles({name:"garagem-sem-tesoura.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await expect(page).toHaveURL(/fluxo=levantamento/);
  const ownerId=new URL(page.url()).pathname.split("/").at(-1)!;
  const editor=page.getByTestId("declared-geometry-editor");
  await editor.getByText("Criar ou editar estrutura irregular por nós e barras",{exact:true}).click();
  await editor.getByLabel("Grupo físico herdado da barra").selectOption("beam");
  await expect(editor.getByLabel("Grupo físico herdado da barra")).toHaveValue("beam");
  await openResultTab(page,"Engenharia");
  const panel=page.getByTestId("mixed-workspace");
  await expect(panel.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:25000});
  await panel.getByRole("button",{name:"Preparação mista",exact:true}).click();
  await panel.getByRole("button",{name:"2. Apoios e ligações",exact:true}).click();
  await panel.getByLabel("Peça para revisar extremidades").selectOption("V0");
  await panel.getByLabel("Ligação da extremidade inicial",{exact:true}).selectOption("bending-pinned");
  await page.getByRole("button",{name:"Salvar levantamento",exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith("/api/experimental/mixed3d")&&r.request().method()==="POST");
  await panel.getByRole("button",{name:"Executar análise mista local",exact:true}).click();
  const http=await response;expect(http.status()).toBe(200);
  const request=http.request().postDataJSON(),out=await http.json(),result=out.result;
  expect(request.project.id).toBe(ownerId);expect(request.members).toHaveLength(7);
  expect(request.supports.map((s:{node:string})=>s.node)).toEqual(["A0","A4","B0","B4"]);
  expect(request.nodal_loads).toEqual([]);expect(request.member_loads).toHaveLength(6);
  expect(result.input_sha256).toBe(await mixedInputHash(request));
  for(const [id,pressure] of [["G_ONLY",600],["W_ONLY",-900],["NET",-300]] as const){
    const c=result.combinations[id],r=garageClosedForm(pressure);
    expect(c.nodes.C0.translation_m[2]).toBeCloseTo(r.beamMidspanM,10);
    for(const node of ["A0","A4","B0","B4"])expect(c.nodes[node].reaction_force_n[2]).toBeCloseTo(r.cornerReactionN,6);
  }
  await expect(panel.getByTestId("mixed-result-state")).toContainText("Resultado calculado");
  const downloading=page.waitForEvent("download");
  await panel.getByTestId("resistance-report").getByRole("button",{name:"Exportar relatório resistente preliminar",exact:true}).click();
  const file=await downloading,report=JSON.parse(await readFile((await file.path())!,"utf8"));
  expect(report.binding.inputSha256).toBe(result.input_sha256);
  expect(report.approvedForFabrication).toBe(false);expect(report.releaseGate.status).toBe("NOT_READY_BLOCKED");
  expect(report.supportAudits.every((s:{status:string})=>s.status==="capacity-pending")).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await mkdir(".tools/m49-runtime",{recursive:true});
  await writeFile(".tools/m49-runtime/http-garage.json",JSON.stringify({request,result,report},null,2));
  await page.screenshot({path:".tools/m49-runtime/garage-390.png",fullPage:true});
});
