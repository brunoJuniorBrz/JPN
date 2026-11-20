import {describe,expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {declaredStructureSchema} from "./declared-structure";
import {physicalFacadesSchema} from "./physical-facades";
import {declaredFacadeTractionSignature,distributeDeclaredFacadeTractions} from "./declared-facade-traction";
import type {Project} from "./models";
type P=[number,number,number];
const source="Medições de fachada vertical e pilares",revision="Revisão física 2026 M41-P3";
const ring=(list:P[]):P[]=>[...list,[...list[0]] as P];
function example():Project{
  const p=m34abProject();
  const nodes=[0,3000,6000].flatMap((y,i)=>[
    {id:"B"+i,x:8000,y,z:0},{id:"T"+i,x:8000,y,z:4000},
  ]);
  p.workspace.physicalStructure=declaredStructureSchema.parse({
    schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",
    revision:"Referência física de três pilares em fachada",
    provenance:"Modelo sintético independente: pilares sem rigidez/fixações de telhas presumidas",
    nodes,pieces:[
      {id:"C0",role:"column",start:"B0",end:"T0"},
      {id:"C3",role:"column",start:"B1",end:"T1"},
      {id:"C6",role:"column",start:"B2",end:"T2"},
      {id:"TOP0",role:"topChord",start:"T0",end:"T1"},
      {id:"TOP1",role:"topChord",start:"T1",end:"T2"},
    ],
  });
  p.workspace.spatialPreparation!.physicalFacades=physicalFacadesSchema.parse({
    schema_version:"jpn.physical-facades/1",units:"mm",source,revision,
    facades:[{id:"EAST",kind:"wall",outward:"+X",enclosure:"cladded",source,revision,
      enclosureSource:"Inspeção de fechamento completo deste pano da obra",
      supportPieceIds:["C0","C3","C6"],
      outer:ring([[8000,0,0],[8000,6000,0],[8000,6000,4000],[8000,0,4000]]),openings:[],
    }],
  });
  p.workspace.spatialPreparation!.cases=[{id:"WIND-X",source:"Caso externo de pressão de fachada"}];
  return p;
}
function declared(p:Project,pascal=500){
  return {schema_version:"jpn.declared-facade-traction/1",
    normativeValidation:"pending-engineer-review",
    physicalSignature:declaredFacadeTractionSignature(p),cases:[{
      id:"WIND-X",incidenceDeg:0,reference:"Cenário externo NÃO normativo para ensaio de transmissão",
      zones:[{facadeId:"EAST",netPressurePa:pascal,source:"Pressão de ensaio informada externamente",
        revision:"Revisão explicitamente identificada",
        calculationBasis:"Pressão líquida sintética uniforme para teste, não coeficiente ABNT"}],
    }],
  };
}
describe("M41-P3: pressão vertical declarada à estrutura física, sem coeficientes inventados",()=>{
  it("distribui 500 Pa em fachada 6x4 m para três pilares reais e conserva 6 resultantes",()=>{
    const p=example(),out=distributeDeclaredFacadeTractions(p,declared(p));
    const c=out.cases[0],z=c.zones[0];
    expect(out.mechanicalTransmissionVerified).toBe(true);
    expect(out.windNormativeReady).toBe(false);
    expect(out.fabricationRelease).toBe(false);
    expect(z.areaM2).toBeCloseTo(24,10);
    expect(c.forceN).toEqual([-12000,0,0]);
    expect(c.momentNm).toEqual([0,-24000,36000]);
    // Zero may be signed after floating-point multiplication.
    z.distributedForceN.forEach((value,i)=>expect(value).toBeCloseTo(z.expectedForceN[i],10));
    z.distributedMomentNm.forEach((m,i)=>expect(m).toBeCloseTo(z.expectedMomentNm[i],8));
    expect(c.loads.map(x=>x.pieceId)).toEqual(["C0","C3","C6"]);
    expect(c.loads.map(x=>x.forcePerLengthNM[0])).toEqual([-750,-1500,-750]);
    expect(c.loads.every(l=>l.forcePerLengthNM[2]===0)).toBe(true);
  });
  it("sucção negativa inverte a normal sem inventar pressão interna",()=>{
    const p=example(),out=distributeDeclaredFacadeTractions(p,declared(p,-500));
    expect(out.cases[0].forceN).toEqual([12000,0,0]);
    expect(out.cases[0].momentNm).toEqual([0,24000,-36000]);
    expect(out.cases[0].zones[0].calculationBasis).toContain("não coeficiente");
  });
  it("modificação só da revisão da fachada invalida pressão existente",()=>{
    const p=example(),basis=declared(p);
    p.workspace.spatialPreparation!.physicalFacades!.facades[0].revision="Revisão posterior à carga";
    expect(()=>distributeDeclaredFacadeTractions(p,basis)).toThrow("FACADE_STALE_PRESSURE");
  });
  it("recusa portão sem faixas físicas, fachada não revestida e pilar incompleto",()=>{
    const p=example(),f=p.workspace.spatialPreparation!.physicalFacades!.facades[0];
    f.openings=[ring([[8000,1000,1000],[8000,1000,2000],[8000,2000,2000],[8000,2000,1000]])];
    expect(()=>distributeDeclaredFacadeTractions(p,declared(p))).toThrow("FACADE_OPENING_DISTRIBUTION_PENDING");
    f.openings=[];
    f.enclosure="partially-cladded";
    expect(()=>distributeDeclaredFacadeTractions(p,declared(p))).toThrow("FACADE_ENCLOSURE_UNREVIEWED");
    f.enclosure="cladded";
    const piece=p.workspace.physicalStructure!.pieces.find(x=>x.id==="C3")!;
    piece.start="T1";piece.end="B1";
    expect(distributeDeclaredFacadeTractions(p,declared(p)).cases[0].forceN[0]).toBe(-12000);
    p.workspace.physicalStructure!.nodes.find(n=>n.id==="B1")!.z=100;
    expect(()=>distributeDeclaredFacadeTractions(p,declared(p))).toThrow("FACADE_COLUMN_SEGMENTATION_REQUIRED");
  });
  it("recusa ausência de caso, coluna de borda e zona sem referência",()=>{
    const p=example(),a=declared(p);
    a.cases[0].id="OTHER";
    expect(()=>distributeDeclaredFacadeTractions(p,a)).toThrow("FACADE_CASE_UNKNOWN");
    a.cases[0].id="WIND-X";
    p.workspace.spatialPreparation!.physicalFacades!.facades[0].supportPieceIds=["C3","C6"];
    expect(()=>distributeDeclaredFacadeTractions(p,declared(p))).toThrow("FACADE_COLUMN_BOUNDARIES");
    const q=declared(example());
    q.cases[0].zones[0].calculationBasis="";
    expect(()=>distributeDeclaredFacadeTractions(example(),q)).toThrow();
  });
});
