import {describe,expect,it} from "vitest";
import {physicalFacadesSchema,inspectPhysicalFacades} from "./physical-facades";
import {spatialPreparationSchema} from "./spatial-preparation";
import {m34abProject} from "./test-support/m34ab-fixtures";
import type {PhysicalGeometry} from "./structure";
type V=[number,number,number];
const source="Medições tridimensionais explícitas de fachada",revision="Revisão de levantamento vertical v1";
const close=(ring:V[]):V[]=>[...ring,[...ring[0]] as V];
const wall=close([[8000,0,0],[8000,6000,0],[8000,6000,4000],[8000,0,4000]]);
const opening=close([[8000,1000,1000],[8000,1000,2000],[8000,3000,2000],[8000,3000,1000]]);
function declaration(faces:object[]){
  return {schema_version:"jpn.physical-facades/1",units:"mm",source,revision,facades:faces};
}
function side(outer:V[]=wall,openings:V[][]=[opening],supportPieceIds:string[]=[]){
  return {id:"EAST",outward:"+X",kind:"wall",enclosure:"partially-cladded",
    outer,openings,supportPieceIds,source,revision,enclosureSource:"Inspeção local de placas e aberturas"};
}
describe("M41-P1: superfícies verticais físicas sem vento inventado",()=>{
  it("desconta abertura em parede +X e conserva centróide e normal física",()=>{
    const r=inspectPhysicalFacades(declaration([side()]));
    expect(r.faces).toHaveLength(1);
    expect(r.totalVerticalAreaM2).toBeCloseTo(22,12);
    expect(r.faces[0].openingAreaM2).toBeCloseTo(2,12);
    expect(r.faces[0].unitOutwardNormal).toEqual([1,0,0]);
    expect(r.faces[0].centroidMm[0]).toBe(8000);
    expect(r.faces[0].centroidMm[1]).toBeCloseTo(68000/22,8);
    expect(r.faces[0].centroidMm[2]).toBeCloseTo(45000/22,8);
    expect(r.windReady).toBe(false);
    expect(r.facadeLoadPathReady).toBe(false);
    expect(r.fabricationRelease).toBe(false);
  });
  it("aceita frontão real, sem usar caixa retangular envolvente",()=>{
    const outer=close([[0,0,0],[6000,0,0],[6000,0,3000],[3000,0,5000],[0,0,3000]]);
    const d=declaration([{...side(outer,[]),id:"SOUTH",kind:"gable",outward:"-Y",enclosure:"cladded"}]);
    const r=inspectPhysicalFacades(d);
    expect(r.faces[0].verticalAreaM2).toBeCloseTo(24,12);
    expect(r.faces[0].unitOutwardNormal).toEqual([0,-1,0]);
  });
  it("orienta fachada norte (+Y) com eixo paramétrico invertido, sem alterar a normal",()=>{
    const outer=close([[6000,5000,0],[0,5000,0],[0,5000,3000],[6000,5000,3000]]);
    const r=inspectPhysicalFacades(declaration([{...side(outer,[]),id:"NORTH",outward:"+Y"}]));
    expect(r.faces[0].verticalAreaM2).toBeCloseTo(18,12);
    expect(r.faces[0].unitOutwardNormal).toEqual([0,1,0]);
    expect(r.faces[0].centroidMm).toEqual([3000,5000,1500]);
  });
  it("rejeita deformação de plano, abertura exterior, orientação errada e anel aberto",()=>{
    const changed=wall.map(x=>[...x] as V);changed[2][0]+=25;
    expect(physicalFacadesSchema.safeParse(declaration([side(changed,[])])).success).toBe(false);
    const outside=close([[8000,8000,1000],[8000,8000,2000],[8000,9000,2000],[8000,9000,1000]]);
    expect(physicalFacadesSchema.safeParse(declaration([side(wall,[outside])])).success).toBe(false);
    expect(physicalFacadesSchema.safeParse(declaration([side([...wall].reverse(),[])])).success).toBe(false);
    expect(physicalFacadesSchema.safeParse(declaration([side(wall.slice(0,-1),[])])).success).toBe(false);
    expect(physicalFacadesSchema.safeParse(declaration([side(),{...side(),id:"EAST"}])).success).toBe(false);
  });
  it("recusa peça ausente, fora do plano e cruzando uma abertura",()=>{
    const model:PhysicalGeometry={units:"mm",
      nodes:[{id:"a",x:8000,y:0,z:1500},{id:"b",x:8000,y:6000,z:1500}],
      pieces:[{id:"G1",role:"web",start:"a",end:"b",lengthMm:6000}]};
    expect(()=>inspectPhysicalFacades(declaration([side(wall,[opening],["missing"])]),model)).toThrow("FACADE_MEMBER_ORPHAN");
    expect(()=>inspectPhysicalFacades(declaration([side(wall,[opening],["G1"])]),model)).toThrow("FACADE_MEMBER_OUTSIDE");
    model.nodes[0].x=8005;
    expect(()=>inspectPhysicalFacades(declaration([side(wall,[],["G1"])]),model)).toThrow("FACADE_MEMBER_OFF_PLANE");
    model.nodes[0].x=8000;
    expect(inspectPhysicalFacades(declaration([side(wall,[],["G1"])]),model).faces[0].supportPieceIds).toEqual(["G1"]);
  });
  it("persiste declaração vertical, mas não habilita vento automaticamente",()=>{
    const p=m34abProject(),draft=p.workspace.spatialPreparation!;
    draft.physicalFacades=physicalFacadesSchema.parse(declaration([side()]));
    const decoded=spatialPreparationSchema.parse(draft);
    expect(decoded.physicalFacades?.facades[0].id).toBe("EAST");
    expect(decoded.loading?.wind).toBeUndefined();
    expect(inspectPhysicalFacades(decoded.physicalFacades).windReady).toBe(false);
  });
});
