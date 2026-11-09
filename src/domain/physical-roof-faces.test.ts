import {describe,expect,it} from "vitest";
import {inspectPhysicalRoofFaces,physicalRoofFacesSchema} from "./physical-roof-faces";

const ring=(vertices:[number,number][],plane:(x:number,y:number)=>number)=>
 [...vertices,vertices[0]].map(([x,y])=>[x,y,plane(x,y)] as [number,number,number]);
const flat=(x:number,y:number)=>0;
const source="Levantamento geométrico conferido",revision="Rev. geométrica 1";
const face=(outer:[number,number,number][],holes:[number,number,number][][]=[])=>({
 id:"S1",outer,holes,supportPieceIds:["F1"],source,revision
});
const model=(faces:ReturnType<typeof face>[])=>({
 schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,faces
});
describe("M37: plano físico sem área retangular inventada",()=>{
 it("mede L côncavo e área inclinada sem completar vazio",()=>{
   const plane=(x:number,y:number)=>.1*x-.05*y+3200;
   const l=ring([[0,0],[6000,0],[6000,2000],[2000,2000],[2000,5000],[0,5000]],plane);
   const output=inspectPhysicalRoofFaces(model([face(l)]));
   const a=output.faces[0];
   expect(a.horizontalAreaM2).toBeCloseTo(18,10);
   expect(a.surfaceAreaM2).toBeCloseTo(18*Math.sqrt(1+.1**2+.05**2),10);
   expect(a.plane.dzDx).toBeCloseTo(.1,10);
   expect(a.plane.dzDy).toBeCloseTo(-.05,10);
   expect(output.loadingReady).toBe(false);
   expect(output.computedStructuralApproval).toBe(false);
 });
 it("desconta abertura interior com orientação de recorte CW",()=>{
   const outer=ring([[0,0],[8000,0],[8000,4000],[0,4000]],flat);
   const hole=ring([[1000,1000],[1000,2000],[3000,2000],[3000,1000]],flat);
   expect(inspectPhysicalRoofFaces(model([face(outer,[hole])])).faces[0].horizontalAreaM2).toBe(30);
 });
 it("aceita superfície independente de uma água e duas águas como duas faces mas não soma como footprint homologado",()=>{
   const a=face(ring([[0,0],[4000,0],[4000,5000],[0,5000]],(x)=>3000+.1*x));
   const b={...face(ring([[4000,0],[8000,0],[8000,5000],[4000,5000]],(x)=>3800-.1*x)),
      id:"S2",supportPieceIds:["F2"]};
   const data=inspectPhysicalRoofFaces(model([a,b]));
   expect(data.faces).toHaveLength(2);
   expect(data.faces[0].horizontalAreaM2).toBe(20);
   expect(data.faces[1].horizontalAreaM2).toBe(20);
   expect(data.globalCoverage).toBe("not-reviewed");
 });
 it("bloqueia vértice fora do plano e buraco fora da cobertura",()=>{
   const rect=ring([[0,0],[5000,0],[5000,4000],[0,4000]],flat);
   const warped=structuredClone(rect);warped[2][2]=100;
   expect(physicalRoofFacesSchema.safeParse(model([face(warped)])).success).toBe(false);
   const outside=ring([[6000,1000],[6000,2000],[7000,2000],[7000,1000]],flat);
   expect(physicalRoofFacesSchema.safeParse(model([face(rect,[outside])])).success).toBe(false);
 });
 it("bloqueia contorno auto-interceptado, ID repetido e fonte vazia",()=>{
   const bow=ring([[0,0],[4000,4000],[0,4000],[4000,0]],flat);
   expect(physicalRoofFacesSchema.safeParse(model([face(bow)])).success).toBe(false);
   const rect=ring([[0,0],[5000,0],[5000,4000],[0,4000]],flat);
   expect(physicalRoofFacesSchema.safeParse(model([face(rect),face(rect)])).success).toBe(false);
   expect(physicalRoofFacesSchema.safeParse(model([{...face(rect),source:""}])).success).toBe(false);
 });
});
