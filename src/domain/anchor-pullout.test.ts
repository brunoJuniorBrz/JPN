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
  "ELU-WU":{nodes:{N1:r(-4965),N2:r(-9930),N3:r(-4965)}},       // same suction with 1,25 G (unfavorable set): +0,25 G
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
    {id:"ELU-WU",purpose:"ULS" as const,hypothesis:"1,25 G + 1,4 W",reference:ref,terms:[term("G",1.25),term("W",1.4)]},
    {id:"ELU-G",purpose:"ULS" as const,hypothesis:"1,25 G",reference:ref,terms:[term("G",1.25)]},
    {id:"ELS-W",purpose:"SLS-characteristic" as const,hypothesis:"G + W",reference:ref,terms:[term("G",1),term("W",1)]},
  ]};
// NBR 8681 classification of the permanent action: G = steel (Tabela 1: unfavorable 1,25, favorable 1,0).
const nbr8681Declaration={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable","favorable"],
  families:["uls-normal"],actions:[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
    {nature:"variable",caseId:"W",variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"}]};
const run=(interfaces=[wallA,center,wallB])=>assessAnchorPullout({interfaces,anchorTypes,ulsCombinationIds:["ELU-W","ELU-WU","ELU-G"],result,engineeringCombinations,nbr8681Declaration});

it("caso B: 5,740 / 11,480 kN contra 8,0 / 15,0 kN -> 0,718 e 0,765; ELU-W governa e o apoio central é crítico",()=>{
  const a=run(),by=Object.fromEntries(a.supports.map(s=>[s.nodeId,s]));
  expect(a.combinationsConsidered).toEqual(["ELU-W","ELU-WU","ELU-G"]);
  expect(a.favorablePermanentSet).toBe("present");expect(a.unfavorablePermanentSet).toBe("present");
  expect(by.N2.issues).toEqual([]);
  for(const id of ["N1","N3"]){
    expect(by[id].pullout.demandKn).toBeCloseTo(5.740,9);expect(by[id].pullout.declaredCapacity!.origin).toBe("anchor-type");
    expect(by[id].pullout.ratio!).toBeCloseTo(0.718,3);expect(by[id].pullout.status).toBe("within-declared-capacity");
    expect(by[id].pullout.governingCombinationId).toBe("ELU-W");expect(by[id].critical).toBe(true);
    expect(by[id].issues.join()).toMatch(/ANCHOR_CAPACITY_SCOPE_PENDING/);
  }
  expect(by.N2.pullout.demandKn).toBeCloseTo(11.480,9);expect(by.N2.pullout.declaredCapacity!.origin).toBe("support");
  expect(by.N2.pullout.ratio!).toBeCloseTo(0.765,3);expect(by.N2.critical).toBe(true);
  expect(a.governingSupport).toEqual({nodeId:"N2",ratio:by.N2.pullout.ratio,combinationId:"ELU-W"});
  expect(a.studioStatus).toEqual({N1:"pending",N2:"governing",N3:"pending"});
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
  const decl={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets,families:["uls-normal"],actions:hcActions};
  const g=generateNbr8681Combinations(decl,["G","Q","W"]);
  const ec=g.engineeringCombinations;
  const res={combinations:Object.fromEntries(ec.combinations.map(c=>[c.id,{nodes:{N1:r(c.terms.reduce((s,t)=>s+t.gamma*t.psi*hcR[t.caseId as keyof typeof hcR],0))}}]))};
  return assessAnchorPullout({interfaces:[wallA],anchorTypes,result:res,engineeringCombinations:ec,nbr8681Declaration:decl,
    ulsCombinationIds:ec.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id)});
};

it("A1 / HC-C: com os dois conjuntos de permanentes o arrancamento é 5,86 kN (1,0 G + 1,4 W) e a razão 0,7325",()=>{
  const a=hc(["unfavorable","favorable"]),s=a.supports[0];
  expect(a.favorablePermanentSet).toBe("present");
  expect(s.pullout.demandKn).toBeCloseTo(5.86,9);expect(s.pullout.ratio!).toBeCloseTo(0.7325,9);
  expect(a.favorableCombinationIds).toContain(s.pullout.governingCombinationId);
  expect(s.issues.join()).toMatch(/ANCHOR_CAPACITY_SCOPE_PENDING/);expect(a.studioStatus.N1).toBe("pending");
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
  expect(a.supports[0].issues.join()).toMatch(/ANCHOR_SHEAR_INTERACTION_PENDING/);
  expect(a.studioStatus.N1).toBe("pending");
  expect(a.limitations.join()).toMatch(/Interação tração \+ cisalhamento no chumbador não verificada/);
  res.combinations["ELU-G"].nodes.N1.reaction_moment_nm=[0,1200,0];
  const m=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result:res,engineeringCombinations});
  expect(m.supports[0].issues.join()).toMatch(/ANCHOR_REACTION_MOMENT_PENDING: momento de reação em ELU-G/);
  expect(m.studioStatus.N1).toBe("pending");
});


it("A1: permanente favorável sem vento NÃO valida a combinação de sucção com permanente mínimo",()=>{
  const refSig=(caseId:string,gamma:number)=>({caseId,gamma,psi:1,reference:ref});
  const combinations={
    actions:engineeringCombinations.actions,
    combinations:[
      {id:"ELU-W",purpose:"ULS" as const,hypothesis:"1.25 G + 1.4 W",reference:ref,terms:[refSig("G",1.25),refSig("W",1.4)]},
      {id:"ELU-G",purpose:"ULS" as const,hypothesis:"1.0 G, vento ausente",reference:ref,terms:[refSig("G",1),{...refSig("W",0),psi:0}]},
    ],
  };
  const incomplete={combinations:{
    "ELU-W":{nodes:{N1:r(1.25*3100-1.4*6400)}},
    "ELU-G":{nodes:{N1:r(3100)}},
  }};
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],
    result:incomplete,engineeringCombinations:combinations,nbr8681Declaration});
  expect(a.supports[0].pullout.demandKn).toBeCloseTo(5.085,9);
  expect(a.favorableCombinationIds).toContain("ELU-G");
  expect(a.missingFavorableCombinationIds).toContain("ELU-W");
  expect(a.favorablePermanentSet).toBe("missing");
  expect(a.supports[0].issues.join()).toMatch(/ANCHOR_FAVORABLE_PERMANENT_SET_MISSING/);
  expect(a.studioStatus.N1).toBe("pending");
});

it("A1: sem ELU identificada, recusa usar reação de ELS como demanda ou razão ELU",()=>{
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,
    ulsCombinationIds:null,result:{combinations:{"ELS-W":{nodes:{N1:r(-9000)}}}}});
  expect(a.supports[0].pullout.status).toBe("verification-pending");
  expect(a.supports[0].pullout.demandKn).toBeNull();
  expect(a.supports[0].pullout.ratio).toBeNull();
  expect(a.governingSupport).toBeNull();
  expect(a.supports[0].issues.join()).toMatch(/ANCHOR_ULS_COMBINATIONS_UNVERIFIED/);
  expect(a.studioStatus.N1).toBe("pending");
});
it("A1: ELU ausente do resultado não pode ser descartada silenciosamente",()=>{
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELU-AUSENTE"],
    result:{combinations:{"ELU-W":{nodes:{N1:r(-5740)}}}},engineeringCombinations});
  expect(a.supports[0].pullout.demandKn).toBeNull();
  expect(a.supports[0].issues.join()).toMatch(/Resultados ausentes: ELU-AUSENTE/);
});

it("A1: só o conjunto favorável (γg ≤ 1,0 em todas) não passa; HC-C com os dois conjuntos tem ambos presentes",()=>{
  expect(hc(["unfavorable","favorable"]).unfavorablePermanentSet).toBe("present");
  expect(hc(["unfavorable"]).unfavorablePermanentSet).toBe("present");
  const a=hc(["favorable"]),s=a.supports[0];
  expect(a.favorablePermanentSet).toBe("present");expect(a.unfavorablePermanentSet).toBe("missing");
  expect(a.missingUnfavorableCombinationIds.length).toBeGreaterThan(0);
  expect(s.issues.join()).toMatch(/ANCHOR_UNFAVORABLE_PERMANENT_SET_MISSING/);expect(a.studioStatus.N1).toBe("pending");
});

it("A1: assinatura γ·ψ arredondada: 1,5 x 0,8 (=1.2000000000000002) casa com 1,2 declarado",()=>{
  expect(1.5*0.8).not.toBe(1.2);
  const ec={actions:[{caseId:"G",category:"permanent" as const,exclusiveGroup:null,reference:ref},
      {caseId:"Q",category:"variable" as const,exclusiveGroup:null,reference:ref},{caseId:"W",category:"wind" as const,exclusiveGroup:null,reference:ref}],
    combinations:[
      {id:"U",purpose:"ULS" as const,hypothesis:"1,25 G + 1,4 W + 1,5·0,8 Q",reference:ref,terms:[term("G",1.25),term("W",1.4),{...term("Q",1.5),psi:0.8}]},
      {id:"F",purpose:"ULS" as const,hypothesis:"1,0 G + 1,4 W + 1,2 Q",reference:ref,terms:[term("G",1),term("W",1.4),term("Q",1.2)]}]};
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["U","F"],engineeringCombinations:ec,nbr8681Declaration,
    result:{combinations:{U:{nodes:{N1:r(-1000)}},F:{nodes:{N1:r(-1500)}}}}});
  expect(a.favorablePermanentSet).toBe("present");expect(a.unfavorablePermanentSet).toBe("present");
  expect(a.missingFavorableCombinationIds).toEqual([]);
});

it("A1: combinação ELS pedida como ELU bloqueia a verificação (nonULS)",()=>{
  const a=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["ELU-W","ELS-W"],result,engineeringCombinations});
  expect(a.supports[0].pullout.status).toBe("verification-pending");expect(a.supports[0].pullout.demandKn).toBeNull();
  expect(a.supports[0].issues.join()).toMatch(/Finalidade incompatível: ELS-W/);expect(a.governingSupport).toBeNull();
});

/** Counterexample from the cross audit of 67b5169 (ChatGPT, #134): G1 steel (Tabela 1 unfavorable 1,25) and G2
 * industrialized (Tabela 1 unfavorable 1,30). "U" = 1,25 G1 + 1,00 G2 + 1,4 W: G2 is NOT at its unfavorable factor, so
 * the unfavorable set is missing even though G1 is at 1,25. The reference comes from the single source, not from the
 * combinations received. */
const twoG={actions:[{caseId:"G1",category:"permanent" as const,exclusiveGroup:null,reference:ref},{caseId:"G2",category:"permanent" as const,exclusiveGroup:null,reference:ref},
  {caseId:"W",category:"wind" as const,exclusiveGroup:null,reference:ref}],
  combinations:(g2u:number)=>[
    {id:"U",purpose:"ULS" as const,hypothesis:"1,25 G1 + "+g2u+" G2 + 1,4 W",reference:ref,terms:[term("G1",1.25),term("G2",g2u),term("W",1.4)]},
    {id:"F",purpose:"ULS" as const,hypothesis:"1,0 G1 + 1,0 G2 + 1,4 W",reference:ref,terms:[term("G1",1),term("G2",1),term("W",1.4)]}]};
const twoGDecl=(g2Type?:string)=>({schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable","favorable"],
  families:["uls-normal"],actions:[{nature:"permanent",caseId:"G1",permanentType:"steel-and-equipment"},
    {nature:"permanent",caseId:"G2",...(g2Type?{permanentType:g2Type}:{})},{nature:"variable",caseId:"W",variableType:"wind",psiRow:"wind",exclusiveGroup:"WIND"}]});
const twoGRun=(g2u:number,decl:unknown)=>assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["U","F"],nbr8681Declaration:decl,
  engineeringCombinations:{actions:twoG.actions,combinations:twoG.combinations(g2u)},result:{combinations:{U:{nodes:{N1:r(-1000)}},F:{nodes:{N1:r(-1500)}}}}});

it("A1 contraexemplo: G1 = 1,25, G2 = 1,00, W = 1,40 -> conjunto desfavorável MISSING (G2 desfavorável de referência 1,30)",()=>{
  const a=twoGRun(1.0,twoGDecl("prefab-wood-industrialized"));
  expect(a.permanentClassificationVerified).toBe(true);
  expect(a.favorablePermanentSet).toBe("present");
  expect(a.unfavorablePermanentSet).toBe("missing");expect(a.missingUnfavorableCombinationIds).toEqual(["U","F"]);
  expect(a.supports[0].issues.join()).toMatch(/ANCHOR_UNFAVORABLE_PERMANENT_SET_MISSING/);expect(a.studioStatus.N1).toBe("pending");
  // control: G2 at its reference 1,30 closes the unfavorable set
  expect(twoGRun(1.3,twoGDecl("prefab-wood-industrialized")).unfavorablePermanentSet).toBe("present");
});

it("A1: permanente sem classificação ou sem declaração NBR 8681 -> unverified e apoio PENDENTE",()=>{
  const noType=twoGRun(1.3,twoGDecl());
  expect(noType.permanentClassificationVerified).toBe(false);expect(noType.unclassifiedPermanents).toEqual(expect.arrayContaining(["G1","G2"]));
  expect(noType.favorablePermanentSet).toBe("unverified");expect(noType.unfavorablePermanentSet).toBe("unverified");
  expect(noType.supports[0].issues.join()).toMatch(/ANCHOR_PERMANENT_CLASSIFICATION_UNVERIFIED/);expect(noType.studioStatus.N1).toBe("pending");
  const noDecl=twoGRun(1.3,undefined);
  expect(noDecl.unfavorablePermanentSet).toBe("unverified");expect(noDecl.unclassifiedPermanents).toEqual(["G1","G2"]);
  expect(noDecl.supports[0].issues.join()).toMatch(/ANCHOR_PERMANENT_CLASSIFICATION_UNVERIFIED/);
  // a combination whose item is not 5.1.3.x has no traceable kind (normal/special/exceptional)
  const other=assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["U","F"],nbr8681Declaration:twoGDecl("prefab-wood-industrialized"),
    engineeringCombinations:{actions:twoG.actions,combinations:twoG.combinations(1.3).map(c=>({...c,reference:{...ref,clause:"memorial"}}))},
    result:{combinations:{U:{nodes:{N1:r(-1000)}},F:{nodes:{N1:r(-1500)}}}}});
  expect(other.permanentClassificationVerified).toBe(false);expect(other.studioStatus.N1).toBe("pending");
});
it("A1 fatores: γg abaixo do favorável (0,9) e acima do desfavorável (1,35) -> ANCHOR_PERMANENT_FACTOR_MISMATCH e PENDENTE",()=>{
  const mk=(gU:number,gF:number)=>({actions:engineeringCombinations.actions,combinations:[
    {id:"U",purpose:"ULS" as const,hypothesis:gU+" G + 1,4 W",reference:ref,terms:[term("G",gU),term("W",1.4)]},
    {id:"F",purpose:"ULS" as const,hypothesis:gF+" G + 1,4 W",reference:ref,terms:[term("G",gF),term("W",1.4)]}]});
  const go=(gU:number,gF:number)=>assessAnchorPullout({interfaces:[wallA],anchorTypes,ulsCombinationIds:["U","F"],nbr8681Declaration,
    engineeringCombinations:mk(gU,gF),result:{combinations:{U:{nodes:{N1:r(-1000)}},F:{nodes:{N1:r(-1500)}}}}});
  const below=go(1.25,0.9);
  expect(below.permanentFactorMismatches).toEqual([{combinationId:"F",caseId:"G",declaredGamma:0.9,referenceFavorable:1,referenceUnfavorable:1.25}]);
  expect(below.supports[0].issues.join()).toMatch(/ANCHOR_PERMANENT_FACTOR_MISMATCH: γg fora dos valores de referência \(NBR 8681 Tabelas 1 a 3\): F\/G γ declarado 0,9 \(referência favorável 1, desfavorável 1,25\)/);
  expect(below.studioStatus.N1).toBe("pending");
  const above=go(1.35,1);
  expect(above.permanentFactorMismatches).toEqual([{combinationId:"U",caseId:"G",declaredGamma:1.35,referenceFavorable:1,referenceUnfavorable:1.25}]);
  expect(above.supports[0].issues.join()).toMatch(/U\/G γ declarado 1,35 \(referência favorável 1, desfavorável 1,25\)/);
  expect(above.studioStatus.N1).toBe("pending");
  // at the references (1,25 and 1,0) there is no mismatch
  expect(go(1.25,1).permanentFactorMismatches).toEqual([]);
});