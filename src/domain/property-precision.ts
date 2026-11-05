/** Quantization interval, never a percentage allowance. Resolution is in the
 * property's own unit and must have explicit provenance in the declaration. */
export function comparePhysicalProperty(declared:number,solver:number,resolution?:number){
  if(!Number.isFinite(declared)||!Number.isFinite(solver)||resolution!==undefined&&(!Number.isFinite(resolution)||resolution<=0))throw Error("PROPERTY_PRECISION_INVALID");
  const floating=64*Number.EPSILON*Math.max(Math.abs(declared),Math.abs(solver));
  const delta=Math.abs(declared-solver),limit=(resolution??0)/2+floating;
  return {status:delta<=limit?"consistent" as const:resolution===undefined?"pending-precision" as const:"mismatch" as const,delta,limit,resolution:resolution??null};
}
