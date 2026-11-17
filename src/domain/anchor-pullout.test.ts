import { expect,it } from "vitest";
import { assessAnchorPullout,anchorTypesSchema,supportInterfaceSchema,type SupportInterface } from "./support-interface";
import { generateNbr8681Combinations } from "./nbr8681-combinations";

/** N4 acceptance, case B of the independent memorial (ELU-W pull-out): 5,740 kN at each external wall and 11,480 kN
 * at the central support; declared design capacities 8,0 and 15,0 kN -> 0,718 and 0,765. The reactions below are
 * the memorial demands placed at the support nodes; the memorial's geometry/load inputs are not in the repository. */
const base={dofs:["fixed","fixed","fixed","free","free","free"] as SupportInterface["dofs"],source:"Levantamento de obra do caso B",revision:"Rev. 1",
  loadPath:"Viga de apoio sobre a parede existente",restraintBasis:"Apoio pontual sobre a parede com chumbadores",reviewStatus:"site-reviewed" as const};
const wallA=supportInterfaceSchema.parse({...base,nodeId:"N1",side:"A",kind:"existing-masonry",anchorTypeId:"QUIM-M12"});
const center=supportInterfaceSchema.parse({...base,nodeId:"N2",side:"internal",kind:"existing-masonry",
  capacity:{compressionKn:40,upliftKn:15,horizontalShearKn:null,source:"Ficha do fabricante, conjunto de 2 chumbadores",revision:"FT-2026"}});
const wallB=supportInterfaceSchema.parse({...base,nodeId:"N3",side:"B",kind:"existing-masonry",anchorTypeId:"QUIM-M12"});
const anchorTypes=anchorTypesSchema.parse([{id:"QUIM-M12",label:"Chumbador químico M12 (exemplo de ensaio)",tensionDesignKn:8,compressionDesignKn:null,
  source:"Ficha do fabricante (valor de cálculo à tração)",revision:"FT-2026"}]);
const r=(fz:number)=>({reaction_force_n:[0,0,fz] as [number,number,number],reaction_moment_nm:[0,0,0] as [number,number,number]});
const result={combinations:{
  "ELU-W":{nodes:{N1:r(-5740),N2:r(-11480),N3:r(-5740)}},       // governing pull-out (case B)
  "ELU-G":{nodes:{N1:r(3100),N2:r(6200),N3:r(3100)}},           // compression only
  "ELS-W":{nodes:{N1:r(-9000),N2:r(-18000),N3:r(-9000)}},        // service: must NOT enter the ULS check
}};
const ref={standard:"ABNT NBR 8681",edition:"2025",clause:"5.1.3.1",source:"Caso B",revision:"Rev. 1",responsible:"Engenheiro (ensaio)"};
const term=(caseId:string,gamma:number)=>({caseId,gamma,psi:1,reference:ref});
// ELU-W carries the permanent with the favorable factor (1,0): the favorable set is present.
const engineeringCombinations={
  actions:[{caseId:"G",category:"permanent" as const,exclusiveGroup:null,reference:ref},{caseId:"W",category:"wind" as const,exclusiveGroup:null,reference:ref}],
  combinations:[
    {id:"ELU-W",purpose:"ULS" as const,hypothesis:"1,0 G + 1,4 W",reference:ref,terms:[term("G",1),term("W",1.4)]},
    {id:"ELU-G",purpose:"ULS" as const,hypothesis:"1,25 G",reference:ref,terms:[term("G",1.25)]},
    {id:"ELS-W",purpose:"SLS-characteristic" as const,hypothesis:"G + W",reference:ref,terms:[term("G",1),term("W",1)]},
  ]};
const run=(interfaces=[wallA,center,wallB])=>assessAnchorPullout({interfaces,anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result,engineeringCombinations});

it("caso B: 5,740 / 11,480 kN contra 8,0 / 15,0 kN -> 0,718 e 0,765; ELU-W governa e o apoio central é crítico",()=>{
  const a=run(),by=Object.fromEntries(a.supports.map(s=>[s.nodeId,s]));
  expect(a.combinationsConsidered).toEqual(["ELU-W","ELU-G"]);
  for(const id of ["N1","N3"]){
    expect(by[id].pullout.demandKn).toBeCloseTo(5.740,9);expect(by[id].pullout.declaredCapacity!.origin).toBe("anchor-type");
    expect(by[id].pullout.ratio!).toBeCloseTo(0.718,3);expect(by[id].pullout.status).toBe("within-declared-capacity");
    expect(by[id].pullout.governingCombinationId).toBe("ELU-W");expect(by[id].critical).toBe(false);
  }
  expect(by.N2.pullout.demandKn).toBeCloseTo(11.480,9);expect(by.N2.pullout.declaredCapacity!.origin).toBe("support");
  expect(by.N2.pullout.ratio!).toBeCloseTo(0.765,3);expect(by.N2.critical).toBe(true);
  expect(a.governingSupport).toEqual({nodeId:"N2",ratio:by.N2.pullout.ratio,combinationId:"ELU-W"});
  expect(a.studioStatus).toEqual({N1:"ok",N2:"governing",N3:"ok"});
  // compression is informed with declared capacity only (masonry resistance is N10)
  expect(by.N2.compression.demandKn).toBeCloseTo(6.2,9);expect(by.N2.compression.ratio!).toBeCloseTo(6.2/40,12);
  expect(by.N1.compression.status).toBe("capacity-pending");
  expect(a.computedStructuralApproval).toBe(false);expect(a.fabricationRelease).toBe(false);expect(a.releaseGate).toBe("NOT_READY_BLOCKED");
});

it("sem capacidade declarada: pendência visível, nunca dentro da capacidade",()=>{
  const bare=supportInterfaceSchema.parse({...base,nodeId:"N1",side:"A",kind:"existing-masonry"});
  const s=run([bare,center,wallB]).supports[0];
  expect(s.pullout.status).toBe("capacity-pending");expect(s.pullout.ratio).toBeNull();expect(s.critical).toBe(true);
  expect(s.issues.join()).toMatch(/ANCHOR_CAPACITY_PENDING/);
  expect(run([{...wallA,anchorTypeId:"INEXISTENTE"},center,wallB]).supports[0].pullout.status).toBe("capacity-pending");
});

it("demanda acima da capacidade declarada fica EXCEDE e crítica no Studio",()=>{
  const weak=anchorTypesSchema.parse([{...anchorTypes[0],tensionDesignKn:5}]);
  const a=assessAnchorPullout({interfaces:[wallA,center,wallB],anchorTypes:weak,ulsCombinationIds:["ELU-W","ELU-G"],result,engineeringCombinations});
  expect(a.supports[0].pullout.status).toBe("exceeds-declared-capacity");expect(a.supports[0].pullout.ratio!).toBeCloseTo(1.148,3);
  expect(a.studioStatus.N1).toBe("exceeds");
});

it("inspeção pendente da parede mantém o apoio pendente; apoio de pilar novo fica fora desta verificação",()=>{
  const hyp={...wallA,reviewStatus:"hypothesis" as const};
  expect(run([hyp,center,wallB]).studioStatus.N1).toBe("pending");
  const column=supportInterfaceSchema.parse({...base,nodeId:"N4",side:"A",kind:"new-steel-column"});
  expect(assessAnchorPullout({interfaces:[column],anchorTypes,ulsCombinationIds:null,result:{combinations:{X:{nodes:{N4:r(-1000)}}}}}).supports).toEqual([]);
});

/** A1, hand case HC-C (validation/hand-cases, PR #135): characteristic reactions R_G = +3,10, R_Q = +2,00, R_W = -6,40 kN
 * at one support. Minimum permanent + maximum suction (NBR 8681 5.1.3.1, Tabela 1 favorable 1,0; Tabela 4 wind 1,4;
 * Q omitted by 4.3.3.1): Rd = 3,10 - 1,4 x 6,40 = -5,86 kN -> 5,86 / 8,0 = 0,7325. With only the unfavorable set the
 * generator gives 1,25 x 3,10 - 8,96 = -5,085 kN (13,2% low): that must NOT pass as the envelope. */
const hcR={G:3100,Q:2000,W:-6400};
const hcActions=[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
  {nature:"variable",caseId:"Q",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null},
  {nature:"variable",caseId:"W",variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"}];
const hc=(permanentSets:string[])=>{
  const g=generateNbr8681Combinations({schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets,families:["uls-normal"],actions:hcActions},["G","Q","W"]);
  const ec=g.engineeringCombinations;
  const res={combinations:Object.fromEntries(ec.combinations.map(c=>[c.id,{nodes:{N1:r(c.terms.reduce((s,t)=>s+t.gamma*t.psi*hcR[t.caseId as keyof typeof hcR],0))}}]))};
  return assessAnchorPullout({interfaces:[wallA],anchorTypes,result:res,engineeringCombinations:ec,
    ulsCombinationIds:ec.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id)});
};

it("A1 / HC-C: com os dois conjuntos de permanentes o arrancamento é 5,86 kN (1,0 G + 1,4 W) e a razão 0,7325",()=>{
  const a=hc(["unfavorable","favorable"]),s=a.supports[0];
  expect(a.favorablePermanentSet).toBe("present");
  expect(s.pullout.demandKn).toBeCloseTo(5.86,9);expect(s.pullout.ratio!).toBeCloseTo(0.7325,9);
  expect(a.favorableCombinationIds).toContain(s.pullout.governingCombinationId);
  expect(s.issues).toEqual([]);expect(a.studioStatus.N1).toBe("governing");
  expect(a.computedStructuralApproval).toBe(false);expect(a.fabricationRelease).toBe(false);expect(a.releaseGate).toBe("NOT_READY_BLOCKED");
});

it("A1 / HC-C: só o conjunto desfavorável (5,085 kN) não substitui a envoltória; apoio PENDENTE, nunca ok",()=>{
  const a=hc(["unfavorable"]),s=a.supports[0];
  expect(a.favorablePermanentSet).toBe("missing");expect(a.favorableCombinationIds).toEqual([]);
  expect(s.pullout.demandKn).toBeCloseTo(5.085,9);
  expect(s.issues.join()).toMatch(/ANCHOR_FAVORABLE_PERMANENT_SET_MISSING/);
  expect(s.critical).toBe(true);expect(a.studioStatus.N1).toBe("pending");
});

it("A1: sem os fatores das combinações declarados, a combinação com permanente mínimo não é confirmada -> PENDENTE",()=>{
  const a=assessAnchorPullout({interfaces:[wallA,center,wallB],anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result});
  expect(a.favorablePermanentSet).toBe("unverified");
  expect(a.supports[0].issues.join()).toMatch(/ANCHOR_FAVORABLE_PERMANENT_SET_UNVERIFIED/);
  expect(a.studioStatus).toEqual({N1:"pending",N2:"pending",N3:"pending"});
});

it("A3: cisalhamento e momento da MESMA combinação que governa a tração; momento deixa PENDENTE; interação não verificada",()=>{
  const res={combinations:{
    "ELU-W":{nodes:{N1:{reaction_force_n:[3000,4000,-5740] as [number,number,number],reaction_moment_nm:[0,0,0] as [number,number,number]}}},
    "ELU-G":{nodes:{N1:{reaction_force_n:[9000,0,3100] as [number,number,number],reaction_moment_nm:[0,0,0] as [number,number,number]}}}}};
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result:res,engineeringCombinations});
  const p=a.supports[0].pullout;
  expect(p.governingCombinationId).toBe("ELU-W");
  expect(p.concurrentHorizontalShearKn).toBeCloseTo(5,12);   // hypot(3, 4) of ELU-W, not the 9 kN of ELU-G
  expect(p.concurrentMomentKnM).toBe(0);
  expect(a.supports[0].issues).toEqual([]);
  expect(a.limitations.join()).toMatch(/Interação tração \+ cisalhamento no chumbador não verificada/);
  res.combinations["ELU-G"].nodes.N1.reaction_moment_nm=[0,1200,0];
  const m=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result:res,engineeringCombinations});
  expect(m.supports[0].issues.join()).toMatch(/ANCHOR_REACTION_MOMENT_PENDING: momento de reação em ELU-G/);
  expect(m.studioStatus.N1).toBe("pending");
});
