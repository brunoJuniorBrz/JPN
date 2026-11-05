import { z } from "zod";
import type { WholePieceDeflections } from "./whole-piece-deflection";
const text=z.string().trim().min(1).max(1000);
export const declaredServiceCriterionSchema=z.object({schema_version:z.literal("jpn.declared-service-criterion/1"),id:z.string().min(1).max(80),pieceId:z.string().min(1).max(100),
  combinations:z.array(z.string().min(1).max(40)).min(1).max(10),quantity:z.enum(["global-x","global-y","global-z","vector-norm"]),reference:z.literal("original-piece-end-chord"),limitM:z.number().finite().positive().max(1000),source:text,revision:text,responsible:text,
}).strict().superRefine((v,c)=>{if(new Set(v.combinations).size!==v.combinations.length)c.addIssue({code:"custom",message:"Combinação duplicada"});});
export type DeclaredServiceCriterion=z.infer<typeof declaredServiceCriterionSchema>;
/** Engineer-declared kinematic criterion, NOT a normative SLS certification. */
export function evaluateDeclaredService(criteria:DeclaredServiceCriterion[],whole:WholePieceDeflections|null,slsCombinationIds:string[]){
  if(new Set(criteria.map(c=>c.id)).size!==criteria.length)throw Error("SERVICE_CRITERION_DUPLICATE");
  return criteria.map(raw=>{
    const c=declaredServiceCriterionSchema.parse(raw),piece=whole?.pieces.find(p=>p.pieceId===c.pieceId),missing=c.combinations.filter(id=>!slsCombinationIds.includes(id));
    if(!piece||piece.status!=="continuous-verified"||missing.length)return {criterion:c,status:"blocked" as const,reason:missing.length?"Combinações SLS declaradas ausentes/incompatíveis.":"Campo contínuo da peça inteira indisponível.",calculation:null,normativeVerified:false as const};
    const states=piece.combinations.filter(x=>c.combinations.includes(x.combinationId));
    if(states.length!==c.combinations.length)throw Error("SERVICE_COMBINATION_MISSING");
    const candidates=states.flatMap(x=>x.rows),axis=["global-x","global-y","global-z"].indexOf(c.quantity),value=(r:typeof candidates[number])=>axis<0?r.normM:Math.abs(r.relativeGlobalM[axis]);
    const governing=candidates.reduce((a,b)=>value(b)>value(a)?b:a),demandM=value(governing),utilization=demandM/c.limitM;
    return {criterion:c,status:demandM<=c.limitM?"meets-declared-limit" as const:"exceeds-declared-limit" as const,reason:null,calculation:{demandM,limitM:c.limitM,utilization,governing},normativeVerified:false as const};
  });
}
