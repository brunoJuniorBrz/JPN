/** Research manifests are not normative authorities or pass/fail oracles. */
export function referenceCandidateGate(value:{status:string;usable_for_pass_fail:boolean;targets:{unit:string}[]}){
  if(value.status.startsWith("quarantined")||value.targets.some(t=>/UNVERIFIED|as-printed/.test(t.unit)))return {status:"unsupported-model",comparisonAllowed:false,reason:"QUARANTINED_REFERENCE_UNITS_OR_METHOD"} as const;
  if(!value.usable_for_pass_fail||value.status!=="validated-reference")return {status:"pending-data",comparisonAllowed:false,reason:"PHYSICAL_EQUIVALENCE_AND_INDEPENDENT_REVIEW_REQUIRED"} as const;
  return {status:"calculated-but-not-validated",comparisonAllowed:true,reason:"REFERENCE_COMPARISON_IS_NOT_NORMATIVE_APPROVAL"} as const;
}
