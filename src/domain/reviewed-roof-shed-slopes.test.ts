import { expect,it } from "vitest";
import { reviewedRoofProject,syntheticReviewedExtract } from "./test-support/m33a-reviewed-fixtures";
import { buildReviewedRoofCatalog,gableBand,type ReviewedExtract } from "./reviewed-roof-catalog";
import { generateNormativeOriginTestStudy } from "./normative-origin";

/** N2 acceptance. Cells of the corrected NBR 6123:2023 (Errata 1:2025), read twice and compared:
 * the page image and the PDF text layer (Tabela 7, doc p.21 / PDF p.33; Tabela 8, doc p.22 / PDF p.34).
 * Order [EFI (alpha=90), GHJ (alpha=90), EG (alpha=0), FH (alpha=0)]. These cells are the expected values
 * the owner extract must reproduce; the transcription in the private extract stays the source. */
const TABLE7:Record<10|15,Record<ReturnType<typeof gableBand>,[number,number,number,number]>>={
  10:{hOverBUpToHalf:[-1.2,-.4,-.8,-.6],hOverBUpToThreeHalves:[-1.1,-.6,-.8,-.6],hOverBUpToSix:[-.8,-.6,-.8,-.8]},
  15:{hOverBUpToHalf:[-1.0,-.4,-.8,-.6],hOverBUpToThreeHalves:[-1.0,-.6,-.8,-.6],hOverBUpToSix:[-.8,-.6,-.8,-.8]},
};
/** Tabela 8 (h/b<2): [H e I at 90°, L e J at 90°, H e I at -90°, L e J at -90°]. */
const TABLE8:Record<10|15,[number,number,number,number]>={10:[-1.0,-.5,-.4,-1.0],15:[-.9,-.5,-.3,-1.0]};

const g=([crossWindward,crossLeeward,parallelLeading,parallelRemainder]:number[])=>({crossWindward,crossLeeward,parallelLeading,parallelRemainder});
const bands=(t:10|15)=>({hOverBUpToHalf:g(TABLE7[t].hOverBUpToHalf),hOverBUpToThreeHalves:g(TABLE7[t].hOverBUpToThreeHalves),hOverBUpToSix:g(TABLE7[t].hOverBUpToSix)});
const mono=([positiveHigh,positiveLow,negativeHigh,negativeLow]:number[])=>({positiveHigh,positiveLow,negativeHigh,negativeLow});
/** Synthetic extract (factors etc. stay TEST_ONLY) carrying the table cells above. */
const extract=():ReviewedExtract=>({...syntheticReviewedExtract(),gable10:bands(10),gable15:bands(15),mono10:mono(TABLE8[10]),mono15:mono(TABLE8[15])});
const cpe=(c:ReturnType<typeof buildReviewedRoofCatalog>,incidence:number)=>Object.fromEntries(c.wind.rows.find(r=>r.domain.incidenceDeg===incidence)!.zones.map(z=>[z.id,z.cpe.value]));

it.each([[10,3,"hOverBUpToHalf"],[10,9,"hOverBUpToThreeHalves"],[10,12,"hOverBUpToSix"],[15,3,"hOverBUpToHalf"],[15,9,"hOverBUpToThreeHalves"],[15,12,"hOverBUpToSix"]] as const)(
  "galpão duas águas %i°, beiral %i m (b=6 m): Tabela 7 célula a célula na faixa %s, zonas E/G e F-I/H-J",(theta,low,band)=>{
  const {project,input}=reviewedRoofProject("gable",{slopeDeg:theta,lowHeightM:low}),c=buildReviewedRoofCatalog(project,input,extract());
  expect(gableBand(low/6)).toBe(band);
  const [efi,ghj,eg,fh]=TABLE7[theta][band];
  expect(cpe(c,90)).toEqual({EFI:efi,GHJ:ghj});
  expect(cpe(c,0)).toEqual({E:eg,FI:fh,G:eg,HJ:fh});
  // zone geometry: x = max(b/3, a/4) <= 2h from the windward edge (Tabela 7 figure); a=b=6 -> x=2 m
  const zones=c.wind.rows.find(r=>r.domain.incidenceDeg===0)!.zones;
  expect(zones.find(z=>z.id==="E")!.boundsFraction).toEqual([0,0,1,2/6]);
  expect(zones.find(z=>z.id==="FI")!.boundsFraction).toEqual([0,2/6,1,1]);
  for(const r of c.wind.rows){expect(r.domain.slopeDeg).toBe(theta);expect(r.source.item).toContain(`Table 7, theta${theta}`);}
});

it.each([10,15] as const)("galpão uma água %i°: Tabela 8 célula a célula (90° e -90°)",theta=>{
  const {project,input}=reviewedRoofProject("mono",{slopeDeg:theta}),c=buildReviewedRoofCatalog(project,input,extract());
  const [hi90,lj90,hiM90,ljM90]=TABLE8[theta];
  expect(cpe(c,90)).toEqual({HI:hi90,LJ:lj90});expect(cpe(c,270)).toEqual({HI:hiM90,LJ:ljM90});
  expect(c.wind.rows.every(r=>r.source.item.includes(`Table 8, theta${theta}`))).toBe(true);
});

it("pipeline completo 10° gera os casos com os Cpe da tabela e mantém os bloqueios de aprovação",async()=>{
  const {project,input}=reviewedRoofProject("gable",{slopeDeg:10}),run=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:extract()});
  expect(run.blockers).toEqual([]);expect(run.wind!.declaration.cases).toHaveLength(4);
  const values=new Set(run.wind!.declaration.cases.flatMap(c=>c.zones.map(z=>z.externalCoefficient)));
  expect([...values].sort()).toEqual([...new Set(TABLE7[10].hOverBUpToHalf)].sort());
  expect(run.computedStructuralApproval).toBe(false);expect(run.fabricationRelease).toBe(false);
});

it.each(["intermediate-slope","missing-row","gable45-tall","mono-tall"])("bloqueia fora do domínio: %s",async kind=>{
  const opts=kind==="intermediate-slope"?{slopeDeg:12}:kind==="gable45-tall"?{lowHeightM:4}:kind==="mono-tall"?{slopeDeg:10,lowHeightM:12}:{slopeDeg:15};
  const typology=kind==="mono-tall"?"mono" as const:"gable" as const;
  const {project,input}=reviewedRoofProject(typology,opts),v=extract();
  if(kind==="missing-row")delete v.gable15;
  expect(()=>buildReviewedRoofCatalog(project,input,v)).toThrow(kind==="missing-row"?/REVIEWED_ROOF_EXTRACT_ROW_MISSING/:/REVIEWED_ROOF_DOMAIN/);
  const r=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:v});
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.batches).toEqual([]);
});
