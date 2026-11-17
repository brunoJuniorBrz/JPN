/**
 * Native PR #141 end-to-end CAD experiment using the dimensional takeoff
 * reconstructed for Tom's roof. NO PDF/CAD import, no site approval.
 * 
 * Crucial: original plan has insufficient XYZ positions, joint details and
 * support restraints. The six rectangles below are labelled a study layout,
 * not survey coordinates. Four loose U pieces are staged OUTSIDE the roof,
 * solely to make omission from the takeoff impossible. The experimental
 * generated PDF must not be mistaken for the approved building.
 */
import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { planningExample } from "@/domain/planning-example";
import { declaredStructureSchema } from "@/domain/declared-structure";
import { physicalRoofFacesSchema, inspectPhysicalRoofFaces } from "@/domain/physical-roof-faces";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { transferDeclaredTakeoff } from "@/domain/declared-takeoff";
import { packageTakeoff } from "./package-source";
import { createCompletePackage,packageCutting } from "./complete-package";

const SOURCE = "Tom / Alan, planta baixa(2).pdf; reconstrução comercial JPN 17-11-2026. Posições das seis faces esquemáticas, NÃO levantamento de campo.";
const REV = "TOM-ESTUDO-1";
const NOMINAL = [
  {id:"F1", title:"Corpo principal superior", x:3.78, y:0, dx:5.38, dy:9.02},
  {id:"F2", title:"Corpo principal inferior", x:6.45, y:9.02, dx:2.71, dy:5.26},
  {id:"F3", title:"Bloco central", x:2.67, y:9.02, dx:3.78, dy:5.48},
  {id:"F4", title:"Bloco esquerdo", x:0, y:7.14, dx:2.65, dy:5.06},
  {id:"F5", title:"Faixa de ligação", x:2.65, y:7.14, dx:1.13, dy:1.88},
  {id:"F6", title:"Recorte", x:2.18, y:12.20, dx:.49, dy:1.38},
] as const;

function buildTom(){
  const p=planningExample();
  p.id="a1122334-5566-4788-899a-aabbccddeeff";
  p.name="Tom - cobertura de seis trechos - CONFERÊNCIA";
  p.client="Obra do Tom";
  p.category="Cobertura metálica";
  p.description="Ensaio CAD nativo PR #141 a partir das medidas transcritas do orçamento e planta de Alan.";
  p.technicalNotes="NÃO É PLANTA DE LOCAÇÃO FINAL. Trechos dispostos esquematicamente; conferir encontros e posição real dos elementos. 2 tesouras SEM diagonais. Quatro peças avulsas SEM locação. Alturas de apoio não informadas: Z=3000 mm é referência de desenho hipotética, não medida da obra. Banzo superior 5.41 m cotado vs 5.4167 m pelos montantes: discrepância de arredondamento. Vento, ancoragens, soldas, travamentos, grau do aço e dimensionamento pendentes. Sem aprovação estrutural.";
  p.workspace.cutting={kerfMm:3,endTrimMm:5,minimumRemnantMm:300,useFabrication:false};
  // Always use stable unique IDs for repeated parts; no invented joint connectivity.
  type Node={id:string;x:number;y:number;z:number};
  type Piece={id:string;role:"topChord"|"bottomChord"|"web"|"purlin"|"beam";start:string;end:string;label:string;group:string};
  const nodes:Node[]=[],pieces:Piece[]=[];
  const coordIds=new Map<string,string>();
  function point(x:number,y:number,z:number):string{
    const key=[x,y,z].map(n=>n.toFixed(5)).join("/");
    if(coordIds.has(key))return coordIds.get(key)!;
    const id="N"+(nodes.length+1);nodes.push({id,x,y,z});coordIds.set(key,id);return id;
  }
  function bar(id:string,role:Piece["role"],a:[number,number,number],b:[number,number,number],label:string,group:string){
    pieces.push({id,role,start:point(...a),end:point(...b),label,group});
  }
  // Main trusses: the nominal drawing reports lower 5.37 m, top 5.41 m and
  // five web heights. Exact implied upper geometric length is ~5.416733 m.
  for(const [index,y] of [0,9020].entries()){
    const x0=3780,dx=[0,1342.5,2685,4027.5,5370],rise=[300,480,650,830,1010];
    bar(`BI_${index+1}`,"bottomChord",[x0,y,3000],[x0+5370,y,3000],"Banzo inferior U 75x40x2.65","TESOURA-SEM-DIAGONAIS");
    bar(`BS_${index+1}`,"topChord",[x0,y,3300],[x0+5370,y,4010],"Banzo superior U 75x40x2.65","TESOURA-SEM-DIAGONAIS");
    dx.forEach((v,j)=>bar(`M_${index+1}_${j+1}`,"web",[x0+v,y,3000],[x0+v,y,3000+rise[j]],"Montante U 75x40x2.65","TESOURA-SEM-DIAGONAIS"));
  }
  // Actual nominal piece lengths from Tom's material reconstruction.
  // These lines' X positions are SCHEMATIC because the original drawing does
  // not identify each support or splice in global XYZ.
  let index=0;
  const purlin=(x:number,y:number,len:number)=>bar(`T_${++index}`,"purlin",[x*1000,y*1000,3300],[x*1000,(y+len)*1000,3300],
    "Terca Ue 75x40x15x2.65","TERCAS-PREVISTAS");
  [6.65,7.62,8.60].forEach(x=>{purlin(x,0,4.51);purlin(x,4.51,4.51);purlin(x,9.02,5.26);});
  [4.45,5.42].forEach(x=>{purlin(x,0,4.51);purlin(x,4.51,4.51);});
  // 10 4.51 m, 3 5.26 m = 13 pieces.
  [3.05,4.20,5.40].forEach(x=>purlin(x,9.02,5.48));
  [0.45,1.78].forEach(x=>purlin(x,7.14,5.06));
  [2.85,3.42].forEach(x=>purlin(x,7.14,1.88));
  [0.95,2.15].forEach(x=>purlin(x,7.14,3.98));
  // 4 loose pieces confirmed same U profile, but NOT installed in drawings.
  // Place them in separate negative-Y staging zone labelled 'SEM LOCACAO'.
  [5.08,2.41,3.48,2.95].forEach((length,i)=>bar(`AV_${i+1}`,"beam",
    [0,-(1600+i*600),3000],[length*1000,-(1600+i*600),3000],
    "PECA AVULSA - SEM LOCACAO - U 75x40x2.65","ESTOQUE-SEM-LOCACAO"));
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    provenance:SOURCE,revision:REV,nodes,pieces,
  });
  const draft=newSpatialPreparation(p);
  draft.physicalCatalog={
    schema_version:"jpn.physical-catalog/1",
    materials:[{id:"STEEL_TOM",steelGrade:"NAO-INFORMADO (SIMULACAO COMERCIAL)",
      eGpa:null,gGpa:null,nu:null,density:undefined,
      materialSource:"Aço não especificado no desenho/orçamento do Alan",materialRevision:REV}],
    sections:[
      {id:"U75",designation:"U 75x40x2.65 mm",areaCm2:null,iyCm4:null,izCm4:null,jCm4:null,sectionSource:SOURCE,sectionRevision:REV},
      {id:"UE75",designation:"Ue 75x40x15x2.65 mm",areaCm2:null,iyCm4:null,izCm4:null,jCm4:null,sectionSource:SOURCE,sectionRevision:REV},
    ],
    assignments:pieces.map(v=>({pieceId:v.id,materialId:"STEEL_TOM",sectionId:v.role==="purlin"?"UE75":"U75",rotationDeg:null})),
  };
  // NO invented structural supports or load combinations.
  // The XY arrangement below matches declared face sizes and total area, not
  // surveyed joins/actual absolute coordinates. 12% is only a budget premise.
  draft.physicalRoofFaces=physicalRoofFacesSchema.parse({
    schema_version:"jpn.physical-roof-faces/1",units:"mm",source:SOURCE,revision:REV,
    faces:NOMINAL.map(f=>{
      const x=f.x*1000,y=f.y*1000,dx=f.dx*1000,dy=f.dy*1000;
      const zz=(xx:number)=>3300+.12*(xx-x);
      return {id:f.id,source:`${SOURCE} / ${f.title} / COTAS DE AREA; LOCALIZACAO PENDENTE`,
        revision:REV,supportPieceIds:[],
        outer:[[x,y,zz(x)],[x+dx,y,zz(x+dx)],[x+dx,y+dy,zz(x+dx)],[x,y+dy,zz(x)],[x,y,zz(x)]] as [number,number,number][],
        holes:[]};
    }),
  });
  p.workspace.spatialPreparation=draft;
  p.workspace.dimensionalChecks=["BS_1","BS_2"].map(pieceId=>({
    pieceId,statedLengthMm:5410,
    source:"Cota do banzo superior no desenho do Alan; valor sujeito a revisão",revision:REV,
    note:"Comprimento entre nós com 5370 mm horizontais e 710 mm de desnível; verificar eixo/face e montagem.",
  }));
  return transferDeclaredTakeoff(p,0);
}

it("exports real Tom dimensional takeoff using new PR141 package engine (study, not surveyed placement)",async()=>{
  const p=buildTom(),report=packageTakeoff(p),pieces=p.workspace.physicalStructure!.pieces;
  expect(pieces.filter(v=>v.role==="purlin")).toHaveLength(22);
  expect(pieces.filter(v=>v.role!=="purlin")).toHaveLength(18);
  const area=inspectPhysicalRoofFaces(p.workspace.spatialPreparation!.physicalRoofFaces!).faces.reduce((s,f)=>s+f.horizontalAreaM2,0);
  expect(area).toBeCloseTo(99.7062,4);
  const stockByGroup=Object.fromEntries(report.groups.map(g=>[g.key,6000]));
  const cut=packageCutting(p,{stockByGroup});
  const purlins=cut.groups.filter(g=>g.profile.includes("Ue 75"));
  expect(purlins.flatMap(g=>g.bars)).toHaveLength(20);
  const barPriceCentsByGroup=Object.fromEntries(declaredCommercialGroups(p).map(g=>
    [g.key,g.label.startsWith("Ue ")?15500:13500]));
  const result=await createCompletePackage(p,{format:"A3",issuedAt:new Date("2026-11-17T20:00:00.000Z"),
    stockByGroup,barPriceCentsByGroup});
  expect(result.manifest.cuttingAvailable).toBe(true);
  expect(result.manifest.fabricationRelease).toBe(false);
  expect(result.manifest.computedStructuralApproval).toBe(false);
  expect(result.manifest.totals.quantity).toBe(40);
  expect(result.manifest.unlocatedPieceIds).toHaveLength(4);
  expect(result.manifest.commercialCostMainCents).toBe(377500);
  expect(result.manifest.commercialCostCombinedCents).toBe(418000);
  expect(result.manifest.commercialCostPendingIncrementalCents).toBe(40500);
  expect(result.manifest.sourceDimensionReviews.filter(r=>r.status==="PENDENTE")).toHaveLength(2);
  expect(result.files.some(f=>f.name==="materiais/itens-a-confirmar.csv")).toBe(true);
  const uGroup=cut.groups.find(g=>g.profile.startsWith("U 75"));
  expect(uGroup).toBeDefined();
  expect(uGroup!.bars).toHaveLength(8);
  expect(uGroup&&"confirmedStandaloneBars" in uGroup?uGroup.confirmedStandaloneBars:null).toBe(5);
  // Optimum certificate for THIS instance: 7x6m holds only 42.000mm
  // while the 18 source members exceed it even BEFORE kerf and end trim.
  const uPieces=report.pieces.filter(p=>!p.profile.startsWith("Ue "));
  const rawTotal=uPieces.reduce((v,p)=>v+p.lengthMm,0);
  expect(rawTotal).toBeGreaterThan(7*6000);
  expect(uGroup!.bars.flatMap(b=>b.pieces).map(p=>p.id).sort()).toEqual(uPieces.map(p=>p.pieceId).sort());
  for(const b of uGroup!.bars)
    expect(b.pieces.reduce((v,p)=>v+p.lengthMm,0)+b.kerfMm+b.trimMm+b.remainderMm).toBeCloseTo(6000,9);
  expect(cut.groups.filter(g=>g.profile.includes("Ue 75")).flatMap(g=>g.bars)).toHaveLength(20);
  const out=".tools/complete-package/tom";
  mkdirSync(out,{recursive:true});
  writeFileSync(`${out}/pacote.zip`,result.zip);
  for(const f of result.files){
    const path=`${out}/${f.name}`;
    mkdirSync(path.slice(0,path.lastIndexOf("/")),{recursive:true});
    writeFileSync(path,f.bytes);
  }
  const commercialBarsU=cut.groups.filter(g=>!g.profile.includes("Terca Ue")).reduce((s,g)=>s+g.bars.length,0);
  writeFileSync(`${out}/auditoria-tom.json`,JSON.stringify({
    source:"Transcrição dimensional; SEM plantas CAD importadas, SEM locação física validada",
    declaredFaces:NOMINAL,areaProjectedM2:area,
    originalLengthTrussTopM:5.41,geometricLengthTrussTopM:Math.hypot(5.37,.71),
    declaredPieceCount:40,purlinCutPieces:22,UcutPieces:18,
    purlinBars:20,UBarsNative:commercialBarsU,
    UCombinedCommercialReferenceBars:8,
    UCutGroups:cut.groups.filter(g=>!g.profile.includes("Terca Ue")).map(g=>({profile:g.profile,bars:g.bars.length})),
    caveats:[
      "Contorno das seis faces posicionado esquematicamente; a planta nao informa relacao XYZ completa.",
      "Z=3000 mm de referencia HIPOTETICA; altura real de apoio nao informada.",
      "4 pecas avulsas desenhadas no ESTOQUE, fora da cobertura. SEM LOCACAO definida.",
      "As cotas do banzo superior e as alturas dos montantes nao fecham exatamente.",
      "Contato dos montantes intermediarios com banzos nao foi declarado como ligacao mecanica.",
      "Plano de corte comercial por material pode diferir do agrupamento por role da API nativa.",
      "Aco, propriedades efetivas, vento, apoio, juntas, contraventamento, ancoragem: pendentes.",
    ],
    sheets:result.manifest.pages.map(s=>({name:s.name,title:s.title})),
  },null,2));
},120000);
