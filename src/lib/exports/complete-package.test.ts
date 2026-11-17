import {expect,it} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import DxfParser from "dxf-parser";
import {planningExample} from "@/domain/planning-example";
import {m49GarageProject} from "@/domain/test-support/m49-garage-project";
import {generateStructure} from "@/domain/calculations/structure";
import {transferTakeoff} from "@/domain/calculations/project-basis";
import {transferDeclaredTakeoff} from "@/domain/declared-takeoff";
import {resolvePhysicalStructure} from "@/domain/physical-structure";
import {packageTakeoff} from "./package-source";
import {createCompletePackage,packageCutting} from "./complete-package";

function regular(){
  const p=planningExample();p.name="Galpão regular nativo";p.category="Galpão";p.planning!.typology="gable";
  p.workspace.cutting={kerfMm:3,endTrimMm:10,minimumRemnantMm:300,useFabrication:false};
  return transferTakeoff(p,0);
}
function irregular(){
  const p=m49GarageProject();p.name="Cobertura trapezoidal nativa";
  // Parameterized taper in plan, generated directly from the native node model.
  const taper=(x:number,y:number)=>x*(1+y/20000);
  for(const n of p.workspace.physicalStructure!.nodes)n.x=taper(n.x,n.y);
  const catalog=p.workspace.spatialPreparation!.physicalCatalog!;
  catalog.sections.forEach(s=>{s.designation=`Seção sintética ${s.id}`;});
  catalog.materials.forEach(m=>{m.density={kgM3:7850,source:"Densidade explícita do ensaio",revision:"TEST-1"};});
  for(const f of p.workspace.spatialPreparation!.physicalRoofFaces?.faces??[])for(const v of [f.outer,...f.holes].flat())v[0]=taper(v[0],v[1]);
  p.workspace.cutting={kerfMm:3,endTrimMm:10,minimumRemnantMm:300,useFabrication:false};
  return transferDeclaredTakeoff(p,0);
}
const date=new Date("2026-11-17T15:00:00Z");
it.each(["regular","irregular"])("exports %s from native parameters with identical CAD/PDF/material/cutting quantities and hashes",async kind=>{
  const p=kind==="regular"?regular():irregular(),before=JSON.stringify(p),report=packageTakeoff(p);
  const stockByGroup=Object.fromEntries(report.groups.map(g=>[g.key,12000]));
  const result=await createCompletePackage(p,{issuedAt:date,stockByGroup}),plan=packageCutting(p,{stockByGroup});
  expect(JSON.stringify(p)).toBe(before);expect(result.manifest.cuttingAvailable).toBe(true);
  expect(result.manifest.computedStructuralApproval).toBe(false);expect(result.manifest.fabricationRelease).toBe(false);expect(result.manifest.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(plan.groups.flatMap(g=>g.bars.flatMap(b=>b.pieces)).map(p=>p.id).sort()).toEqual(report.pieces.map(p=>p.pieceId).sort());
  // Budget has the exact same raw length, independently of commercial waste.
  expect(p.estimate.materials.filter(l=>l.source==="takeoff").reduce((s,l)=>s+l.manualQuantity!,0)).toBeCloseTo(report.totals.lengthM,9);
  for(const g of plan.groups)for(const b of g.bars)expect(b.pieces.reduce((s,p)=>s+p.lengthMm,0)+b.kerfMm+b.trimMm+b.remainderMm).toBeCloseTo(b.stockMm,9);
  const files=new Map(result.files.map(f=>[f.name,f.bytes])),dxf=new TextDecoder().decode(files.get("cad/pranchas.dxf")!);
  const parsed=new DxfParser().parseSync(dxf)!,lines=parsed.entities.filter(e=>e.type==="LINE") as unknown as {vertices:{x:number;y:number;z:number}[]}[];
  const model=resolvePhysicalStructure(p).model!;expect(lines).toHaveLength(model.pieces.length);
  for(const [i,piece] of model.pieces.entries())expect(lines[i].vertices).toEqual([piece.start,piece.end].map(id=>{const n=model.nodes.find(n=>n.id===id)!;return {x:n.x,y:n.y,z:n.z};}));
  for(const entry of result.manifest.files){
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(files.get(entry.name)!)))).map(b=>b.toString(16).padStart(2,"0")).join("");
    expect(hash).toBe(entry.sha256);
  }
  const task=getDocument({data:new Uint8Array(files.get("pranchas/pranchas.pdf")!),useSystemFonts:true}),pdf=await task.promise;
  expect(pdf.numPages).toBe(result.manifest.pages.length);
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),text=(await page.getTextContent()).items.flatMap(t=>"str"in t?[t.str]:[]).join(" ");
    expect(page.getViewport({scale:1}).width*25.4/72).toBeCloseTo(420,3);
    expect(text).toContain(`Folha ${i} de ${pdf.numPages}`);expect(text).toContain("PRELIMINAR");expect(text).toContain(p.name);
  }
  await task.destroy();
  const out=`.tools/complete-package/${kind}`;mkdirSync(out,{recursive:true});writeFileSync(`${out}/pacote.zip`,result.zip);
  for(const f of result.files){mkdirSync(`${out}/${f.name.split("/").slice(0,-1).join("/")}`,{recursive:true});writeFileSync(`${out}/${f.name}`,f.bytes);}
},60000);
it("keeps missing mass, stock, fabrication and prices pending without inventing a cut plan",async()=>{
  const p=regular();p.planning!.profiles.purlin.stockLengthM=null;p.planning!.profiles.purlin.massKgM=null;
  const result=await createCompletePackage(p,{issuedAt:date});
  expect(result.manifest.cuttingAvailable).toBe(false);expect(result.manifest.totals.massKg).toBeNull();
  expect(result.files.some(f=>f.name==="corte/plano.csv")).toBe(false);expect(result.files.some(f=>f.name==="corte/PENDENTE.txt")).toBe(true);
  p.workspace.cutting.useFabrication=true;expect(()=>packageCutting(p)).toThrow();
});
it("keeps A1 paper dimensions and reports obsolete final lengths",async()=>{
  const p=regular();p.workspace.cutting.useFabrication=true;
  const result=await createCompletePackage(p,{format:"A1",issuedAt:date});
  expect(result.manifest.pages.every(p=>p.widthMm===841&&p.heightMm===594)).toBe(true);expect(result.manifest.cuttingAvailable).toBe(false);
  expect(generateStructure(p).model).not.toBeNull();
});
