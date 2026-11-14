import {expect,it} from "vitest";
import {buildingProject} from "./test-support/m41-building-fixture";
import {assertDominant,classifyOpeningSpan,highSuctionDominantCpi,highSuctionStripM,sealedCpiAlternatives,windwardDominantCpi}
  from "./wind-internal-pressure";
import {buildNormativeFacadeTraction,cpeMedioCoefficient} from "./wind-facade-normative";
import {distributeDeclaredFacadeTractions} from "./declared-facade-traction";

const speed={schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:30,heightM:4,heightReference:"model-base-z0",
  topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
  reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"5",source:"Dados sintéticos do ensaio",revision:"v1",responsible:"Responsável de referência"}};
const building={longSideM:12,shortSideM:6,heightM:4,longAxis:"X",roofImpermeable:true,heightDefinitionConfirmed:true};
const run=(ip:object,from="+X",b:object=building,walls?:never)=>{
  const p=buildingProject(["W","W-CPIN2","W-CPIP0"]);void walls;
  return {p,r:buildNormativeFacadeTraction(p,{schema_version:"jpn.nbr6123-wall-wind/2",building:b,speed,
    cases:[{id:"W",windFrom:from,internalPressure:ip}]})};
};
const Q=0.613*(30*0.5**0.085)**2;
const dom={otherFacesEquallyPermeable:true,dominantOpeningAreaM2:6,otherOpeningsTotalAreaM2:2};
const net=(r:ReturnType<typeof run>["r"],i:number,id:string)=>r.traction.cases[i].zones.find(z=>z.facadeId===id)!.netPressurePa;

it("6.3.2.1 c) barlavento: razões tabeladas, '6 ou mais' e rejeição de valores intermediários",()=>{
  for(const [r,c] of [[1,.1],[1.5,.3],[2,.5],[3,.6],[6,.8],[7.5,.8],[100,.8]])expect(windwardDominantCpi(r)).toBe(c);
  for(const r of [.9,1.2,2.5,4,5.99])expect(()=>windwardDominantCpi(r)).toThrow("WIND_CPI_RATIO_NOT_TABULATED");
  expect(()=>windwardDominantCpi(0)).toThrow("WIND_CPI_RATIO_DOMAIN");
});
it("6.3.2.1 c) zona de alta sucção (p.44): sinais negativos e '3 ou mais'",()=>{
  for(const [r,c] of [[.25,-.4],[.5,-.5],[.75,-.6],[1,-.7],[1.5,-.8],[3,-.9],[10,-.9]])expect(highSuctionDominantCpi(r)).toBe(c);
  for(const r of [.1,.3,2,2.99])expect(()=>highSuctionDominantCpi(r)).toThrow("WIND_CPI_RATIO_NOT_TABULATED");
});
it("6.3.1 dominância, faixa de alta sucção (Nota 4) e classificação de abertura",()=>{
  expect(()=>assertDominant(1,2)).toThrow("WIND_CPI_NOT_DOMINANT");
  expect(()=>assertDominant(2,2)).not.toThrow();
  expect(highSuctionStripM(6,4)).toBeCloseTo(1.2,12);   // min(0.2b, h)
  expect(highSuctionStripM(6,0.5)).toBe(.5);
  expect(classifyOpeningSpan([.2,1],12,1.2)).toBe("high-suction");
  expect(classifyOpeningSpan([1.2,2],12,1.2)).toBe("outside");
  expect(()=>classifyOpeningSpan([1,2],12,1.2)).toThrow("WIND_CPI_OPENING_STRADDLES_ZONE");
  expect(()=>classifyOpeningSpan([11,13],12,1.2)).toThrow("WIND_CPI_OPENING_SPAN");
  expect(sealedCpiAlternatives()).toEqual([-.2,0]);
});
it("cpe médio (Nota 4): 6 valores, interpolação e nunca substitui o Cpe de zona",()=>{
  expect([[1,.4],[4,.4],[1,1],[4,1],[1,2],[4,2]].map(([a,h])=>cpeMedioCoefficient(a,h))).toEqual([-.9,-1,-1.1,-1.1,-1.2,-1.2]);
  expect(cpeMedioCoefficient(1.75,.4)).toBeCloseTo(-.95,12);
  const {r}=run({rule:"four-faces-equally-permeable"});  // a/b=2,h/b=2/3: A1B1=-0.9, cpe médio=-1.1
  const prof=r.traction.cases[0].zones.find(z=>z.facadeId==="NORTH")!.profile!;
  expect(prof.some(s=>Math.abs(s.netPressurePa-Q*(-1.1+.3))<1e-6)).toBe(false);
  expect(prof.map(s=>s.netPressurePa).some(v=>Math.abs(v-Q*(-.9+.3))<1e-6)).toBe(true);
});
it("6.3.2.2 estanque: exige caracterização explícita e gera dois cenários exclusivos (-0,2 e 0)",()=>{
  const sealed={rule:"sealed-building",characterization:"Janelas fixas, sem folhas móveis; probabilidade de rompimento acidental desprezável conforme projeto."};
  const {r}=run(sealed);
  expect(r.traction.cases.map(c=>c.id)).toEqual(["W-CPIN2","W-CPIP0"]);
  expect(net(r,0,"EAST")).toBeCloseTo(Q*(.7+.2),8);     // pressão positiva
  expect(net(r,1,"EAST")).toBeCloseTo(Q*.7,8);
  expect(net(r,0,"WEST")).toBeCloseTo(Q*(-.3+.2),8);    // sucção
  expect(()=>run({rule:"sealed-building",characterization:"curto"})).toThrow();
  expect(()=>run({rule:"sealed-building"})).toThrow();
});
it("abertura dominante a barlavento: Cpi por razão, caminho até as cargas e conservação",()=>{
  const {p,r}=run({rule:"dominant-opening-windward",...dom,windwardFaceOpeningsAreaM2:8,suctionFacesOpeningsAreaM2:4}); // razão 2 -> +0,5
  expect(net(r,0,"EAST")).toBeCloseTo(Q*(.7-.5),8);
  expect(net(r,0,"WEST")).toBeCloseTo(Q*(-.3-.5),8);
  expect(r.trace.some(t=>String((t as {cpiBasis:string}).cpiBasis).includes("razão 2"))).toBe(true);
  const c=distributeDeclaredFacadeTractions(p,r.traction).cases[0];
  // Independent: internal pressure cancels between windward/leeward -> Fx = -24 q (0.7+0.3)
  expect(c.forceN[0]).toBeCloseTo(-24*Q,5);
  expect(c.forceN[1]).toBeCloseTo(0,5);
  const bad=(a:object)=>()=>run({rule:"dominant-opening-windward",...dom,windwardFaceOpeningsAreaM2:8,suctionFacesOpeningsAreaM2:4,...a});
  expect(bad({otherOpeningsTotalAreaM2:7})).toThrow("WIND_CPI_NOT_DOMINANT");
  expect(bad({suctionFacesOpeningsAreaM2:3.2})).toThrow("WIND_CPI_RATIO_NOT_TABULATED");   // 2.5
  expect(bad({windwardFaceOpeningsAreaM2:5})).toThrow("WIND_CPI_AREAS");
  expect(bad({windwardFaceOpeningsAreaM2:24})).not.toThrow();                                 // 6 -> +0,8
  expect(net(run({rule:"dominant-opening-windward",...dom,windwardFaceOpeningsAreaM2:24,suctionFacesOpeningsAreaM2:4}).r,0,"EAST")).toBeCloseTo(Q*(.7-.8),8);
  expect(bad({otherFacesEquallyPermeable:false})).toThrow();
});
it("abertura dominante em parede paralela: fora da alta sucção usa o Ce do local (Tabela 6)",()=>{
  // a=12,b=6,h=4: strip=min(1.2,4)=1.2 m; zones A1B1[0,3] A2B2[3,6] A3B3[6,12]
  const par=(span:[number,number],extra:object={})=>({rule:"dominant-opening-parallel",...dom,openingSpanFromWindwardEdgeM:span,...extra});
  expect(net(run(par([4,5])).r,0,"EAST")).toBeCloseTo(Q*(.7+.4),8);      // Ce(A2B2)=-0,4
  expect(net(run(par([7,9])).r,0,"EAST")).toBeCloseTo(Q*(.7+.2),8);      // Ce(A3B3)=-0,2
  expect(net(run(par([1.5,2.5])).r,0,"EAST")).toBeCloseTo(Q*(.7+.9),8);  // Ce(A1B1)=-0,9
  expect(()=>run(par([2.5,3.5]))).toThrow("WIND_CPI_OPENING_STRADDLES_ZONE");     // cruza A1B1|A2B2
  expect(()=>run(par([1,2]))).toThrow("WIND_CPI_OPENING_STRADDLES_ZONE");         // cruza a faixa de 1,2 m
});
it("abertura dominante em zona de alta sucção: exige áreas e usa a tabela de p.44",()=>{
  const par=(extra:object={})=>({rule:"dominant-opening-parallel",...dom,openingSpanFromWindwardEdgeM:[.4,1],...extra});
  expect(()=>run(par())).toThrow("WIND_CPI_HIGH_SUCTION_AREAS_REQUIRED");
  const r=run(par({highSuction:{openingsInZoneAreaM2:6,otherSuctionFacesOpeningsAreaM2:6}})).r;   // razão 1 -> -0,7
  expect(net(r,0,"EAST")).toBeCloseTo(Q*(.7+.7),8);
  expect(net(r,0,"WEST")).toBeCloseTo(Q*(-.3+.7),8);
  expect(()=>run(par({highSuction:{openingsInZoneAreaM2:6,otherSuctionFacesOpeningsAreaM2:5}}))).toThrow("WIND_CPI_RATIO_NOT_TABULATED");
  expect(()=>run(par({highSuction:{openingsInZoneAreaM2:5,otherSuctionFacesOpeningsAreaM2:5}}))).toThrow("WIND_CPI_AREAS");
});
it("fallback Cpi=Ce da zona: barlavento e parede paralela fora da alta sucção; alta sucção bloqueada",()=>{
  const why="Razão de permeabilidade não determinável com exatidão razoável neste estágio de projeto.";
  const fb=(location:object)=>({rule:"dominant-opening-ce-fallback",...dom,permeabilityRatioIndeterminate:why,location});
  const w=run(fb({wall:"windward"})).r;
  expect(net(w,0,"EAST")).toBeCloseTo(0,6);                   // Cpe(C)=+0,7=Cpi
  expect(net(w,0,"WEST")).toBeCloseTo(Q*(-.3-.7),8);
  expect(net(run(fb({wall:"parallel",spanFromWindwardEdgeM:[4,5]})).r,0,"EAST")).toBeCloseTo(Q*(.7+.4),8);
  expect(()=>run(fb({wall:"parallel",spanFromWindwardEdgeM:[.2,1]}))).toThrow("WIND_CPI_FALLBACK_HIGH_SUCTION_AMBIGUOUS");
  expect(()=>run({...fb({wall:"windward"}),permeabilityRatioIndeterminate:"curto"})).toThrow();
});
it("domínios bloqueados: sotavento (Tabela 4), cilíndrica e método detalhado",()=>{
  expect(()=>run({rule:"dominant-opening-leeward"})).toThrow("WIND_CPI_LEEWARD_DOMINANT_BLOCKED");
  expect(()=>run({rule:"cylindrical-open-top"})).toThrow("WIND_CPI_CYLINDRICAL_OUT_OF_DOMAIN");
  expect(()=>run({rule:"detailed-flow-balance"})).toThrow("WIND_CPI_DETAILED_METHOD_BLOCKED");
});
it("Nota 1 e geometria: h declarado (Tabela 7) e 12 m declarados contra fachadas a 8 m são rejeitados",()=>{
  const ok={rule:"four-faces-equally-permeable"};
  const {heightDefinitionConfirmed:_,...noH}=building;void _;
  expect(()=>run(ok,"+X",noH)).toThrow();
  // PR #95 scenario: a=12 declared but opposite facades 8 m apart (here: a=8 declared vs 12 m between facades)
  expect(()=>run(ok,"+X",{...building,longSideM:8})).toThrow("WIND_PLAN_MISMATCH");
  expect(()=>run(ok,"+X",{...building,longSideM:12,shortSideM:6})).not.toThrow();
});
