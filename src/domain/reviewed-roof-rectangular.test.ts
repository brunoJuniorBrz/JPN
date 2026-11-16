import { expect,it } from "vitest";
import { reviewedRoofProject,syntheticReviewedExtract } from "./test-support/m33a-reviewed-fixtures";
import { buildReviewedRoofCatalog,note3IJCoefficient,type ReviewedExtract } from "./reviewed-roof-catalog";
import { generateNormativeOriginTestStudy } from "./normative-origin";

/** N14 acceptance (NBR 6123:2023 corrigida, Tabela 7 doc p.21 and Tabela 8 doc p.22). Expected cells as in N2:
 * Tabela 7 theta=10, h/b<=1/2: EFI -1,2; GHJ -0,4 (alpha=90). Tabela 8 theta=10: H e I / L e J = -1,0/-0,5 (90°), -0,4/-1,0 (-90°). */
const extract=():ReviewedExtract=>{
  const g=(crossWindward:number,crossLeeward:number,parallelLeading:number,parallelRemainder:number)=>({crossWindward,crossLeeward,parallelLeading,parallelRemainder});
  return {...syntheticReviewedExtract(),
    gable10:{hOverBUpToHalf:g(-1.2,-.4,-.8,-.6),hOverBUpToThreeHalves:g(-1.1,-.6,-.8,-.6),hOverBUpToSix:g(-.8,-.6,-.8,-.8)},
    mono10:{positiveHigh:-1.0,positiveLow:-.5,negativeHigh:-.4,negativeLow:-1.0}};
};
const zones=(c:ReturnType<typeof buildReviewedRoofCatalog>,incidence:number)=>c.wind.rows.find(r=>r.domain.incidenceDeg===incidence)!.zones.map(z=>[z.id,z.cpe.value,z.boundsFraction]);

it.each([9,12])("duas águas 10°, a=%i m e b=6 m (a/b 1,5 e 2): vento a 90° usa EFI/GHJ em cada água inteira",lengthM=>{
  const {project,input}=reviewedRoofProject("gable",{slopeDeg:10,lengthM});input.incidencesDeg=[90];
  const c=buildReviewedRoofCatalog(project,input,extract());
  expect(zones(c,90)).toEqual([["EFI",-1.2,[0,0,1,1]],["GHJ",-.4,[0,0,1,1]]]);
  expect(c.wind.rows[0].domain.lengthM).toEqual([lengthM,lengthM]);
  expect(c.wind.rows[0].source.item).toContain(`a/b=${lengthM/6}`);
});

it.each([9,12])("uma água 10°, a=%i m e b=6 m: H e I / L e J a 90° e -90° em metades de b",lengthM=>{
  const {project,input}=reviewedRoofProject("mono",{slopeDeg:10,lengthM}),c=buildReviewedRoofCatalog(project,input,extract());
  expect(zones(c,90)).toEqual([["HI",-1.0,[0,0,.5,1]],["LJ",-.5,[.5,0,1,1]]]);
  expect(zones(c,270)).toEqual([["HI",-.4,[0,0,.5,1]],["LJ",-1.0,[.5,0,1,1]]]);
});

it("pipeline completo: galpão retangular 10° (a/b=2) só com vento a 90°, sem liberar aprovação",async()=>{
  const {project,input}=reviewedRoofProject("gable",{slopeDeg:10,lengthM:12});input.incidencesDeg=[90];
  const run=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:extract()});
  expect(run.blockers).toEqual([]);expect(run.wind!.declaration.cases).toHaveLength(2);
  expect(run.computedStructuralApproval).toBe(false);expect(run.fabricationRelease).toBe(false);
});

it("vento a 0° em planta retangular fica bloqueado: limite F/H-I/J não cotado (pergunta ao Tom)",async()=>{
  const {project,input}=reviewedRoofProject("gable",{slopeDeg:10,lengthM:9});
  expect(input.incidencesDeg).toContain(0);
  expect(()=>buildReviewedRoofCatalog(project,input,extract())).toThrow(/TABLE7_FH_IJ_LIMIT_UNDEFINED/);
  const r=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:extract()});
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.batches).toEqual([]);
});

it("b deve ser o menor lado (largura <= comprimento)",()=>{
  const {project,input}=reviewedRoofProject("mono",{slopeDeg:10,lengthM:4});
  expect(()=>buildReviewedRoofCatalog(project,input,extract())).toThrow(/b=width <= a=length/);
});

// Note 3 by hand: F/H = -0,6. a/b=1 -> -0,6; 1,5 -> -0,6 + (-0,2+0,6)*0,5 = -0,4; 1,25 -> -0,5; >=2 -> -0,2.
it("Nota 3 da Tabela 7: interpolação linear de I/J em a/b, contra cálculo à mão",()=>{
  expect(note3IJCoefficient(-.6,1)).toBeCloseTo(-.6,15);expect(note3IJCoefficient(-.6,1.25)).toBeCloseTo(-.5,15);
  expect(note3IJCoefficient(-.6,1.5)).toBeCloseTo(-.4,15);expect(note3IJCoefficient(-.6,2)).toBe(-.2);expect(note3IJCoefficient(-.6,3.5)).toBe(-.2);
  expect(note3IJCoefficient(-.4,1.5)).toBeCloseTo(-.3,15);
  expect(()=>note3IJCoefficient(-.6,.9)).toThrow(/a\/b < 1/);
});
