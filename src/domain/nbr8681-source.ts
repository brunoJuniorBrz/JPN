import data from "../../data/normas/nbr8681-2025-combinations.json" with {type:"json"};

/** N3: single source of the NBR 8681:2025 gamma/psi factors. data/normas/nbr8681-2025-combinations.json
 * is the source; the reviewed-roof extract's `factors` are derived from it and must coincide. */
export const NBR8681_DOCUMENT_SHA256:string=data.documentSha256;
export const NBR8681_SOURCE_LABEL=`ABNT NBR 8681:2025 (${data.sourceCopy.sha256.slice(0,12)}…; ${data.sourceCopy.description})`;

export interface ReviewedRoofFactors{permanentSteel:number;permanentIndustrialized:number;permanentFavorable:number;
  wind:number;roofLive:number;psiWind:[number,number,number];psiRoofLive:[number,number,number]}

/** Normal ULS values used by the reviewed roof path: Table 1 (steel; industrialized elements), favorable 1,0;
 * Table 4 (wind; other variable actions); Table 6 (wind; libraries ... and roofs). */
export function reviewedRoofFactorsFrom8681():ReviewedRoofFactors{
  const t1=data.table1.types,t4=data.table4.types,t6=data.table6.rows;
  return {permanentSteel:t1["steel-and-equipment"].normal[0],permanentIndustrialized:t1["prefab-wood-industrialized"].normal[0],
    permanentFavorable:t1["steel-and-equipment"].normal[1],wind:t4.wind.normal,roofLive:t4["other-and-equipment-temperature"].normal,
    psiWind:t6.wind.psi as [number,number,number],psiRoofLive:t6["libraries-archives-warehouses-workshops-garages-roofs"].psi as [number,number,number]};
}

/** Fails when an extract carries 8681 factors different from the single source. */
export function assertSame8681Factors(factors:ReviewedRoofFactors){
  const expected=reviewedRoofFactorsFrom8681(),diff:string[]=[];
  for(const key of Object.keys(expected) as (keyof ReviewedRoofFactors)[])
    if(JSON.stringify(factors[key])!==JSON.stringify(expected[key]))diff.push(`${key}: extrato ${JSON.stringify(factors[key])} x JSON ${JSON.stringify(expected[key])}`);
  if(diff.length)throw Error("NBR8681_SOURCE_DIVERGENCE: "+diff.join("; "));
  return expected;
}
