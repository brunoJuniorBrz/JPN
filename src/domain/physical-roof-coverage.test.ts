import {describe,expect,it} from "vitest";
import {auditPhysicalRoofCoverage} from "./physical-roof-coverage";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
import {spatialPreparationSchema} from "./spatial-preparation";
import {m34abProject} from "./test-support/m34ab-fixtures";
import type {PhysicalGeometry} from "./structure";

const source="Levantamento físico de telhado",revision="Revisão geométrica conferida";
type P3=[number,number,number];
type P2=[number,number];
const ring=(pairs:P2[],z:(x:number,y:number)=>number):P3[]=>
  [...pairs,pairs[0]].map(([x,y])=>[x,y,z(x,y)]);
const rect=(start:number,end:number,z:(x:number,y:number)=>number)=>
  ring([[start,0],[end,0],[end,5000],[start,5000]],z);
const face=(id:string,outer:P3[],supportPieceIds:string[],holes:P3[][]=[])=>({
  id,outer,holes,supportPieceIds,source,revision
});
const roof=(faces:ReturnType<typeof face>[])=>({
  schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,faces
});
function two(){
  const nodes=[
    {id:"A",x:0,y:0,z:3000},{id:"B",x:0,y:5000,z:3000},
    {id:"C",x:4000,y:0,z:3400},{id:"D",x:4000,y:5000,z:3400},
    {id:"E",x:8000,y:0,z:3000},{id:"F",x:8000,y:5000,z:3000},
  ];
  const pieces:PhysicalGeometry["pieces"]=[
    {id:"L",role:"purlin",start:"A",end:"B",lengthMm:5000},
    {id:"RIDGE",role:"purlin",start:"C",end:"D",lengthMm:5000},
    {id:"R",role:"purlin",start:"E",end:"F",lengthMm:5000},
  ];
  const geometry:PhysicalGeometry={units:"mm",nodes,pieces};
  const surfaces=roof([
    face("left",rect(0,4000,x=>3000+.1*x),["L","RIDGE"]),
    face("right",rect(4000,8000,x=>3800-.1*x),["RIDGE","R"]),
  ]);
  return {geometry,surfaces};
}
const errors=(fn:()=>unknown,code:string)=>expect(fn).toThrow(code);
describe("M37-P2: união física e associações reais",()=>{
  it("confere telhado duas águas com cumeeira comum sem liberar carregamento",()=>{
    const {geometry,surfaces}=two(),audit=auditPhysicalRoofCoverage(surfaces,geometry);
    expect(audit.globalCoverage).toBe("no-overlap-and-seams-checked");
    expect(audit.horizontalAreaM2).toBeCloseTo(40,10);
    expect(audit.surfaceAreaM2).toBeCloseTo(40*Math.hypot(1,.1),10);
    expect(audit.associatedPieceIds).toEqual(["L","R","RIDGE"]);
    expect(audit.declaredUnionOnly).toBe(true);
    expect(audit.loadingReady).toBe(false);
    expect(audit.computedStructuralApproval).toBe(false);
  });
  it("mantém recorte de telhado em L sem completar retângulo vazio",()=>{
    const shape=ring([[0,0],[6000,0],[6000,2000],[2000,2000],[2000,5000],[0,5000]],()=>3000);
    const geometry:PhysicalGeometry={units:"mm",
      nodes:[{id:"a",x:0,y:0,z:3000},{id:"b",x:0,y:5000,z:3000}],
      pieces:[{id:"p",role:"purlin",start:"a",end:"b",lengthMm:5000}]};
    const geometryAudit=auditPhysicalRoofCoverage(roof([face("L",shape,["p"])]),geometry);
    expect(geometryAudit.horizontalAreaM2).toBe(18);
    const invalid={...geometry,nodes:[{id:"a",x:3000,y:3000,z:3000},{id:"b",x:5500,y:3000,z:3000}]};
    errors(()=>auditPhysicalRoofCoverage(roof([face("L",shape,["p"])]),invalid),"M37_PURLIN_OUTSIDE");
  });
  it("rejeita dois panos com projeção duplicada",()=>{
    const {geometry,surfaces}=two();
    surfaces.faces[1]={...surfaces.faces[0],id:"duplicado"};
    geometry.pieces=geometry.pieces.filter(p=>p.id!=="R");
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_ROOF_FACE_OVERLAP");
  });
  it("rejeita cotas discordantes na cumeeira sem corrigir silenciosamente",()=>{
    const {geometry,surfaces}=two();
    surfaces.faces[1]={...surfaces.faces[1],
      outer:surfaces.faces[1].outer.map(p=>[p[0],p[1],p[2]+100] as P3),
      supportPieceIds:["R"]};
    geometry.nodes=geometry.nodes.map(n=>["E","F"].includes(n.id)?{...n,z:n.z+100}:n);
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_ROOF_SEAM");
  });
  it("recusa terça órfã, coluna fingindo terça, e membro fora de plano",()=>{
    const {geometry,surfaces}=two();
    surfaces.faces[0].supportPieceIds=["inexistente"];
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_ORPHAN_PURLIN");
    surfaces.faces[0].supportPieceIds=["L","RIDGE"];
    geometry.pieces[0].role="column";
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_NOT_PURLIN");
    geometry.pieces[0].role="purlin";
    geometry.nodes.find(n=>n.id==="A")!.z+=20;
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_PURLIN_OFF_PLANE");
  });
  it("recusa terça atravessando furo mesmo quando as duas extremidades estão sobre o telhado",()=>{
    const exterior=ring([[0,0],[5000,0],[5000,4000],[0,4000]],()=>3000);
    const opening=ring([[2000,1000],[2000,2000],[3000,2000],[3000,1000]],()=>3000);
    const geometry:PhysicalGeometry={units:"mm",
      nodes:[{id:"a",x:0,y:1500,z:3000},{id:"b",x:5000,y:1500,z:3000}],
      pieces:[{id:"p",role:"purlin",start:"a",end:"b",lengthMm:5000}]};
    errors(()=>auditPhysicalRoofCoverage(roof([face("open",exterior,["p"],[opening])]),geometry),"M37_PURLIN_OUTSIDE");
  });
  it("recusa terça não associada à cobertura",()=>{
    const {geometry,surfaces}=two();
    surfaces.faces[1].supportPieceIds=["RIDGE"];
    errors(()=>auditPhysicalRoofCoverage(surfaces,geometry),"M37_UNLINKED_PURLIN");
  });
  it("persiste contrato opcional, mas não converte faces em cargas",()=>{
    const {surfaces}=two(),p=m34abProject(),draft=p.workspace.spatialPreparation!;
    draft.physicalRoofFaces=physicalRoofFacesSchema.parse(surfaces);
    const parsed=spatialPreparationSchema.parse(draft);
    expect(parsed.physicalRoofFaces?.faces).toHaveLength(2);
    expect(parsed.loading?.roofArea??[]).toEqual([]);
  });
});
