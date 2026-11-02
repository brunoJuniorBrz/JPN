import { expect,test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for(const width of [375,1440])test(`M23 solicitações reais, relatório e seleção 3D em ${width}px`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:950});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/projetos/novo");await page.getByLabel("Largura (m)").fill("10");await page.getByLabel("Comprimento (m)").fill("20");await page.getByLabel("Altura (m)").fill("4");await page.getByRole("button",{name:"Gerar modelo 3D"}).click();await page.getByRole("button",{name:"Análise Estrutural Experimental",exact:true}).click();
  const p=page.getByTestId("mixed-workspace");await p.getByRole("button",{name:"Abrir exemplo de vento zonal",exact:true}).click();await expect(p.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:60000});
  await p.getByRole("button",{name:"Executar análise mista local",exact:true}).click();const report=p.getByTestId("resistance-report");await expect(report).toContainText("M23 parcial",{timeout:30000});
  await expect(report).toContainText("NÃO APROVADA PARA FABRICAÇÃO");
  const download=page.waitForEvent("download");await report.getByRole("button",{name:"Exportar relatório resistente preliminar",exact:true}).click();const file=await download,out=JSON.parse(await readFile((await file.path())!,"utf8"));
  expect(out.pieces).toHaveLength(207);expect(out.approvedForFabrication).toBe(false);expect(out.normativeProceduresImplemented).toEqual([]);expect(out.physicalInput.members).toHaveLength(243);
  const feDownload=page.waitForEvent("download");await p.getByRole("button",{name:"Exportar resultados mistos",exact:true}).click();const feFile=await feDownload,fe=JSON.parse(await readFile((await feFile.path())!,"utf8"));expect(out.binding.inputSha256).toBe(fe.result.input_sha256);
  expect(out.demands.sampling.continuousExtremaLocated).toBe(false);expect(out.binding.solver.version).toBe("3.2.1");
  const beam=out.demands.pieces.find((x:{kind:string;segments:unknown[]})=>x.kind==="frame"&&x.segments.length>1);expect(beam).toBeTruthy();
  const row=beam.samples[0],station=fe.result.combinations[row.combinationId].members[row.segmentId].stations[row.stationIndex];expect(row.forces).toEqual({nN:station.n_n,vyN:station.vy_n,vzN:station.vz_n,tNm:station.t_nm,myNm:station.my_nm,mzNm:station.mz_nm});
  await p.getByLabel("Peça na análise mista").selectOption(beam.pieceId);await expect(report.getByTestId("resistance-selected")).toHaveAttribute("data-piece-id",beam.pieceId);await expect(p.getByTestId("mixed-viewer")).toBeVisible();
  await expect(report).toContainText("N, Vy, Vz, T, My, Mz concomitantes");
  const axial=out.demands.pieces.find((x:{kind:string})=>x.kind==="axial");await p.getByLabel("Peça na análise mista").selectOption(axial.pieceId);await expect(report.getByTestId("resistance-selected")).toContainText("não aplicáveis");
  await p.getByRole("button",{name:"Preparação mista",exact:true}).click();await p.getByTestId("structural-loads").locator(":scope > summary").click();
  const wind=p.getByTestId("wind-engineering");await wind.locator(":scope > summary").click();await wind.getByRole("button",{name:"Editar declarações de vento atuais",exact:true}).click();const editor=wind.getByLabel("Declarações de vento e combinações (JSON)"),pack=JSON.parse(await editor.inputValue());pack.wind.cases[0].reference.revision="M23-invalidation";await editor.fill(JSON.stringify(pack));await wind.getByRole("button",{name:"Registrar vento e substituir combinações declaradas",exact:true}).click();
  await p.getByRole("button",{name:"Resultados 3D",exact:true}).click();await expect(p.getByTestId("mixed-no-results")).toBeVisible();await expect(report).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

for(const width of [375,1440])test(`cadastro resistente, seção Python e limite de flecha em ${width}px`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:950});
  await page.goto("/projetos/novo");await page.getByLabel("Largura (m)").fill("10");await page.getByLabel("Comprimento (m)").fill("20");await page.getByLabel("Altura (m)").fill("4");await page.getByRole("button",{name:"Gerar modelo 3D"}).click();await page.getByRole("button",{name:"Análise Estrutural Experimental",exact:true}).click();
  const p=page.getByTestId("mixed-workspace");await p.getByRole("button",{name:"Abrir exemplo de vento zonal",exact:true}).click();await expect(p.getByTestId("mixed-health")).toContainText("PyNiteFEA 3.2.1",{timeout:60000});
  async function setBase(fy:string){
    await p.getByTestId("structural-loads").locator(":scope > summary").click();await p.getByLabel("Peça da carga uniforme").selectOption("TE1-V1");await p.getByLabel("Família real do perfil").selectOption("cold-formed");
    for(const [name,value]of [["fy declarado (MPa)",fy],["fu declarado (MPa)","400"],["Comprimento de flambagem Y (m)","2"],["Comprimento de flambagem Z (m)","3"],["Distância de contenção lateral (m)","2"],["Fonte dos dados resistentes","Ensaio de interface independente"],["Revisão dos dados resistentes","1"],["Descrição das contenções","Contenções sintéticas explicitamente declaradas"],["Módulo elástico Wy (cm³)","20"],["Módulo elástico Wz (cm³)","10"],["Norma, edição e cláusulas para revisão futura","NBR 14762:2010; texto integral pendente"]])await p.getByLabel(name,{exact:true}).fill(value);
    await p.getByRole("button",{name:"Registrar base resistente pendente",exact:true}).click();
  }
  await setBase("250");await p.getByRole("button",{name:"Executar análise mista local",exact:true}).click();await expect(p.getByTestId("resistance-report")).toBeVisible({timeout:30000});await p.getByLabel("Peça na análise mista").selectOption("TE1-V1");
  const selected=p.getByTestId("resistance-selected");await selected.locator("summary").filter({hasText:"Geometria física resistente"}).click();
  await selected.getByLabel("Designação física resistente",{exact:true}).fill("U enrijecido físico de ensaio");await selected.getByLabel("Forma física resistente").selectOption("u-stiffened");
  for(const [name,value]of [["Altura física (mm)","100"],["Largura física (mm)","50"],["Espessura de parede física (mm)","2"],["Enrijecedor física (mm)","15"],["Raio interno física (mm)","3"],["Fonte da geometria resistente","Ensaio declarado, sem dimensões visuais"],["Revisão da geometria resistente","G1"]])await selected.getByLabel(name,{exact:true}).fill(value);
  await selected.getByRole("button",{name:"Registrar geometria resistente e invalidar análise",exact:true}).click();await expect(p.getByTestId("mixed-no-results")).toBeVisible();await expect(p.getByTestId("resistance-report")).toHaveCount(0);
  await p.getByRole("button",{name:"Preparação mista",exact:true}).click();await setBase("300");await p.getByRole("button",{name:"Executar análise mista local",exact:true}).click();await expect(p.getByTestId("resistance-report")).toBeVisible({timeout:30000});
  await p.getByLabel("Peça na análise mista").selectOption("TE1-V1");
  const props=p.getByTestId("cold-formed-properties");await props.locator(":scope > summary").click();
  for(const [label,value]of [["Fonte das propriedades Ue","Fonte sintética independente"],["Revisão das propriedades Ue","M26-R1"],["Responsável pelas propriedades Ue","Ensaio, não obra real"],["Origem e referência da seção Ue","Origem do desenho da seção de ensaio"],["Ue nominalThicknessMm","2"],["Resolução Ue nominalThicknessMm","0.001"]])await props.getByLabel(label,{exact:true}).fill(value);
  await props.getByRole("checkbox").check();await props.getByRole("button",{name:"Registrar propriedades Ue e invalidar análise",exact:true}).click();await expect(p.getByTestId("mixed-no-results")).toBeVisible();
  await p.getByRole("button",{name:"Calcular ações de ligações",exact:true}).click();await expect(p.getByTestId("resistance-report")).toBeVisible({timeout:30000});
  const section=p.getByTestId("section-analysis");await section.locator(":scope > summary").click();
  await section.getByLabel("Poisson declarado para análise da seção").fill("0.3");await section.getByLabel("Responsável pela análise da seção").fill("Synthetic end-to-end validation");
  await section.getByRole("button",{name:"Calcular seção física local",exact:true}).click();await expect(section.getByTestId("section-properties-result")).toContainText("jMm4",{timeout:25000});
  await expect(section.getByTestId("section-properties-result")).toContainText("resistência normativa não calculadas");
  const sectionWait=page.waitForEvent("download");await section.getByRole("button",{name:"Exportar cálculo da seção",exact:true}).click();const sectionFile=await sectionWait,sectionRecord=JSON.parse(await readFile((await sectionFile.path())!,"utf8"));expect(sectionRecord.result.library.version).toBe("3.10.2");expect(sectionRecord.input.geometry.wallThickness).toBe(2);expect(sectionRecord.result.approvedForFabrication).toBe(false);
  const service=p.getByTestId("declared-service");await service.locator(":scope > summary").click();
  await service.getByLabel("Limite de flecha declarado (mm)").fill("0.000000001");await service.getByLabel("Grandeza de flecha").selectOption("vector-norm");
  await service.getByRole("checkbox").first().check();await service.getByLabel("Fonte do limite de flecha").fill("Synthetic rejection case, not an ABNT limit");await service.getByLabel("Revisão do limite de flecha").fill("1");await service.getByLabel("Responsável pelo limite de flecha").fill("Independent test");
  await service.getByRole("button",{name:"Registrar limite declarado e invalidar análise",exact:true}).click();await expect(p.getByTestId("mixed-no-results")).toBeVisible();
  await p.getByRole("button",{name:"Calcular ações de ligações",exact:true}).click();await expect(p.getByTestId("resistance-report")).toBeVisible({timeout:30000});
  const wait=page.waitForEvent("download");await p.getByRole("button",{name:"Exportar relatório resistente preliminar",exact:true}).click();const file=await wait,out=JSON.parse(await readFile((await file.path())!,"utf8"));const piece=out.pieces.find((x:{pieceId:string})=>x.pieceId==="TE1-V1");
  expect(piece.declaration.fyMpa).toBe(300);expect(piece.declaration.profileDesignation).toBe("U enrijecido físico de ensaio");expect(piece.declaration.geometry.dimensionsMm.wallThickness).toBe(2);expect(piece.declaration.geometry.revision).toBe("G1");expect(piece.approved).toBe(false);expect(piece.declaration.coldFormed.revision).toBe("M26-R1");expect(piece.declaration.coldFormed.nominalThicknessMm.value).toBe(2);expect(piece.declaration.coldFormed.areaCm2).toBeNull();expect(out.continuousDemands.pieces).toHaveLength(207);expect(out.schema_version).toBe("jpn.resistance-report/2");expect(out.releaseGate.status).toBe("NOT_READY_BLOCKED");expect(out.serviceChecks.find((c:{criterion:{pieceId:string}})=>c.criterion.pieceId==="TE1-V1").status).toBe("exceeds-declared-limit");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

