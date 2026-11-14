import table from "../../data/normas/nbr6123-2023-wall-cpe.json" with {type:"json"};

/** NBR 6123:2023 6.3.1 / 6.3.2.1 c) / 6.3.2.2 pure rules (no geometry, no solver).
 * Intermediate area ratios are NOT interpolated: the standard prescribes none. */
function fail(c:string,m:string):never{throw Error(c+": "+m);}
type Row={ratio:number;cpi:number;orMore?:boolean};
const same=(a:number,b:number)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
function stepTable(ratio:number,rows:Row[],what:string){
  if(!(ratio>0)||!Number.isFinite(ratio))fail("WIND_CPI_RATIO_DOMAIN",what+": razão de áreas inválida");
  for(const r of rows)if(same(ratio,r.ratio))return r.cpi;
  const last=rows.at(-1)!;
  if(last.orMore&&ratio>last.ratio)return last.cpi;
  fail("WIND_CPI_RATIO_NOT_TABULATED",what+": razão "+ratio+" não é um valor tabelado ("+rows.map(r=>r.ratio+(r.orMore?"+":"")).join(", ")+"); a norma não prescreve interpolação");
}
const dom=table.internalPressure.dominantOpening;
/** 6.3.2.1 c), dominant opening on the windward face. */
export const windwardDominantCpi=(ratio:number)=>stepTable(ratio,dom.windward.rows as Row[],"abertura dominante a barlavento");
/** 6.3.2.1 c), dominant opening in a high-suction zone of a wall parallel to the wind. */
export const highSuctionDominantCpi=(ratio:number)=>stepTable(ratio,dom.parallelInHighSuction.rows as Row[],"abertura dominante em zona de alta sucção");
/** 6.3.1: dominant if its area >= total area of all other openings. */
export function assertDominant(dominantM2:number,othersM2:number){
  if(dominantM2<othersM2)fail("WIND_CPI_NOT_DOMINANT","a abertura não é dominante (6.3.1): área "+dominantM2+" < soma das demais "+othersM2);
}
/** Tabela 6 Nota 4: windward strip of parallel walls = min(0.2 b, h). */
export const highSuctionStripM=(b:number,h:number)=>Math.min(.2*b,h);
/** 6.3.2.2 sealed building: both alternatives are exclusive scenarios. */
export const sealedCpiAlternatives=()=>[...table.internalPressure.sealed.alternatives];
/** Classify an opening span (m from the windward edge) against the high-suction strip. */
export function classifyOpeningSpan(span:[number,number],wallLengthM:number,stripM:number){
  const [d0,d1]=span;
  if(!(d0>=0&&d1>d0&&d1<=wallLengthM+1e-9))fail("WIND_CPI_OPENING_SPAN","abertura fora da parede paralela (0..."+wallLengthM+" m)");
  if(d1<=stripM+1e-9)return "high-suction" as const;
  if(d0>=stripM-1e-9)return "outside" as const;
  return fail("WIND_CPI_OPENING_STRADDLES_ZONE","abertura cruza a borda da zona de alta sucção ("+stripM+" m): dividir ou declarar separadamente");
}
