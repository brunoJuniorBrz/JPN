import {describe,expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {structureSignature} from "./calculations/project-basis";
import {roofOutlineAreaM2} from "./roof-outline";
import {roofSurfacesSchema,projectedFaceAreaM2,physicalFaceAreaM2,faceElevationMm} from "./roof-surface-geometry";
import {reviewPhysicalRoofSurfaces,pointInRoofFace} from "./roof-surface-review";

const rectangle=(x0:number,y0:number,x1:number,y1:number)=>
 [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]] as [number,number][];
function fixture(){
 const p=m34abProject();
 const shape=p.workspace.physicalStructure!;
 shape.nodes=[
 {id:"L0",x:0,y:0,z:0},{id:"L1",x:0,y:1000,z:0},
 {id:"R0",x:4000,y:0,z:1000},{id:"R1",x:4000,y:1000,z:1000},
 {id:"TA",x:3000,y:1000,z:750},{id:"TB",x:3000,y:4000,z:750},
 {id:"TC",x:4000,y:4000,z:1000},
 ];
 shape.pieces=[
 {id:"P1",start:"L0",end:"L1",role:"purlin"},
 {id:"P2",start:"R0",end:"R1",role:"purlin"},
 {id:"P3",start:"TA",end:"TB",role:"purlin"},
 {id:"P4",start:"R1",end:"TC",role:"purlin"},
 ];
 shape.revision="M37-L-shaped-physical";
 const outer:[[number,number],...[number,number][]]=[
 [0,0],[4000,0],[4000,4000],[3000,4000],[3000,1000],[0,1000],[0,0]];
 p.workspace.roofOutline={
  schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",
  source:"Contorno físico L conferido no projeto",revision:"M37-R1",
  outer,holes:[],supportPieceIds:["P1","P2","P3","P4"],
 };
 const face=(id:string,outer:[number,number][],purlinPieceIds:string[])=>({
   id,outer,holes:[],plane:{zAtOriginMm:0,dzDx:0.25,dzDy:0},
   purlinPieceIds,source:"Superfície física rastreável do levantamento",
   revision:"Revisão de campo M37-R1",
 });
 const a=face("A",rectangle(0,0,4000,1000),["P1","P2"]);
 const b=face("B",rectangle(3000,1000,4000,4000),["P3","P4"]);
 p.workspace.spatialPreparation!.roofSurfaces={
  schema_version:"jpn.physical-roof-surfaces/1",units:"mm",
  geometrySignature:structureSignature(p),surfaces:[a,b],
 };
 return {p,a,b};
}
describe("M37: cobertura real em L, superfícies inclinadas e purlins declarados",()=>{
 it("calcula área de projeção e área inclinada de faces disjuntas, não o retângulo 4x4",()=>{
  const {p,a,b}=fixture();
  const review=reviewPhysicalRoofSurfaces(p);
  expect(review.issues).toEqual([]);
  expect(roofOutlineAreaM2(p.workspace.roofOutline)).toBe(7);
  expect(projectedFaceAreaM2(a)).toBe(4);
  expect(projectedFaceAreaM2(b)).toBe(3);
  expect(review.projectedAreaM2).toBeCloseTo(7,12);
  expect(review.physicalAreaM2).toBeCloseTo(7*Math.hypot(1,.25),12);
  expect(physicalFaceAreaM2(a)).toBeCloseTo(4*Math.hypot(1,.25),12);
  expect(faceElevationMm(b,[3000,4000])).toBe(750);
  expect(pointInRoofFace([1000,2000],b)).toBe(-1);
  expect(pointInRoofFace([3500,2500],b)).toBe(1);
 });
 it("rejeita lacuna, sobreposição, deslocamento entre faces e fora do contorno",()=>{
  const {p}=fixture(),original=structuredClone(p.workspace.spatialPreparation!.roofSurfaces!);
  const surfaces=()=>p.workspace.spatialPreparation!.roofSurfaces!.surfaces;
  surfaces()[1].outer=rectangle(3100,1000,4000,4000);
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_AREA_GAP")).toBe(true);
  surfaces()[1].outer=rectangle(2900,1000,4000,4000);
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_SURFACE_OVERLAP"||x.code==="ROOF_OUTSIDE_FOOTPRINT")).toBe(true);
  p.workspace.spatialPreparation!.roofSurfaces=structuredClone(original);
  p.workspace.spatialPreparation!.roofSurfaces!.surfaces[1].plane.zAtOriginMm=100;
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_SEAM")).toBe(true);
  p.workspace.spatialPreparation!.roofSurfaces=structuredClone(original);
  p.workspace.spatialPreparation!.roofSurfaces!.surfaces[1].outer=rectangle(3000,1000,4500,4000);
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_OUTSIDE_FOOTPRINT"||x.code==="ROOF_FOOTPRINT_CROSSING")).toBe(true);
 });
 it("invalida mudanças de geometria, órfãos, altura incorreta e contorno ausente",()=>{
  const {p}=fixture(),draft=p.workspace.spatialPreparation!;
  draft.roofSurfaces!.surfaces[0].purlinPieceIds=["NAO-EXISTE"];
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_PURLIN_REFERENCE")).toBe(true);
  draft.roofSurfaces!.surfaces[0].purlinPieceIds=["P1","P2"];
  draft.roofSurfaces!.surfaces[0].plane.zAtOriginMm=200;
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_PURLIN_OFF_SURFACE")).toBe(true);
  draft.roofSurfaces!.surfaces[0].plane.zAtOriginMm=0;
  draft.roofSurfaces!.geometrySignature="revisao-antiga";
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="STALE_ROOF_SURFACES")).toBe(true);
  draft.roofSurfaces!.geometrySignature=structureSignature(p);
  delete p.workspace.roofOutline;
  expect(reviewPhysicalRoofSurfaces(p).issues.some(x=>x.code==="ROOF_OUTLINE_REQUIRED")).toBe(true);
 });
 it("mantém a invalidade de polígonos autointersectantes e duplicados; não cria cargas",()=>{
  const {p}=fixture(),draft=p.workspace.spatialPreparation!;
  const before=JSON.stringify(draft.loads);
  expect(roofSurfacesSchema.safeParse(draft.roofSurfaces).success).toBe(true);
  draft.roofSurfaces!.surfaces[0].outer=[[0,0],[4000,1000],[4000,0],[0,1000],[0,0]];
  expect(roofSurfacesSchema.safeParse(draft.roofSurfaces).success).toBe(false);
  expect(draft.loads).toEqual(JSON.parse(before));
  draft.roofSurfaces!.surfaces[0].outer=rectangle(0,0,4000,1000);
  draft.roofSurfaces!.surfaces[1].id="A";
  expect(roofSurfacesSchema.safeParse(draft.roofSurfaces).success).toBe(false);
 });
});
