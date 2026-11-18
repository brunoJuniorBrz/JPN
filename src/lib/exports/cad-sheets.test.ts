import {expect,it,vi} from "vitest";
import DxfParser from "dxf-parser";
import {mkdirSync,writeFileSync} from "node:fs";

// Each test writes its own review artifact; do not depend on test order.
mkdirSync(".tools/int8",{recursive:true});
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
type E={type:string;layer:string;text?:string;textHeight?:number;actualMeasurement?:number;block?:string;startPoint?:{x:number;y:number};vertices?:{x:number;y:number;z?:number}[];center?:{x:number;y:number};radius?:number;extendedData?:{customStrings?:string[]}};
const dimensionLabel=(e:E)=>e.extendedData?.customStrings?.[0];
const allEntities=(p:NonNullable<ReturnType<DxfParser["parseSync"]>>)=>[...p.entities,...Object.values(p.blocks).flatMap(b=>b.entities??[])] as unknown as E[];
const pageNames=(p:NonNullable<ReturnType<DxfParser["parseSync"]>>)=>allEntities(p).filter(e=>e.type==="TEXT"&&e.layer==="TEXTOS"&&e.textHeight===4.5).map(e=>e.text!);
const texts=(p:NonNullable<ReturnType<DxfParser["parseSync"]>>)=>allEntities(p).filter(e=>e.type==="TEXT").map(e=>e.text!);
const parse=(s:string)=>new DxfParser().parseSync(s)!;
const views=(p:ReturnType<typeof parse>)=>Object.entries(p.blocks).filter(([n])=>n.startsWith("JPN_VISTA_")).map(([,b])=>b.entities as unknown as E[]);

it("consolidates shed with a separate index sheet, native viewports and traceable marks",()=>{
  const p=shed(),before=JSON.stringify(p),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z")),parsed=parse(content),entities=allEntities(parsed),pages=pageNames(parsed),t=texts(parsed);
  expect(pages).toHaveLength(7);
  expect(pages).toEqual(["Plantas de cobertura e estrutura","Elevações e corte transversal","Pórtico — tipo 1 (2×)","Locação de bases e chumbadores","Notas gerais","Lista de materiais e resumo por perfil","Índice geral de pranchas"]);
  expect(content.match(/\nVIEWPORT\n/g)).toHaveLength(14); // seven details + seven paper viewports
  expect(content.match(/\nLAYOUT\n/g)).toHaveLength(8);
  expect(t).toContain("Índice completo");expect(t.some(s=>/^Terças e contraventamentos · 1:(20|25|50|75|100)$/.test(s))).toBe(true);
  for(const [layer,style] of Object.entries(CAD_LAYERS))expect(parsed.tables.layer.layers[layer].colorIndex).toBe(style.color);
  expect(parsed.header.$INSUNITS).toBe(4);
  expect(entities.filter(e=>e.layer==="CARIMBO"&&e.text===CAD_NOTICE)).toHaveLength(pages.length);
  for(let i=1;i<=pages.length;i++)expect(t).toContain(`Folha ${i} de ${pages.length}`);
  expect(t.some(s=>s.startsWith("Responsável técnico: ___"))).toBe(true);
  expect(t.some(s=>s.startsWith("CREA: ___")&&s.includes("ART: ___"))).toBe(true);
  expect(t).toContain("Quadro de revisões");expect(t).toContain("Galpão INT-8");expect(t).toContain("Data: 16/11/2026");expect(t).toContain("Revisão: M49-1");
  for(const label of ["VÃO Y 1-2","EIXOS A-B","BORDA/BEIRAL","CUMEEIRA","EIXOS TERÇAS"])expect(entities.some(e=>e.type==="DIMENSION"&&dimensionLabel(e)===label)).toBe(true);
  for(const value of ["6000","4000","3000","3162.278"])expect(t).toContain(value);
  for(const dim of entities.filter(e=>e.type==="DIMENSION")){expect(parsed.blocks).toHaveProperty(dim.block!);expect(dim.actualMeasurement).toBeGreaterThan(0);expect(dim.text).toBe("<>");}
  for(const view of views(parsed)){
    // A roof cover view intentionally omits axis bubbles to keep it clear.
    expect(view.some(e=>e.type==="DIMENSION"||e.type==="LWPOLYLINE")).toBe(true);
    expect(view.filter(e=>e.type==="TEXT").some(e=>e.text?.includes("Ue 150"))).toBe(false);
    const labels=view.filter(e=>e.type==="TEXT"&&e.layer==="MARCAS");
    expect(new Set(labels.map(e=>JSON.stringify(e.startPoint))).size).toBe(labels.length);
    for(const label of labels)expect(label.text).toMatch(/^(C|V|T|M|D|BS|BI)\d+(?: ×\d+)?$/);
  }
  expect(t.join(" ")).toContain("=PC"); // full physical ID survives type-mark grouping
  const takeoff=declaredTakeoff(p),pc=takeoff.pieces.find(p=>p.pieceId==="PC")!;
  expect(t).toContain(String(Number(pc.massKg!.toFixed(3))));expect(t).toContain(String(Number((pc.massKg!/4).toFixed(3))));
  expect(t.some(s=>s.startsWith(`ESCOPO PRINCIPAL (SEM AVULSAS): ${takeoff.totals.quantity} peças`))).toBe(true);
  expect(t).toContain("Resumo por perfil e material");
  expect(parsed.entities.filter(e=>e.type==="LINE")).toHaveLength(p.workspace.physicalStructure!.pieces.length);
  expect(JSON.stringify(p)).toBe(before);
  mkdirSync(".tools/int8",{recursive:true});writeFileSync(".tools/int8/galpao.dxf",content);
});

it("keeps A1/A3 and both existing entry signatures, numbering and blank professional fields",()=>{
  const p=shed(),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z"),{format:"A1"}),parsed=parse(content);
  expect(content).toContain("ISO_A1_(841.00_x_594.00_MM)");expect(pageNames(parsed)).toHaveLength(7);
  expect(pageNames(parse(createStructureDxf(p,{format:"A1"})))).toEqual(pageNames(parsed));
  expect(texts(parsed)).toContain("Folha 7 de 7");expect(()=>createStructureDxf(p,{format:"A0" as "A1"})).toThrow(/Formato CAD/);
  writeFileSync(".tools/int8/galpao-a1.dxf",content);
});

it.each(["profile","steel","rotation","support","support-pending","geometry","connection"])("does not group frames with different %s",change=>{
  const p=shed(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!,catalog=d.physicalCatalog!;
  if(change==="profile"){catalog.sections.push({...catalog.sections.find(s=>s.id==="BEAM")!,id:"OTHER",designation:"Outro perfil declarado"});catalog.assignments.find(a=>a.pieceId==="V4")!.sectionId="OTHER";}
  if(change==="steel"){catalog.materials.push({...catalog.materials[0],id:"OTHER",steelGrade:"Outro aço declarado"});catalog.assignments.find(a=>a.pieceId==="V4")!.materialId="OTHER";}
  if(change==="rotation")catalog.assignments.find(a=>a.pieceId==="V4")!.rotationDeg=90;
  if(change==="support")d.supports.find(s=>s.nodeId==="A4BASE")!.dofs[3]="free";
  if(change==="support-pending")d.supports.find(s=>s.nodeId==="A4BASE")!.dofs[0]="pending";
  if(change==="geometry")g.nodes.find(n=>n.id==="A4")!.x=100;
  if(change==="connection")d.memberConnections.find(c=>c.pieceId==="COL-A4")!.start="pending";
  expect(pageNames(parse(createStructureDxf(p))).filter(n=>n.startsWith("Pórtico — tipo"))).toHaveLength(2);
});

it("identifies actual trusses, grouping short marks and preserving original IDs in traceability",()=>{
  const p=shed(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!;
  g.nodes=[];g.pieces=[];d.physicalRoofFaces=undefined;d.physicalCatalog!.assignments=[];d.supports=[];d.memberConnections=[];d.memberKinds=[];
  for(const y of [0,4000]){
    for(const [id,x,z] of [["A",0,3000],["M",3000,3000],["B",6000,3000],["C",3000,4000]] as const)g.nodes.push({id:id+y,x,y,z});
    for(const [id,start,end,role] of [["TC1","A","C","topChord"],["TC2","C","B","topChord"],["BC1","A","M","bottomChord"],["BC2","M","B","bottomChord"],["W","M","C","web"]] as const){
      const pieceId=id+y;g.pieces.push({id:pieceId,start:start+y,end:end+y,role});d.physicalCatalog!.assignments.push({pieceId,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
      d.memberConnections.push({pieceId,start:"rigid",end:"rigid"});d.memberKinds.push({pieceId,kind:"frame"});
    }
    for(const nodeId of ["A"+y,"B"+y])d.supports.push({nodeId,dofs:["fixed","fixed","fixed","free","free","free"]});
  }
  const parsed=parse(createStructureDxf(p));expect(pageNames(parsed).filter(n=>n.startsWith("Tesoura — tipo"))).toEqual(["Tesoura — tipo 1 (2×)"]);
  expect(texts(parsed).join(" ")).toContain("TC14000");expect(texts(parsed)).toContain("Identificação de peças");
});

it("keeps explicitly declared bracing and global location axes without inventing restraints",()=>{
  const p=shed(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  g.pieces.push({id:"CV1",role:"web",start:"A0",end:"B4",label:"Contraventamento de cobertura"});d.physicalCatalog!.assignments.push({pieceId:"CV1",materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});
  const parsed=parse(createStructureDxf(p)),plan=views(parsed)[1];
  expect(plan.some(e=>e.type==="LWPOLYLINE"&&e.layer==="CONTRAVENTOS")).toBe(true);expect(plan.some(e=>e.text==="D1")).toBe(true);
  expect(axisLetter(25)).toBe("Z");expect(axisLetter(26)).toBe("AA");expect(axisLetter(52)).toBe("BA");
});

it("keeps locations and grouped piece marks across three longitudinal axes",()=>{
  const p=shed(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!,catalog=d.physicalCatalog!,ids=new Set(["A0","B0","A0BASE","B0BASE"]);
  for(const n of g.nodes.filter(n=>ids.has(n.id)))g.nodes.push({...n,id:n.id+"-8",y:8000});
  for(const piece of g.pieces.filter(p=>ids.has(p.start)&&ids.has(p.end))){
    const pieceId=piece.id+"-8";g.pieces.push({...piece,id:pieceId,start:piece.start+"-8",end:piece.end+"-8"});catalog.assignments.push({...catalog.assignments.find(a=>a.pieceId===piece.id)!,pieceId});
    const c=d.memberConnections.find(c=>c.pieceId===piece.id);if(c)d.memberConnections.push({...c,pieceId});const k=d.memberKinds?.find(k=>k.pieceId===piece.id);if(k)d.memberKinds!.push({...k,pieceId});
  }
  for(const s of d.supports.filter(s=>s.nodeId==="A0BASE"||s.nodeId==="B0BASE"))d.supports.push({...s,nodeId:s.nodeId+"-8"});
  const parsed=parse(createStructureDxf(p)),t=texts(parsed);
  expect(pageNames(parsed).filter(n=>n.startsWith("Pórtico — tipo"))).toEqual(["Pórtico — tipo 1 (3×)"]);
  expect(allEntities(parsed).some(e=>e.type==="DIMENSION"&&dimensionLabel(e)==="VÃO Y 2-3")).toBe(true);
  expect(allEntities(parsed).some(e=>e.type==="DIMENSION"&&dimensionLabel(e)==="EIXOS 2-3")).toBe(true);expect(t.join(" ")).toMatch(/eixo 3; Y=8000/);
});

it("prints only model-bound reactions; missing, forged and stale packets stay pending",async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  try{
    const p=m49GarageProject(),prepared=await adaptLoadedMixedProject(p),out=await runLocalMixed(JSON.stringify(prepared.request));if(out.status!=="completed")throw Error("Expected real Python result");
    const packet=JSON.stringify({prepared,result:out.result,execution:out.execution}),receipt=await prepareCadReactions(p,packet),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z"),{reactions:receipt}),parsed=parse(content),t=texts(parsed);
    expect(t.join(" ")).toContain(receipt.inputSha256);expect(t).toContain("G_ONLY");expect(t).toContain("W_ONLY");expect(t).toContain("3.6");expect(t).toContain("-5.4");
    expect(t).toContain("PENDENTE DE PROJETO (A4/A5)");writeFileSync(".tools/int8/garagem-reacoes.dxf",content);
    const forged=parse(createStructureDxf(p,{reactions:{inputSha256:receipt.inputSha256}}));expect(texts(forged)).not.toContain("G_ONLY");
    p.workspace.spatialPreparation!.loading!.roofArea[0].knM2=.7;
    const stale=parse(createStructureDxf(p,{reactions:receipt}));expect(texts(stale).join(" ")).toContain("resultado desatualizado");expect(texts(stale)).not.toContain("G_ONLY");await expect(prepareCadReactions(p,packet)).rejects.toThrow();
  }finally{vi.unstubAllEnvs();}
},25000);

it("retains pending data and guards control-character DXF injection",()=>{
  const p=m49GarageProject();p.workspace.spatialPreparation!.physicalRoofFaces=undefined;p.name="Nome\n0\nENDSEC\n";
  const result=createStructureDxf(p),parsed=parse(result);
  expect(result).toContain("PENDENTE [PURLIN]");expect(result).toContain("PENDENTE");expect(result).toContain("cobertura física não declarada");expect(allEntities(parsed).some(e=>dimensionLabel(e)==="CUMEEIRA")).toBe(false);expect(parsed.entities.length).toBeGreaterThan(0);expect(result).toContain(CAD_NOTICE);
});

it("keeps editions and provisional status while moving source metadata and internal IDs to the trace footer",()=>{
  const p=shed();p.workspace.spatialPreparation!.normativeProvenance=[{id:"wind-walls-nbr6123",normativeStatus:"PROVISIONAL",standard:"ABNT NBR 6123",edition:"Edição declarada para ensaio CAD",origin:"Referência sintética fornecida no modelo",reason:"Teste de rastreabilidade, sem validação normativa ou coeficientes novos."}];
  const parsed=parse(createStructureDxf(p)),t=texts(parsed).join(" ");
  expect(t).toContain("PROVISÓRIO — ABNT NBR 6123");expect(t).toContain("Edição declarada para ensaio CAD");expect(t).toContain("Synthetic isotropic reference");expect(t).toContain("M49-1");
  const normal=allEntities(parsed).filter(e=>e.type==="TEXT"&&e.textHeight===2.5).map(e=>e.text).join(" ");expect(normal).not.toContain("Synthetic isotropic reference");expect(normal).not.toContain("input_sha256");
});

it("deduplicates the section roof and attaches ridge elevation dimensions to the physical ridge",()=>{
  const parsed=parse(createStructureDxf(shed())),section=views(parsed)[4],roof=section.filter(e=>e.layer==="COBERTURA"&&e.type==="LWPOLYLINE");
  expect(roof).toHaveLength(2);
  const ends=roof.flatMap(e=>e.vertices!),high=Math.max(...ends.map(p=>p.y)),ridge=ends.filter(p=>p.y===high);
  expect(ridge).toHaveLength(2);expect(ridge[0].x).toBe(ridge[1].x);
  const dim=section.find(e=>e.type==="DIMENSION"&&dimensionLabel(e)==="CUMEEIRA") as E&{linearOrAngularPoint2:{x:number;y:number}};
  expect(dim.linearOrAngularPoint2.x).toBe(ridge[0].x);expect(dim.linearOrAngularPoint2.y).toBe(high);
});

it("intersects single-slope overhangs at the actual cut without inventing a ridge",()=>{
  const p=shed();p.workspace.spatialPreparation!.physicalRoofFaces!.faces=[{id:"SINGLE",outer:[[0,-500,3000],[6000,-500,4000],[6000,4500,4000],[0,4500,3000],[0,-500,3000]],holes:[],supportPieceIds:["PA","PB"],source:"Uma água com balanços declarados",revision:"TEST-1"}];
  const parsed=parse(createStructureDxf(p)),t=texts(parsed),roof=views(parsed)[4].filter(e=>e.layer==="COBERTURA"&&e.type==="LWPOLYLINE");
  expect(t).toContain("3000");expect(t).toContain("4000");expect(allEntities(parsed).some(e=>e.type==="DIMENSION"&&dimensionLabel(e)==="CUMEEIRA")).toBe(false);expect(roof).toHaveLength(1);
  const [a,b]=roof[0].vertices!;expect((b.x-a.x)/(b.y-a.y)).toBeCloseTo(6,12);
});

it("groups 40 interchangeable pieces as one type and preserves all original IDs",()=>{
  const p=m49GarageProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  g.nodes=[];g.pieces=[];d.physicalRoofFaces=undefined;d.supports=[];d.physicalCatalog!.assignments=[];d.physicalCatalog!.sections[0].designation="Perfil físico declarado ".repeat(8);
  for(let i=0;i<40;i++){g.nodes.push({id:`A${i}`,x:i*100,y:0,z:3000},{id:`B${i}`,x:i*100,y:4000,z:3000});g.pieces.push({id:`P-${i}`,role:"purlin",start:`A${i}`,end:`B${i}`});d.physicalCatalog!.assignments.push({pieceId:`P-${i}`,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});}
  const parsed=parse(createStructureDxf(p)),t=allEntities(parsed).filter(e=>e.type==="TEXT"&&e.layer==="MATERIAIS"&&/^T\d+$/.test(e.text??"")).map(e=>e.text);
  // One reusable type mark, quantity 40. These are NOT 40 distinct profile types.
  expect(t).toEqual(["T1"]);
  const textDump=texts(parsed).join(" ");
  expect(textDump).toContain("P-0");
  expect(textDump).toContain("P-39");
  expect(textDump).toContain("40");
});
