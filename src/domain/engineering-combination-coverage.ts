import {verifyEngineeringCombinations} from "./engineering-combinations";

type Case={id:string};
type Combination={id:string;factors:Record<string,number|null>};

/** M42-P1 audits the ACTUAL engineer-declared ELU/ELS analysis matrix.
 * It does NOT supply ABNT gamma/psi or claim the declaration is normative.
 *
 * For each case we require an explicit nonzero participation in at least one
 * ULS and one SLS combination before calling the model's ANALYSIS-COVERAGE
 * complete. Some standards may legitimately use zero in specific families;
 * a missing family remains an actionable review request, not a guess.
 */
export function auditEngineeringCombinationCoverage(
  declaration:unknown,cases:Case[],actual:Combination[]
){
  const validated=verifyEngineeringCombinations(declaration,cases,actual),
    data=validated.declaration,ids=cases.map(c=>c.id),
    categoryById=new Map(data.actions.map(a=>[a.caseId,a])),
    purposes=["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"] as const;
  const matrix=validated.combinations.map(c=>{
    const declared=data.combinations.find(x=>x.id===c.id)!;
    const included=ids.filter(id=>c.factors[id]>0),
      excluded=ids.filter(id=>c.factors[id]===0);
    const activeGroups=new Map<string,string>();
    for(const id of included){
      const action=categoryById.get(id)!;
      if(action.exclusiveGroup){
        const previous=activeGroups.get(action.exclusiveGroup);
        if(previous)throw Error("M42_EXCLUSIVITY: "+previous+" e "+id+" ativos no mesmo grupo");
        activeGroups.set(action.exclusiveGroup,id);
      }
    }
    return {combinationId:c.id,purpose:declared.purpose,hypothesis:declared.hypothesis,
      reference:declared.reference,factors:c.factors,
      includedCases:included,explicitZeroCases:excluded,
      activeExclusiveGroups:[...activeGroups].map(([group,activeCase])=>({group,activeCase})),
    };
  });
  const actionCoverage=ids.map(id=>{
    const action=categoryById.get(id)!;
    const uls=matrix.filter(c=>c.purpose==="ULS"&&c.includedCases.includes(id)).map(c=>c.combinationId),
      sls=matrix.filter(c=>c.purpose.startsWith("SLS")&&c.includedCases.includes(id)).map(c=>c.combinationId),
      byPurpose=purposes.map(purpose=>({purpose,combinations:matrix.filter(c=>
        c.purpose===purpose&&c.includedCases.includes(id)).map(c=>c.combinationId)}));
    return {caseId:id,category:action.category,exclusiveGroup:action.exclusiveGroup,
      source:action.reference,ulsCombinations:uls,slsCombinations:sls,byPurpose,
      analyzedInBothLimitStateFamilies:uls.length>0&&sls.length>0};
  });
  const missingULS=actionCoverage.filter(c=>!c.ulsCombinations.length).map(c=>c.caseId),
    missingSLS=actionCoverage.filter(c=>!c.slsCombinations.length).map(c=>c.caseId);
  const duplicateVectors:{purpose:string;first:string;duplicate:string}[]=[];
  for(let i=0;i<matrix.length;i++)for(let j=i+1;j<matrix.length;j++){
    const a=matrix[i],b=matrix[j];
    if(a.purpose===b.purpose&&ids.every(id=>a.factors[id]===b.factors[id]))
      duplicateVectors.push({purpose:a.purpose,first:a.combinationId,duplicate:b.combinationId});
  }
  const groups=[...new Set(data.actions.map(a=>a.exclusiveGroup).filter((g):g is string=>g!==null))].map(group=>{
    const alternatives=data.actions.filter(a=>a.exclusiveGroup===group).map(a=>a.caseId);
    const only=actionCoverage.filter(a=>alternatives.includes(a.caseId));
    return {group,alternatives,
      missingULS:only.filter(a=>!a.ulsCombinations.length).map(a=>a.caseId),
      missingSLS:only.filter(a=>!a.slsCombinations.length).map(a=>a.caseId)};
  });
  const warnings:string[]=[];
  if(missingULS.length)warnings.push("M42_CASE_MISSING_ULS: "+missingULS.join(", "));
  if(missingSLS.length)warnings.push("M42_CASE_MISSING_SLS: "+missingSLS.join(", "));
  if(duplicateVectors.length)warnings.push("M42_DUPLICATE_COMBINATION_VECTOR: "+duplicateVectors.map(x=>x.first+"/"+x.duplicate).join(", "));
  return {
    schema_version:"jpn.engineering-combination-coverage/1" as const,
    coverageStatus:warnings.length?"review-required" as const:"case-matrix-reviewed" as const,
    /** True means the declared action set is covered mechanically, NOT normative. */
    allCasesCoveredForULSAndSLS:!missingULS.length&&!missingSLS.length,
    normativeFactorsVerified:false as const,
    normativeCompliance:false as const,
    computedStructuralApproval:false as const,
    fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,
    declaredInput:data,matrix,actionCoverage,groups,missingULS,missingSLS,
    duplicateVectors,warnings,
    limitations:[
      "Cobertura ELU/ELS compara apenas casos cadastrados; não estabelece todas as ações relevantes à obra.",
      "Fontes, coeficientes gamma/psi, simultaneidade, categorias e procedimentos ainda exigem revisão da edição normativa aplicável.",
      "Matriz completa não é aprovação estrutural nem autorização para dimensionamento final ou fabricação.",
    ],
  };
}
