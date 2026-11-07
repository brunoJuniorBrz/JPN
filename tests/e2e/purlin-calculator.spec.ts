import {test,expect} from "@playwright/test";

for(const width of [375,1440]){
  test(`cálculo de terças usa Python real, exporta e invalida entradas alteradas em ${width}px`,async({page})=>{
    test.setTimeout(90000);
    await page.setViewportSize({width,height:920});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/tercas");
    await expect(page.getByRole("heading",{name:"Comparar terças metálicas"})).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Não é dimensionamento estrutural");
    const response=page.waitForResponse(r=>r.url().endsWith("/api/experimental/purlin")&&r.request().method()==="POST");
    await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
    const r=await response;expect(r.status()).toBe(200);
    const payload=r.request().postDataJSON(),data=await r.json();
    expect(payload.schema_version).toBe("jpn.purlin/1");
    expect(data.schema_version).toBe("jpn.purlin-result/1");
    expect(data.request_id).toBe(payload.request_id);
    expect(data.results).toHaveLength(3);
    expect(data.computedStructuralApproval).toBe(false);
    expect(data.fabricationRelease).toBe(false);
    expect(data.results[0].peak_moment_nm).toBeCloseTo(2000,6);
    expect(data.results[0].reactions[0].vertical_n).toBeCloseTo(2000,6);
    await expect(page.getByTestId("purlin-result")).toHaveCount(3);
    const download=page.waitForEvent("download");
    await page.getByRole("button",{name:"Exportar dados e resultados JSON"}).click();
    const file=await download;expect(file.suggestedFilename()).toMatch(/tercas.*json/);
    await page.getByLabel("Carga linear declarada (N/m)").fill("-1600");
    await expect(page.getByTestId("purlin-result")).toHaveCount(0);
    await expect(page.getByText(/Entradas alteradas/)).toBeVisible();
    const resp2=page.waitForResponse(r=>r.url().endsWith("/api/experimental/purlin")&&r.request().method()==="POST");
    await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
    const updated=await resp2;expect(updated.status()).toBe(200);
    expect((await updated.json()).results[0].peak_moment_nm).toBeCloseTo(3200,6);
    await expect(page.getByTestId("purlin-result")).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test("recusa espessura impossível antes de enviar ao motor",async({page})=>{
  await page.goto("/tercas");
  await page.getByLabel("Espessura (mm) · candidato 1").fill("30");
  await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
  await expect(page.locator("p[role=alert]")).toContainText("Espessura incompatível");
  await expect(page.getByTestId("purlin-result")).toHaveCount(0);
});
