import {expect,it,vi} from "vitest";
import DxfParser from "dxf-parser";
import {mkdirSync,writeFileSync} from "node:fs";
import {createStructureDxf,prepareCadReactions} from "./cad";
import {CAD_NOTICE} from "./cad-sheets";
import {CAD_LAYERS} from "./cad-book";
import {axisLetter} from "./cad-model";
import {m49GarageProject} from "@/domain/test-support/m49-garage-project";
import {declaredTakeoff} from "@/domain/declared-takeoff";
import {adaptLoadedMixedProject} from "@/domain/loaded-mixed-adapter";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";

function shed(){
  const p=m49GarageProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  p.name="Galpão INT-8";
  g.nodes.filter(n=>n.id.startsWith("C")).forEach(n=>n.z=4000);
  for(const id of ["A0","A4","B0","B4"]){
    const n=g.nodes.find(n=>n.id===id)!,pieceId="COL-"+id;g.nodes.push({...n,id:id+"BASE",z:0});g.pieces.push({id:pieceId,role:"column",start:id+"BASE",end:id});
    d.physicalCatalog!.assignments.push({pieceId,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
    d.memberConnections.push({pieceId,start:"rigid",end:"rigid"});d.memberKinds!.push({pieceId,kind:"frame"});
  }
  d.supports=d.supports.map(s=>({...s,nodeId:s.nodeId+"BASE"}));
  d.physicalCatalog!.materials[0].density={kgM3:7850,source:"Densidade declarada do ensaio",revision:"TEST-1"};
  d.physicalCatalog!.sections.find(s=>s.id==="PURLIN")!.designation="Ue 150×60×20×2,00";
  d.physicalCatalog!.sections.find(s=>s.id==="BEAM")!.designation="Viga referência M49";
  d.physicalRoofFaces={schema_version:"jpn.physical-roof-faces/1",units:"mm",source:"Superfícies físicas do ensaio INT8",revision:"TEST-1",faces:[
    {id:"LEFT",outer:[[0,0,3000],[3000,0,4000],[3000,4000,4000],[0,4000,3000],[0,0,3000]],holes:[],supportPieceIds:["PA","PC"],source:"Água esquerda declarada",revision:"TEST-1"},
    {id:"RIGHT",outer:[[3000,0,4000],[6000,0,3000],[6000,4000,3000],[3000,4000,4000],[3000,0,4000]],holes:[],supportPieceIds:["PC","PB"],source:"Água direita declarada",revision:"TEST-1"}]};
  return p;
}
type E={type:string;layer:string;text?:string;textHeight?:number;actualMeasurement?:number;block?:string;startPoint?:{x:number;y:number};vertices?:{x:number;y:number;z?:number}[]};
const allEntities=(parsed:NonNullable<ReturnType<DxfParser["parseSync"]>>)=>[...parsed.entities,...Object.values(parsed.blocks).flatMap(b=>b.entities??[])] as unknown as E[];
const pageNames=(parsed:NonNullable<ReturnType<DxfParser["parseSync"]>>)=>allEntities(parsed).filter(e=>e.type==="TEXT"&&e.layer==="TEXTOS"&&e.textHeight===4.5).map(e=>e.text!);
it("opens physical shed layouts, native dimensions, physical profiles and exact takeoff with an independent reader",()=>{
  const p=shed(),before=JSON.stringify(p),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z")),parsed=new DxfParser().parseSync(content)!;
  const entities=allEntities(parsed),pages=pageNames(parsed);
  const texts=entities.filter(e=>e.type==="TEXT").map(e=>e.text!);
  expect(parsed.header.$INSUNITS).toBe(4);
  for(const [layer,style] of Object.entries(CAD_LAYERS)){
    expect(parsed.tables.layer.layers).toHaveProperty(layer);
    expect(parsed.tables.layer.layers[layer].colorIndex).toBe(style.color);
  }
  for(const name of ["INDICE 1","PLANTA","FRONTAL","LATERAL","CORTE A-A","TERCAS E CONTRAVENTOS","PORTICO 1","BASES E CHUMBADORES","BASES POSICOES 1","RASTREIO REACOES 1","NOTAS GERAIS 1","MATERIAIS 1"])expect(pages).toContain(name);
  expect(pages.filter(n=>/^PORTICO \d+$/.test(n))).toEqual(["PORTICO 1"]);
  expect(texts.some(t=>t.startsWith("2× PORTICO:"))).toBe(true);
  expect(texts.some(t=>t.includes("V0 / V4"))).toBe(true);
  expect(content.match(/\nLAYOUT\n/g)).toHaveLength(pages.length+1);
  expect(entities.filter(e=>e.layer==="CARIMBO"&&e.text===CAD_NOTICE)).toHaveLength(pages.length);
  for(let i=1;i<=pages.length;i++)expect(texts).toContain(`Folha ${i} de ${pages.length}`);
  expect(texts.some(t=>t.startsWith("Responsável técnico: ___"))).toBe(true);
  expect(texts.some(t=>t.startsWith("CREA: ___")&&t.includes("ART: ___"))).toBe(true);
  expect(texts).toContain("Galpão INT-8");expect(texts.some(t=>t.includes("16/11/2026")&&t.includes("M49-1"))).toBe(true);
  const dimensions=entities.filter(e=>e.type==="DIMENSION");expect(dimensions.length).toBeGreaterThan(10);
  expect(dimensions.some(d=>d.text?.startsWith("CUMEEIRA"))).toBe(true);
  expect(dimensions.some(d=>d.text?.startsWith("EIXOS TERÇAS"))).toBe(true);
  for(const dim of dimensions){expect(parsed.blocks).toHaveProperty(dim.block!);expect(dim.actualMeasurement).toBeGreaterThan(0);}
  // Independently calculated from 3D coordinates, NOT from project.roof or a generator.
  expect(texts).toContain("EXTENSÃO 6000");expect(texts).toContain("VÃO Y 1-2 4000");
  expect(texts).toContain("EIXOS A-B 6000");
  for(const title of ["PLANTA","FRONTAL","LATERAL","TERCAS E CONTRAVENTOS"]){
    const page=Object.values(parsed.blocks).find(b=>b.entities?.some(e=>(e as unknown as E).text===title))!;
    expect(page.entities.some(e=>e.type==="CIRCLE"&&e.layer==="EIXOS")).toBe(true);
    expect(page.entities.some(e=>e.type==="DIMENSION"&&e.layer==="COTAS")).toBe(true);
  }
  expect(texts).toContain("BORDA/BEIRAL 3000");expect(texts).toContain("CUMEEIRA 4000");
  expect(texts).toContain("EIXOS TERÇAS 3162.278");
  expect(texts.some(t=>t.includes("PC: Ue 150×60×20×2,00"))).toBe(true);
  const frontal=Object.values(parsed.blocks).find(b=>b.entities?.some(e=>e.type==="TEXT"&&(e as unknown as E).text==="FRONTAL"))!;
  const labels=frontal.entities.filter(e=>e.type==="TEXT"&&e.layer==="PERFIS") as unknown as E[];
  expect(labels).toHaveLength(p.workspace.physicalStructure!.pieces.length);
  expect(new Set(labels.map(e=>JSON.stringify(e.startPoint))).size).toBe(labels.length);
  const takeoff=declaredTakeoff(p),pc=takeoff.pieces.find(p=>p.pieceId==="PC")!;
  expect(texts).toContain(String(Number(pc.massKg!.toFixed(3))));
  expect(texts).toContain(String(Number((pc.massKg!/4).toFixed(3))));
  expect(texts.some(t=>t.startsWith(`TOTAL: ${takeoff.totals.quantity} peças`))).toBe(true);
  // Preserve the original 3D model, independently of projected sheet geometry.
  const modelLines=parsed.entities.filter(e=>e.type==="LINE") as unknown as E[];
  expect(modelLines).toHaveLength(p.workspace.physicalStructure!.pieces.length);
  expect(JSON.stringify(p)).toBe(before);
  mkdirSync(".tools/int8",{recursive:true});writeFileSync(".tools/int8/galpao.dxf",content);
});

it("exports A1 through the same entry point and retains numbering, scales and blank professional fields",()=>{
  const p=shed(),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z"),{format:"A1"}),parsed=new DxfParser().parseSync(content)!;
  const pages=pageNames(parsed),texts=allEntities(parsed).filter(e=>e.type==="TEXT").map(e=>e.text!);
  expect(content).toContain("ISO_A1_(841.00_x_594.00_MM)");
  expect(texts.some(t=>t.startsWith("A1 ·"))).toBe(true);
  expect(texts).toContain(`Folha ${pages.length} de ${pages.length}`);
  expect(pageNames(new DxfParser().parseSync(createStructureDxf(p,{format:"A1"}))!)).toEqual(pages);
  expect(()=>createStructureDxf(p,{format:"A0" as "A1"})).toThrow(/Formato CAD/);
  writeFileSync(".tools/int8/galpao-a1.dxf",content);
});

it.each(["profile","steel","rotation","support","support-pending","geometry","connection"])("does not group frames with different %s",change=>{
  const p=shed(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!,catalog=d.physicalCatalog!;
  if(change==="profile"){
    catalog.sections.push({...catalog.sections.find(s=>s.id==="BEAM")!,id:"OTHER",designation:"Outro perfil declarado"});
    catalog.assignments.find(a=>a.pieceId==="V4")!.sectionId="OTHER";
  }
  if(change==="steel"){
    catalog.materials.push({...catalog.materials[0],id:"OTHER",steelGrade:"Outro aço declarado"});
    catalog.assignments.find(a=>a.pieceId==="V4")!.materialId="OTHER";
  }
  if(change==="rotation")catalog.assignments.find(a=>a.pieceId==="V4")!.rotationDeg=90;
  if(change==="support")d.supports.find(s=>s.nodeId==="A4BASE")!.dofs[3]="free";
  if(change==="support-pending")d.supports.find(s=>s.nodeId==="A4BASE")!.dofs[0]="pending";
  if(change==="geometry")g.nodes.find(n=>n.id==="A4")!.x=100;
  if(change==="connection")d.memberConnections.find(c=>c.pieceId==="COL-A4")!.start="pending";
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  expect(pageNames(parsed).filter(n=>/^PORTICO \d+$/.test(n))).toHaveLength(2);
});

it("identifies actual trusses from their chords and keeps grouped original piece IDs",()=>{
  const p=shed(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!;
  g.nodes=[];g.pieces=[];d.physicalRoofFaces=undefined;d.physicalCatalog!.assignments=[];d.supports=[];d.memberConnections=[];d.memberKinds=[];
  for(const y of [0,4000]){
    for(const [id,x,z] of [["A",0,3000],["M",3000,3000],["B",6000,3000],["C",3000,4000]] as const)g.nodes.push({id:id+y,x,y,z});
    for(const [id,start,end,role] of [["TC1","A","C","topChord"],["TC2","C","B","topChord"],["BC1","A","M","bottomChord"],["BC2","M","B","bottomChord"],["W","M","C","web"]] as const){
      const pieceId=id+y;g.pieces.push({id:pieceId,start:start+y,end:end+y,role});
      d.physicalCatalog!.assignments.push({pieceId,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
      d.memberConnections.push({pieceId,start:"rigid",end:"rigid"});d.memberKinds.push({pieceId,kind:"frame"});
    }
    for(const nodeId of ["A"+y,"B"+y])d.supports.push({nodeId,dofs:["fixed","fixed","fixed","free","free","free"]});
  }
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  expect(pageNames(parsed).filter(n=>/^TESOURA \d+$/.test(n))).toEqual(["TESOURA 1"]);
  expect(allEntities(parsed).some(e=>e.text?.includes("TC10 / TC14000"))).toBe(true);
});

it("draws declared bracing without inferring restraint from roofing or unidentified web bars",()=>{
  const p=shed(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  g.pieces.push({id:"CV1",role:"web",start:"A0",end:"B4",label:"Contraventamento de cobertura"});
  d.physicalCatalog!.assignments.push({pieceId:"CV1",materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  const plan=Object.values(parsed.blocks).find(b=>b.entities?.some(e=>(e as unknown as E).text==="TERCAS E CONTRAVENTOS"))!;
  expect(plan.entities.some(e=>e.type==="LWPOLYLINE"&&e.layer==="CONTRAVENTOS")).toBe(true);
  expect(plan.entities.some(e=>e.type==="TEXT"&&(e as unknown as E).text?.includes("CV1:"))).toBe(true);
  expect(axisLetter(25)).toBe("Z");expect(axisLetter(26)).toBe("AA");expect(axisLetter(52)).toBe("BA");
});

it("keeps original locations and repeated-frame marks across three longitudinal axes",()=>{
  const p=shed(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!,catalog=d.physicalCatalog!;
  const ids=new Set(["A0","B0","A0BASE","B0BASE"]);
  for(const n of g.nodes.filter(n=>ids.has(n.id)))g.nodes.push({...n,id:n.id+"-8",y:8000});
  for(const piece of g.pieces.filter(p=>ids.has(p.start)&&ids.has(p.end))){
    const pieceId=piece.id+"-8";g.pieces.push({...piece,id:pieceId,start:piece.start+"-8",end:piece.end+"-8"});
    catalog.assignments.push({...catalog.assignments.find(a=>a.pieceId===piece.id)!,pieceId});
    const c=d.memberConnections.find(c=>c.pieceId===piece.id);if(c)d.memberConnections.push({...c,pieceId});
    const k=d.memberKinds?.find(k=>k.pieceId===piece.id);if(k)d.memberKinds!.push({...k,pieceId});
  }
  for(const s of d.supports.filter(s=>s.nodeId==="A0BASE"||s.nodeId==="B0BASE"))d.supports.push({...s,nodeId:s.nodeId+"-8"});
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!,texts=allEntities(parsed).filter(e=>e.type==="TEXT").map(e=>e.text!);
  expect(pageNames(parsed).filter(n=>/^PORTICO \d+$/.test(n))).toEqual(["PORTICO 1"]);
  expect(texts.some(t=>t.startsWith("3× PORTICO:"))).toBe(true);
  expect(texts).toContain("VÃO Y 2-3 4000");expect(texts).toContain("EIXOS 2-3 4000");
  expect(texts.some(t=>t.includes("eixo 3")&&t.includes("8000"))).toBe(true);
});

it("exports only model-bound experimental reactions and keeps missing, forged or stale results pending",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  try{
    const p=m49GarageProject(),prepared=await adaptLoadedMixedProject(p),out=await runLocalMixed(JSON.stringify(prepared.request));
    if(out.status!=="completed")throw Error("Expected real Python result");
    const packet=JSON.stringify({prepared,result:out.result,execution:out.execution}),receipt=await prepareCadReactions(p,packet);
    const content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z"),{reactions:receipt}),parsed=new DxfParser().parseSync(content)!;
    expect(pageNames(parsed)).toContain("REACOES 1");
    const texts=allEntities(parsed).filter(e=>e.type==="TEXT").map(e=>e.text!);
    expect(texts.some(t=>t.includes(receipt.inputSha256))).toBe(true);
    expect(texts).toContain("G_ONLY");expect(texts).toContain("W_ONLY");
    expect(texts).toContain("3.6");expect(texts).toContain("-5.4"); // independent 0.6*24/4 and -0.9*24/4 kN
    expect(texts.some(t=>t.includes("PENDENTE DE PROJETO (A4/A5)"))).toBe(true);
    writeFileSync(".tools/int8/garagem-reacoes.dxf",content);
    const forged=createStructureDxf(p,{reactions:{inputSha256:receipt.inputSha256}});
    expect(pageNames(new DxfParser().parseSync(forged)!)).not.toContain("REACOES 1");
    p.workspace.spatialPreparation!.loading!.roofArea[0].knM2=.7;
    const stale=createStructureDxf(p,{reactions:receipt});expect(stale).toContain("resultado desatualizado");
    expect(pageNames(new DxfParser().parseSync(stale)!)).not.toContain("REACOES 1");
    await expect(prepareCadReactions(p,packet)).rejects.toThrow();
  }finally{vi.unstubAllEnvs();}
},25000);

it("keeps absent profiles/weights/roof heights pending and prevents control-character DXF injection",()=>{
  const p=m49GarageProject();p.workspace.spatialPreparation!.physicalRoofFaces=undefined;
  p.name="Nome\n0\nENDSEC\n";
  const result=createStructureDxf(p,new Date("2026-11-16T15:00:00Z"));
  const parsed=new DxfParser().parseSync(result)!;
  expect(result).toContain("PENDENTE [PURLIN]");expect(result).toContain("PESO PENDENTE");
  expect(result).toContain("cobertura física não declarada");
  expect(result).not.toContain("CUMEEIRA <>");expect(parsed.entities.length).toBeGreaterThan(0);
  expect(result).toContain(CAD_NOTICE);
});

it("preserves the provisional status and declared edition of normative references in general notes",()=>{
  const p=shed();p.workspace.spatialPreparation!.normativeProvenance=[{
    id:"wind-walls-nbr6123",normativeStatus:"PROVISIONAL",standard:"ABNT NBR 6123",edition:"Edição declarada para ensaio CAD",
    origin:"Referência sintética fornecida no modelo",reason:"Teste de rastreabilidade, sem validação normativa ou coeficientes novos.",
  }];
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  const notes=Object.values(parsed.blocks).flatMap(b=>b.entities?.some(e=>(e as unknown as E).text?.startsWith("NOTAS GERAIS"))?b.entities:[]) as unknown as E[];
  const texts=notes.filter(e=>e.type==="TEXT").map(e=>e.text).join(" ");
  expect(texts).toContain("PROVISÓRIO — ABNT NBR 6123");expect(texts).toContain("Edição declarada para ensaio CAD");
  expect(texts).toContain("Synthetic isotropic reference");expect(texts).toContain("M49-1");
});

it("dimensions both edges of a single slope and intersects roof overhangs at the support section",()=>{
  const p=shed();
  p.workspace.spatialPreparation!.physicalRoofFaces!.faces=[{
    id:"SINGLE",outer:[[0,-500,3000],[6000,-500,4000],[6000,4500,4000],[0,4500,3000],[0,-500,3000]],
    holes:[],supportPieceIds:["PA","PB"],source:"Uma água com balanços declarados",revision:"TEST-1"
  }];
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  const all=[...parsed.entities,...Object.values(parsed.blocks).flatMap(b=>b.entities??[])] as unknown as E[];
  const labels=all.filter(e=>e.type==="TEXT").map(e=>e.text);
  expect(labels).toContain("BORDA/BEIRAL 3000");expect(labels).toContain("BORDA/BEIRAL 4000");
  expect(labels.some(t=>t?.startsWith("CUMEEIRA"))).toBe(false);
  const section=Object.values(parsed.blocks).find(b=>b.entities?.some(e=>e.type==="TEXT"&&(e as unknown as E).text==="CORTE A-A"))!;
  const roof=section.entities.filter(e=>e.layer==="COBERTURA") as unknown as E[];
  expect(roof).toHaveLength(1);
  const [a,b]=roof[0].vertices!;
  expect(b.x-a.x).toBe(120);expect(b.y-a.y).toBe(20); // 6000 x 1000 mm at 1:50, independent of paper centering
});

it("paginates long profile designations without losing material rows or duplicating layout names",()=>{
  const p=m49GarageProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  g.nodes=[];g.pieces=[];d.physicalRoofFaces=undefined;d.supports=[];d.physicalCatalog!.assignments=[];
  d.physicalCatalog!.sections[0].designation="Perfil físico declarado ".repeat(8);
  for(let i=0;i<40;i++){
    g.nodes.push({id:`A${i}`,x:i*100,y:0,z:3000},{id:`B${i}`,x:i*100,y:4000,z:3000});
    g.pieces.push({id:`P-${i}`,role:"purlin",start:`A${i}`,end:`B${i}`});
    d.physicalCatalog!.assignments.push({pieceId:`P-${i}`,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
  }
  const parsed=new DxfParser().parseSync(createStructureDxf(p))!;
  const all=[...parsed.entities,...Object.values(parsed.blocks).flatMap(b=>b.entities??[])] as unknown as E[];
  const titles=all.filter(e=>e.type==="TEXT"&&/^MATERIAIS \d+$/.test(e.text??"")).map(e=>e.text!);
  expect(titles.length).toBeGreaterThan(1);expect(new Set(titles).size).toBe(titles.length);
  const ids=all.filter(e=>e.layer==="MATERIAIS"&&e.type==="TEXT"&&/^P-\d+$/.test(e.text??"")).map(e=>e.text);
  expect(ids).toHaveLength(40);expect(new Set(ids).size).toBe(40);
});
