/** Execution limits of the mixed analysis, DERIVED from the transport budget (INT-1c).
 * Mirror of `engine/jpn_structural/analysis_limits.py`; `analysis-limits.test.ts` keeps the two equal.
 * A request may carry as many combinations as the single-envelope result still fits in the 2 MB output cap
 * (HTTP backend and local runner) under ONE input hash. */
export const OUTPUT_BYTES=2_000_000;
export const SAFETY_FRACTION=0.95;
/** Structural caps (the old fixed 10 on cases and combinations was a count, not a budget). */
export const MAX_CASES=40;
export const MAX_COMBINATIONS=256;
const NODE_BYTES=230,FRAME_BYTES=1400,AXIAL_BYTES=160,COMBINATION_OVERHEAD_BYTES=400,FIXED_BYTES=4000,FRAME_FIXED_BYTES=700,LOAD_TRACE_BYTES=350;

export const bytesPerCombination=(nodes:number,frameMembers:number,axialMembers:number)=>
  nodes*NODE_BYTES+frameMembers*FRAME_BYTES+axialMembers*AXIAL_BYTES+COMBINATION_OVERHEAD_BYTES;
export const fixedBytes=(frameMembers:number,memberLoads=0,selfWeightMembers=0)=>
  FIXED_BYTES+frameMembers*FRAME_FIXED_BYTES+(memberLoads+selfWeightMembers)*LOAD_TRACE_BYTES;
export function combinationLimit(nodes:number,frameMembers:number,axialMembers:number,memberLoads=0,selfWeightMembers=0){
  const room=OUTPUT_BYTES*SAFETY_FRACTION-fixedBytes(frameMembers,memberLoads,selfWeightMembers);
  return Math.max(0,Math.min(MAX_COMBINATIONS,Math.floor(room/bytesPerCombination(nodes,frameMembers,axialMembers))));
}
/** Same rule as the engine; returns an issue text or null. */
export function combinationBudgetIssue(v:{nodes:readonly unknown[];members:readonly {kind:string}[];combinations:readonly unknown[];
  member_loads?:readonly unknown[];self_weight?:{densities:readonly unknown[]}|null}){
  const frames=v.members.filter(m=>m.kind==="frame").length,
    allowed=combinationLimit(v.nodes.length,frames,v.members.length-frames,v.member_loads?.length??0,v.self_weight?.densities.length??0);
  return v.combinations.length>allowed?
    `combinations: ${v.combinations.length} excedem o limite derivado de ${allowed} para este modelo (o resultado único deve caber no limite de saída de 2 MB); reduza o modelo ou o número de combinações.`:null;
}
