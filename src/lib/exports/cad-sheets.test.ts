import {expect,it} from "vitest";
import DxfParser from "dxf-parser";
import {mkdirSync,writeFileSync} from "node:fs";
import {createStructureDxf} from "./cad";
import {CAD_NOTICE} from "./cad-sheets";
import {m49GarageProject} from "@/domain/test-support/m49-garage-project";
import {declaredTakeoff} from "@/domain/declared-takeoff";

function shed(){
  const p=m49GarageProject(),g=p.workspace.physicalStructure!,d=p.workspace.spatialPreparation!;
  p.name="Galpão INT-8";
  g.nodes.filter(n=>n.id.startsWith("C")).forEach(n=>n.z=4000);
  for(const id of ["A0","A4","B0","B4"]){const n=g.nodes.find(n=>n.id===id)!;g.nodes.push({...n,id:id+"BASE",z:0});g.pieces.push({id:"COL-"+id,role:"column",start:id+"BASE",end:id});d.physicalCatalog!.assignments.push({pieceId:"COL-"+id,materialId:"STEEL",sectionId:"BEAM",rotationDeg:0});}
  d.supports=d.supports.map(s=>({...s,nodeId:s.nodeId+"BASE"}));
  d.physicalCatalog!.materials[0].density={kgM3:7850,source:"Densidade declarada do ensaio",revision:"TEST-1"};
  d.physicalCatalog!.sections.find(s=>s.id==="PURLIN")!.designation="Ue 150×60×20×2,00";
  d.physicalRoofFaces={schema_version:"jpn.physical-roof-faces/1",units:"mm",source:"Superfícies físicas do ensaio INT8",revision:"TEST-1",faces:[
    {id:"LEFT",outer:[[0,0,3000],[3000,0,4000],[3000,4000,4000],[0,4000,3000],[0,0,3000]],holes:[],supportPieceIds:["PA","PC"],source:"Água esquerda declarada",revision:"TEST-1"},
    {id:"RIGHT",outer:[[3000,0,4000],[6000,0,3000],[6000,4000,3000],[3000,4000,4000],[3000,0,4000]],holes:[],supportPieceIds:["PC","PB"],source:"Água direita declarada",revision:"TEST-1"}]};
  return p;
}
type E={type:string;layer:string;text?:string;actualMeasurement?:number;block?:string;vertices?:{x:number;y:number;z?:number}[]};
it("opens physical shed layouts, native dimensions, physical profiles and exact takeoff with an independent reader",()=>{
  const p=shed(),before=JSON.stringify(p),content=createStructureDxf(p,new Date("2026-11-16T15:00:00Z")),parsed=new DxfParser().parseSync(content)!;
  const entities=[...parsed.entities,...Object.values(parsed.blocks).flatMap(b=>b.entities??[])] as unknown as E[];
  const texts=entities.filter(e=>e.type==="TEXT").map(e=>e.text!);
  expect(parsed.header.$INSUNITS).toBe(4);
  for(const layer of ["COTAS","PERFIS","TEXTOS","CARIMBO","EIXOS","COBERTURA","APOIOS","MATERIAIS"])expect(parsed.tables.layer.layers).toHaveProperty(layer);
  for(const name of ["PLANTA","FRONTAL","LATERAL","CORTE A-A","MATERIAIS 1"])expect(texts).toContain(name);
  expect(content.match(/\nLAYOUT\n/g)).toHaveLength(6); // model + five independent native layout objects
  expect(texts.filter(t=>t===CAD_NOTICE)).toHaveLength(5);
  expect(texts).toContain("Galpão INT-8");expect(texts.some(t=>t.includes("16/11/2026")&&t.includes("M49-1"))).toBe(true);
  const dimensions=entities.filter(e=>e.type==="DIMENSION");expect(dimensions.length).toBeGreaterThan(10);
  expect(dimensions.some(d=>d.text?.startsWith("CUMEEIRA"))).toBe(true);
  expect(dimensions.some(d=>d.text?.startsWith("EIXOS TERÇAS"))).toBe(true);
  for(const dim of dimensions){expect(parsed.blocks).toHaveProperty(dim.block!);expect(dim.actualMeasurement).toBeGreaterThan(0);}
  // Independently calculated from 3D coordinates, NOT from project.roof or a generator.
  expect(texts).toContain("EXTENSÃO 6000");expect(texts).toContain("VÃO Y 4000");
  expect(texts).toContain("BORDA/BEIRAL 3000");expect(texts).toContain("CUMEEIRA 4000");
  expect(texts).toContain("EIXOS TERÇAS 3162.278");
  expect(texts.some(t=>t.includes("PC: Ue 150×60×20×2,00"))).toBe(true);
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
  expect(roof).toHaveLength(1);expect(roof[0].vertices).toEqual([{x:40,y:150},{x:160,y:170}]);
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
