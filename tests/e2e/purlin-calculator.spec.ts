import {test,expect} from "@playwright/test";

for(const width of [375,1440]){
  test(`cálculo de terças usa Python real, exporta e invalida entradas alteradas em ${width}px`,async({page})=>{
    test.setTimeout(90000);
    await page.setViewportSize({width,height:920});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/tercas");
    await expect(page.getByRole("heading",{name:"Comparar terças metálicas"})).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Não é dimensionamento estrutural");
    await page.getByLabel("Carga linear declarada (N/m)").fill("-1000");
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
  await page.getByLabel("Carga linear declarada (N/m)").fill("-1000");
  await page.getByLabel("Espessura (mm) · candidato 1").fill("30");
  await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
  await expect(page.locator("p[role=alert]")).toContainText("Espessura incompatível");
  await expect(page.getByTestId("purlin-result")).toHaveCount(0);
});

test("modo superficial rastreável exige origem, converte pressão horizontal e calcula peso próprio por candidato",async({page})=>{
  test.setTimeout(90000);
  await page.goto("/tercas");
  await page.getByLabel("Entrada de carga").selectOption("surface");
  await page.getByLabel("Pressão vertical declarada (N/m²)").fill("-800");
  await page.getByLabel("Largura tributária horizontal (m)").fill("1.25");
  await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
  await expect(page.locator("p[role=alert]")).toContainText("origem");
  await page.getByLabel("Origem da carga declarada").fill("Memorial técnico externo: pressão por projeção horizontal");
  await page.getByRole("checkbox",{name:/Somar peso próprio estimado/}).check();
  const promise=page.waitForResponse(r=>r.url().endsWith("/api/experimental/purlin")&&r.request().method()==="POST");
  await page.getByRole("button",{name:/Calcular e comparar no Python/}).click();
  const response=await promise;
  expect(response.status()).toBe(200);
  const request=response.request().postDataJSON();
  const result=await response.json();
  expect(request.load_mode).toBe("surface");
  expect(request.uniform_load_n_m).toBe(0);
  expect(request.surface_pressure_n_m2).toBe(-800);
  expect(request.tributary_width_m).toBe(1.25);
  expect(request.include_self_weight).toBe(true);
  expect(result.input.load_source).toContain("Memorial");
  expect(result.results).toHaveLength(3);
  for(const c of result.results){
    expect(c.declared_line_load_n_m).toBeCloseTo(-1000,6);
    expect(c.self_weight_line_load_n_m).toBeLessThan(0);
    expect(c.total_line_load_n_m).toBeCloseTo(-1000+c.self_weight_line_load_n_m,6);
    expect(c.reactions.reduce((s:number,r:{vertical_n:number})=>s+r.vertical_n,0)).toBeCloseTo(-4*c.total_line_load_n_m,5);
  }
  expect(result.results[0].total_line_load_n_m).not.toBe(result.results[1].total_line_load_n_m);
  expect(result.computedStructuralApproval).toBe(false);
  await expect(page.getByTestId("purlin-result")).toHaveCount(3);
  await page.reload();
  await expect(page.getByLabel("Entrada de carga")).toHaveValue("surface");
  await expect(page.getByLabel("Pressão vertical declarada (N/m²)")).toHaveValue("-800");
  await expect(page.getByRole("checkbox",{name:/Somar peso próprio estimado/})).toBeChecked();
  await expect(page.getByTestId("purlin-result")).toHaveCount(0);
});
