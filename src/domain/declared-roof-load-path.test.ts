import {describe,expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalRoofFacesSchema} from "./physical-roof-faces";
import {declaredRoofDistributionSignature} from "./declared-roof-load-path";
import {distributeDeclaredRoofActions} from "./declared-roof-load-path";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {adaptMixedProject} from "./mixed-adapter";
import type {Project} from "./models";
import type {RoofAreaAction} from "./roof-load-path";

type P3=[number,number,number];
const ring=(xy:[number,number][],z:(x:number,y:number)=>number):P3[]=>
  [...xy,xy[0]].map(([x,y])=>[x,y,z(x,y)]);
const source="Levantamento da obra e detalhamento",revision="Revisão rastreada dos panos";
function reference(){
  const p=m34abProject();
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"Referência geométrica de ensaio M39",provenance:"Modelo analítico de três terças e dois panos",
    nodes:[
      {id:"A",x:0,y:0,z:3000},{id:"B",x:0,y:5000,z:3000},
      {id:"C",x:4000,y:0,z:3400},{id:"D",x:4000,y:5000,z:3400},
      {id:"E",x:8000,y:0,z:3000},{id:"F",x:8000,y:5000,z:3000},
    ],
    pieces:[
      {id:"P1",start:"A",end:"B",role:"purlin"},
      {id:"P2",start:"C",end:"D",role:"purlin"},
      {id:"P3",start:"E",end:"F",role:"purlin"},
    ],
  });
  p.workspace.spatialPreparation!.physicalRoofFaces=physicalRoofFacesSchema.parse({
    schema_version:"jpn.physical-roof-faces/1",units:"mm",source,revision,
    faces:[
      {id:"left",outer:ring([[0,0],[4000,0],[4000,5000],[0,5000]],x=>3000+.1*x),
        holes:[],supportPieceIds:["P1","P2"],source,revision},
      {id:"right",outer:ring([[4000,0],[8000,0],[8000,5000],[4000,5000]],x=>3800-.1*x),
        holes:[],supportPieceIds:["P2","P3"],source,revision},
    ],
  });
  return p;
}
const action=(projection:"horizontal"|"roof-surface",direction:[number,number,number]=[0,0,-1]):RoofAreaAction=>({
  caseId:"CASE-AREA",knM2:.2,projection,direction,source,revision,
  loadPath:"Telhas planas simplesmente apoiadas transversalmente em terças reais",
});
const distribute=(p:Project,projection:"horizontal"|"roof-surface"="horizontal",direction:[number,number,number]=[0,0,-1])=>
  distributeDeclaredRoofActions(p,[action(projection,direction)],{
    version:1,method:"parallel-purlin-strips",geometrySignature:declaredRoofDistributionSignature(p),
  });
describe("M39-P1: entrada de área de obra declarada para cargas de terças",()=>{
  it("duas águas: cargas de linha conservam área, força e momentos com cumeeira compartilhada",()=>{
    const p=reference(),trace=distribute(p);
    expect(trace.declaredGeometry).toBe(true);
    const a=trace.actions[0];
    expect(a.areaM2).toBeCloseTo(40,10);
    expect(a.distributedAreaM2).toBeCloseTo(40,10);
    expect(a.distributedForceN).toEqual([0,0,-8000]);
    expect(a.expectedForceN).toEqual([0,0,-8000]);
    expect(a.expectedMomentNm[0]).toBeCloseTo(-20000,8);
    expect(a.expectedMomentNm[1]).toBeCloseTo(32000,8);
    a.distributedMomentNm.forEach((v,i)=>expect(v).toBeCloseTo(a.expectedMomentNm[i],8));
    expect(a.loads.map(x=>x.pieceId)).toEqual(["P1","P2","P3"]);
    expect(a.loads.map(x=>x.forcePerLengthNM[2])).toEqual([-400,-800,-400]);
    expect(trace.fabricationRelease).toBe(false);
    expect(trace.computedStructuralApproval).toBe(false);
  });
  it("a área inclinada e uma direção horizontal conservam momentos nos três eixos",()=>{
    const p=reference(),factor=Math.sqrt(1+.1**2);
    const a=distribute(p,"roof-surface",[1,0,0]).actions[0];
    expect(a.areaM2).toBeCloseTo(40*factor,10);
    expect(a.distributedForceN[0]).toBeCloseTo(8000*factor,8);
    a.distributedForceN.forEach((f,i)=>expect(f).toBeCloseTo(a.expectedForceN[i],8));
    a.distributedMomentNm.forEach((m,i)=>expect(m).toBeCloseTo(a.expectedMomentNm[i],8));
  });
  it("gira a cobertura 90 graus, muda a direção das terças e preserva os seis resultantes globais",()=>{
    const p=reference(),declared=p.workspace.physicalStructure!,faces=p.workspace.spatialPreparation!.physicalRoofFaces!;
    for(const node of declared.nodes){const x=node.x,y=node.y;node.x=-y;node.y=x;}
    for(const face of faces.faces){
      face.outer=face.outer.map(([x,y,z])=>[-y,x,z] as [number,number,number]);
    }
    const output=distribute(p,"horizontal",[.6,0,-.8]).actions[0];
    expect(output.areaM2).toBeCloseTo(40,10);
    output.distributedForceN.forEach((actual,i)=>expect(actual).toBeCloseTo(output.expectedForceN[i],8));
    output.distributedMomentNm.forEach((actual,i)=>expect(actual).toBeCloseTo(output.expectedMomentNm[i],8));
  });
  it("não mistura geometria declarada de panos com carga do gerador, nem descarta carga no adaptador nodal",async()=>{
    const physical=reference(),d=physical.workspace.spatialPreparation!;
    d.loading={version:1,selfWeight:null,uniform:[],roofArea:[action("horizontal")]};
    await expect(adaptMixedProject(physical)).rejects.toThrow("DISTRIBUTED_LOADED_REQUIRED");
    const generated=reference();
    delete generated.workspace.physicalStructure;
    generated.workspace.spatialPreparation!.loading={
      version:1,selfWeight:null,uniform:[],roofArea:[action("horizontal")]
    };
    await expect(adaptLoadedMixedProject(generated)).rejects.toThrow("DUAL_ROOF_SOURCE_PENDING");
  });
  it("recusa furo físico, sem preencher abertura pelo retângulo envolvente",()=>{
    const p=reference(),faces=p.workspace.spatialPreparation!.physicalRoofFaces!;
    faces.faces[0].holes.push(ring([[1000,1000],[1000,2000],[3000,2000],[3000,1000]],x=>3000+.1*x));
    expect(()=>distribute(p)).toThrow("IRREGULAR_DISTRIBUTION_PENDING");
  });
  it("recusa assinatura stale e coordenadas de terça fora dos limites sem valor fictício",()=>{
    const p=reference();
    expect(()=>distributeDeclaredRoofActions(p,[action("horizontal")],{
      version:1,method:"parallel-purlin-strips",geometrySignature:"obsoleta",
    })).toThrow("STALE_DISTRIBUTION");
    const draft=p.workspace.spatialPreparation!;
    draft.physicalRoofFaces!.faces[0].supportPieceIds=["P2"];
    expect(()=>distribute(p)).toThrow("M37_UNLINKED_PURLIN");
  });
});
