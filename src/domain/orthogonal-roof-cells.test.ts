import {describe,expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
import {declaredRoofDistributionSignature,distributeDeclaredRoofActions} from "./declared-roof-load-path";
import type {Project} from "./models";

type XY=[number,number];
const originalSource="Levantamento físico de cobertura ortogonal",revision="Revisão real de superfícies M39 P2";
const ring=(xy:XY[],plane:(x:number,y:number)=>number)=>[...xy,xy[0]].map(([x,y])=>[x,y,plane(x,y)] as [number,number,number]);
const slope=(x:number,_y:number)=>3000+.1*x;
function example(kind:"L"|"opening"="L"):Project{
  const project=m34abProject();
  const xs=kind==="L"?[0,2000,6000]:[0,2000,4000,6000];
  const ys=kind==="L"?[0,2000,5000]:[0,2000,3000,5000];
  const nodes:{id:string;x:number;y:number;z:number}[]=[];
  for(let i=0;i<xs.length;i++)for(let j=0;j<ys.length;j++){
    nodes.push({id:"N"+i+"_"+j,x:xs[i],y:ys[j],z:slope(xs[i],ys[j])});
  }
  const pieces:{id:string;role:"purlin";start:string;end:string}[]=[];
  for(let i=0;i<xs.length;i++)for(let j=0;j<ys.length-1;j++){
    if(kind==="L"&&i===2&&j===1)continue;
    pieces.push({id:"P"+i+"_"+j,role:"purlin",start:"N"+i+"_"+j,end:"N"+i+"_"+(j+1)});
  }
  const used=new Set(pieces.flatMap(p=>[p.start,p.end]));
  project.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    provenance:"Dados de levantamento e apoios físicos explicitamente modelados",
    revision:"M39-P2 geometria de referência",nodes:nodes.filter(n=>used.has(n.id)),pieces,
  });
  const outer=kind==="L"
    ?ring([[0,0],[6000,0],[6000,2000],[2000,2000],[2000,5000],[0,5000]],slope)
    :ring([[0,0],[6000,0],[6000,5000],[0,5000]],slope);
  const holes=kind==="opening"?[
    ring([[2000,2000],[2000,3000],[4000,3000],[4000,2000]],slope),
  ]:[];
  project.workspace.spatialPreparation!.physicalRoofFaces=physicalRoofFacesSchema.parse({
    schema_version:"jpn.physical-roof-faces/1",units:"mm",
    source:originalSource,revision,
    faces:[{id:"F-L",outer,holes,supportPieceIds:pieces.map(p=>p.id),source:originalSource,revision}],
  });
  return project;
}
const act=(direction:[number,number,number]=[0,0,-1],projection:"horizontal"|"roof-surface"="horizontal")=>({
  caseId:"Q",knM2:.2,projection,direction,
  source:originalSource,revision,loadPath:"Faixas planas ortogonais entre segmentos físicos apoiados nas terças",
});
function compute(p:Project,direction:[number,number,number]=[0,0,-1],projection:"horizontal"|"roof-surface"="horizontal"){
  return distributeDeclaredRoofActions(p,[act(direction,projection)],{
    version:1,method:"parallel-purlin-strips",geometrySignature:declaredRoofDistributionSignature(p),
  });
}
describe("M39-P2: cortes reais em ortogonais com vínculos físicos por célula",()=>{
  it("telhado em L: área 18m², 3 células, 5 terças, forças e momento independentes",()=>{
    const p=example(),out=compute(p),a=out.actions[0];
    expect(out.regions.regions).toHaveLength(3);
    expect(a.areaM2).toBeCloseTo(18,10);
    expect(a.distributedAreaM2).toBeCloseTo(18,10);
    expect(a.expectedForceN).toEqual([0,0,-3600]);
    expect(a.distributedForceN).toEqual([0,0,-3600]);
    expect(a.expectedMomentNm[0]).toBeCloseTo(-6600,8);
    expect(a.expectedMomentNm[1]).toBeCloseTo(8400,8);
    a.distributedMomentNm.forEach((x,i)=>expect(x).toBeCloseTo(a.expectedMomentNm[i],8));
    const q=new Map(a.loads.map(l=>[l.pieceId,l.forcePerLengthNM[2]]));
    expect(q).toEqual(new Map([["P0_0",-200],["P1_0",-600],["P2_0",-400],["P0_1",-200],["P1_1",-200]]));
    expect(out.computedStructuralApproval).toBe(false);
    expect(out.fabricationRelease).toBe(false);
  });
  it("recorte interior é descontado, sem falso carregamento no vão vazio",()=>{
    const p=example("opening"),result=compute(p);
    const a=result.actions[0];
    expect(result.regions.regions).toHaveLength(8);
    expect(a.areaM2).toBeCloseTo(28,10);
    expect(a.distributedForceN[2]).toBeCloseTo(-5600,8);
    expect(a.distributedMomentNm[0]).toBeCloseTo(a.expectedMomentNm[0],8);
    expect(a.distributedMomentNm[1]).toBeCloseTo(a.expectedMomentNm[1],8);
    expect(a.contributions.every(c=>c.effectiveAreaM2>0)).toBe(true);
  });
  it("direção lateral e área inclinada conservam os três momentos sem 'caixa' artificial",()=>{
    const p=example(),dir:[number,number,number]=[.6,0,-.8];
    const a=compute(p,dir,"roof-surface").actions[0];
    expect(a.areaM2).toBeCloseTo(18*Math.hypot(1,.1),8);
    for(let i=0;i<3;i++){
      expect(a.distributedForceN[i]).toBeCloseTo(a.expectedForceN[i],7);
      expect(a.distributedMomentNm[i]).toBeCloseTo(a.expectedMomentNm[i],7);
    }
  });
  it("rotaciona a planta sem mudar física; usa terças paralelas a X",()=>{
    const p=example(),geometry=p.workspace.physicalStructure!,faces=p.workspace.spatialPreparation!.physicalRoofFaces!;
    for(const n of geometry.nodes){const x=n.x,y=n.y;n.x=-y;n.y=x;}
    for(const face of faces.faces){
      face.outer=face.outer.map(([x,y,z])=>[-y,x,z]);
    }
    const a=compute(p,[.6,0,-.8]).actions[0];
    expect(a.areaM2).toBeCloseTo(18,10);
    a.distributedMomentNm.forEach((v,i)=>expect(v).toBeCloseTo(a.expectedMomentNm[i],8));
  });
  it("recusa membro longo com carregamento variável em y, sem redistribuir por média enganosa",()=>{
    const p=example(),g=p.workspace.physicalStructure!,f=p.workspace.spatialPreparation!.physicalRoofFaces!.faces[0];
    const old=g.pieces.filter(m=>m.id==="P0_0"||m.id==="P0_1");
    expect(old).toHaveLength(2);
    g.pieces=g.pieces.filter(m=>!old.includes(m));
    g.pieces.push({id:"P0_LONG",role:"purlin",start:"N0_0",end:"N0_2"});
    g.nodes=g.nodes.filter(n=>n.id!=="N0_1");
    f.supportPieceIds=f.supportPieceIds.filter(id=>!old.some(m=>m.id===id)).concat("P0_LONG");
    expect(()=>compute(p)).toThrow("PURLIN_SEGMENTATION_REQUIRED");
  });
  it("recusa apoio inexistente na célula, sem lançar carga sobre barra sem ligação",()=>{
    const p=example(),f=p.workspace.spatialPreparation!.physicalRoofFaces!.faces[0];
    f.supportPieceIds=f.supportPieceIds.filter(id=>id!=="P2_0");
    expect(()=>compute(p)).toThrow("M37_UNLINKED_PURLIN");
  });
  it("alterar um recorte depois de revisar distribuição invalida toda carga",()=>{
    const p=example(),basis=declaredRoofDistributionSignature(p);
    const f=p.workspace.spatialPreparation!.physicalRoofFaces!.faces[0];
    f.revision="Revisão posterior de recorte e apoios";
    expect(()=>distributeDeclaredRoofActions(p,[act()],{
      version:1,method:"parallel-purlin-strips",geometrySignature:basis,
    })).toThrow("STALE_DISTRIBUTION");
  });
});
