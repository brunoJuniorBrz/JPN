import { expect,it } from "vitest";
import { assessAnchorPullout,anchorTypesSchema,supportInterfaceSchema,type SupportInterface } from "./support-interface";

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
const run=(interfaces=[wallA,center,wallB])=>assessAnchorPullout({interfaces,anchorTypes,ulsCombinationIds:["ELU-W","ELU-G"],result});

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
  const a=assessAnchorPullout({interfaces:[wallA,center,wallB],anchorTypes:weak,ulsCombinationIds:["ELU-W","ELU-G"],result});
  expect(a.supports[0].pullout.status).toBe("exceeds-declared-capacity");expect(a.supports[0].pullout.ratio!).toBeCloseTo(1.148,3);
  expect(a.studioStatus.N1).toBe("exceeds");
});

it("inspeção pendente da parede mantém o apoio pendente; apoio de pilar novo fica fora desta verificação",()=>{
  const hyp={...wallA,reviewStatus:"hypothesis" as const};
  expect(run([hyp,center,wallB]).studioStatus.N1).toBe("pending");
  const column=supportInterfaceSchema.parse({...base,nodeId:"N4",side:"A",kind:"new-steel-column"});
  expect(assessAnchorPullout({interfaces:[column],anchorTypes,ulsCombinationIds:null,result:{combinations:{X:{nodes:{N4:r(-1000)}}}}}).supports).toEqual([]);
});
