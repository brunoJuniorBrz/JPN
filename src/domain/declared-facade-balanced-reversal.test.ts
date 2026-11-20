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
describe("M41-P3: regressão independente de binário de vento",()=>{
  it("conserva momento global mesmo quando pressões opostas anulam a força total",()=>{
    const p=example();
    const basis=declared(p,0);
    const zone=basis.cases[0].zones[0] as (typeof basis.cases)[number]["zones"][number] & {
      profile:{startM:number;endM:number;netPressurePa:number}[];
    };
    zone.profile=[
      {startM:0,endM:3,netPressurePa:500},
      {startM:3,endM:6,netPressurePa:-500},
    ];
    const out=distributeDeclaredFacadeTractions(p,basis);
    const c=out.cases[0],z=c.zones[0];
    // As duas metades exercem forças opostas de 6 kN, mas formam
    // um binário de 18 kN.m: força líquida zero NÃO significa vento nulo.
    c.forceN.forEach(value=>expect(value).toBeCloseTo(0,8));
    expect(c.momentNm[0]).toBeCloseTo(0,8);
    expect(c.momentNm[1]).toBeCloseTo(0,8);
    expect(c.momentNm[2]).toBeCloseTo(18000,8);
    z.distributedForceN.forEach((value,i)=>expect(value).toBeCloseTo(z.expectedForceN[i],8));
    z.distributedMomentNm.forEach((value,i)=>expect(value).toBeCloseTo(z.expectedMomentNm[i],8));
    expect(c.loads.map(l=>l.pieceId)).toEqual(["C0","C3","C6"]);
    c.loads.map(l=>l.forcePerLengthNM[0]).forEach((value,i)=>
      expect(value).toBeCloseTo([-750,0,750][i],8));
    expect(out.computedStructuralApproval).toBe(false);
    expect(out.fabricationRelease).toBe(false);
    expect(out.releaseGate).toBe("NOT_READY_BLOCKED");
  });

});
