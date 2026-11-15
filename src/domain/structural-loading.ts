import { z } from "zod";
import { mixedRequestObject, mixedResultSchema, validateMixedReferences } from "./mixed-analysis";
import { canonicalSpatialInput } from "./spatial-analysis";
import { roofDistributionSchema } from "./roof-regions";
import { windDeclarationSchema } from "./wind-contracts";
import {declaredFacadeTractionSchema} from "./declared-facade-traction-contract";
const n=z.number().finite(), source=z.string().min(1).max(1000).refine(s=>!!s.trim()), id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
const vec=z.tuple([n,n,n]);
export const densitySchema=z.object({ kgM3:n.positive().max(100000),source,revision:source }).strict();
export const loadingDraftSchema=z.object({version:z.literal(1),
  selfWeight:z.object({caseId:id,gravity:vec,axialLumping:z.literal("half-to-end-nodes")}).strict().nullable(),
  uniform:z.array(z.object({id,pieceId:id,caseId:id,coordinates:z.enum(["global","local"]),knM:vec,source,revision:source}).strict()).max(320),
  roofArea:z.array(z.object({caseId:id,knM2:n.nonnegative(),projection:z.enum(["horizontal","roof-surface"]),direction:vec,source,revision:source,loadPath:source}).strict()).max(10),
  roofDistribution:roofDistributionSchema.optional(),
  wind:windDeclarationSchema.optional(),
  facadeTraction:declaredFacadeTractionSchema.optional(),
  overlapReview:z.object({confirmed:z.literal(true),source,revision:source,basis:z.string().min(1).max(1000000)}).strict().optional(),
}).strict();
export type LoadingDraft=z.infer<typeof loadingDraftSchema>;
export const emptyLoading=():LoadingDraft=>({version:1,selfWeight:null,uniform:[],roofArea:[]});
/** A review cannot prove the absence of duplicate physical actions; it records the
 * engineer's explicit declaration for exactly the edited cases/loads/model. */
export function needsSelfWeightOverlapReview(
  draft:{loads:readonly {caseId:string}[]; combinations:readonly {factors:Record<string,number|null>}[]},
  loading:LoadingDraft
):boolean {
  const weightCase=loading.selfWeight?.caseId;
  const automatic=new Set([...(weightCase?[weightCase]:[]),...loading.roofArea.map(l=>l.caseId),...(loading.wind?.cases.map(c=>c.id)??[]),...(loading.facadeTraction?.cases.map(c=>c.id)??[])]);
  const otherCases=new Set([...draft.loads.map(l=>l.caseId),...loading.uniform.map(l=>l.caseId),...automatic]);
  return draft.combinations.some(c=>[...automatic].some(a=>(c.factors[a]??0)!==0&&[...otherCases].some(b=>a!==b&&(c.factors[b]??0)!==0)));
}
export function selfWeightOverlapReviewBasis(
  draft:{geometrySignature:unknown;groups:unknown;loads:unknown;cases:unknown;combinations:unknown;physicalCatalog?:unknown},
  loading:LoadingDraft
):string {
  return canonicalSpatialInput({geometry:draft.geometrySignature,physicalGroups:draft.groups,
    ...(draft.physicalCatalog?{physicalCatalog:draft.physicalCatalog}:{}),
    nodalLoads:draft.loads,cases:draft.cases,combinations:draft.combinations,
    uniformLoads:loading.uniform,selfWeight:loading.selfWeight,
    ...(loading.roofArea.length?{roofArea:loading.roofArea}:{}),
    ...(loading.roofDistribution?{roofDistribution:loading.roofDistribution}:{}),
    ...(loading.wind?{wind:loading.wind}:{}),
    ...(loading.facadeTraction?{facadeTraction:loading.facadeTraction}:{})});
}

const uniformSchema=z.object({id,member:id,case:id,coordinate_system:z.enum(["global","local"]),force_per_length_n_m:vec.refine(v=>v.every(x=>Math.abs(x)<=1e9)),source,revision:source}).strict();
const loadedMixedObject=mixedRequestObject.extend({schema_version:z.literal("jpn.mixed3d/2"),nodal_loads:z.array(mixedRequestObject.shape.nodal_loads.element).max(500),
  member_loads:z.array(uniformSchema).max(640),self_weight:z.object({case:id,gravity_m_s2:vec.refine(v=>v.every(x=>Math.abs(x)<=100)&&Math.hypot(...v)>0),axial_lumping:z.literal("half-to-end-nodes"),densities:z.array(z.object({member:id,kg_m3:n.positive().max(100000),source,revision:source}).strict()).max(320)}).strict().nullable(),
}).strict();
type LoadedMixedShape=Omit<z.infer<typeof loadedMixedObject>,"schema_version">;
const refineLoadedMixed=(v:LoadedMixedShape,ctx:z.RefinementCtx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  validateMixedReferences(v,ctx,[...v.member_loads.map(l=>l.case),...(v.self_weight?[v.self_weight.case]:[])]);
  if(new Set(v.member_loads.map(l=>l.id)).size!==v.member_loads.length)issue("IDs de cargas uniformes duplicados.");
  for(const l of v.member_loads)if(!v.cases.some(c=>c.id===l.case)||!v.members.some(m=>m.id===l.member&&m.kind==="frame"))issue("Carga uniforme exige caso e pórtico existentes; axial não recebe flexão.");
  const sw=v.self_weight;
  if(sw){if(!v.cases.some(c=>c.id===sw.case)||v.member_loads.some(l=>l.case===sw.case)||v.nodal_loads.some(l=>l.case===sw.case))issue("Caso exclusivo de peso próprio ausente ou contém cargas manuais.");
    if(sw.densities.length!==v.members.length||new Set(sw.densities.map(d=>d.member)).size!==v.members.length||sw.densities.some(d=>!v.members.some(m=>m.id===d.member)))issue("Densidades devem cobrir cada segmento uma única vez.");}
};
export const loadedMixedRequestSchema=loadedMixedObject.superRefine(refineLoadedMixed);
/** C1: /3 = every /2 field and rule + the explicit Z-up local-axes reference. /1 and /2 keep their own schemas and hashes. */
export const localAxesConvention="jpn-z-up/1" as const;
export const loadedMixedRequestV3Schema=loadedMixedObject.extend({schema_version:z.literal("jpn.mixed3d/3"),local_axes:z.literal(localAxesConvention)}).strict().superRefine(refineLoadedMixed);
const legacyCombo=mixedResultSchema.shape.combinations.valueType;
const axial=legacyCombo.shape.members.valueType.options[0], frame=legacyCombo.shape.members.valueType.options[1];
export const loadedMixedResultSchema=mixedResultSchema.extend({schema_version:z.literal("jpn.mixed3d-result/2"),solver:mixedResultSchema.shape.solver.extend({adapter:z.literal("jpn-mixed3d/2")}),
  combinations:z.record(id,legacyCombo.extend({members:z.record(id,z.discriminatedUnion("kind",[axial,frame.extend({stations:z.array(z.object({x_m:n,n_n:n,vy_n:n,vz_n:n,t_nm:n,my_nm:n,mz_nm:n,translation_local_m:vec}).strict()).length(5)})]))})),
  loading:z.object({member_loads:z.array(uniformSchema).max(640),self_weight:z.object({case:id,gravity_m_s2:vec,axial_lumping:z.literal("half-to-end-nodes"),total_mass_kg:n.nonnegative(),members:z.array(z.object({member:id,mass_kg:n.nonnegative(),force_n:vec,density:z.object({member:id,kg_m3:n.positive(),source,revision:source}).strict(),representation:z.enum(["consistent-frame-udl","half-to-end-nodes"])}).strict()).max(320)}).strict().nullable()}).strict(),
});
const axesRow=z.object({declared_rotation_deg:n,reference_offset_deg:n,solver_rotation_deg:n,global_to_local:z.array(z.array(n).length(3)).length(3)}).strict();
export const loadedMixedResultV3Schema=loadedMixedResultSchema.extend({schema_version:z.literal("jpn.mixed3d-result/3"),
  solver:mixedResultSchema.shape.solver.extend({adapter:z.literal("jpn-mixed3d/3")}),
  local_axes:z.object({convention:z.literal(localAxesConvention),members:z.record(id,axesRow)}).strict()});
export const anyMixedRequestSchema=z.union([mixedRequestObject.superRefine((v,c)=>validateMixedReferences(v,c)),loadedMixedRequestSchema,loadedMixedRequestV3Schema]);
export const anyMixedResultSchema=z.union([mixedResultSchema,loadedMixedResultSchema,loadedMixedResultV3Schema]);
/** Requests/results that carry the declared-loading trace (/2 and /3). */
export const isLoadedRequest=(r:{schema_version:string}):r is z.infer<typeof loadedMixedRequestSchema>|z.infer<typeof loadedMixedRequestV3Schema>=>r.schema_version==="jpn.mixed3d/2"||r.schema_version==="jpn.mixed3d/3";
export const isLoadedResult=(r:{schema_version:string}):r is z.infer<typeof loadedMixedResultSchema>|z.infer<typeof loadedMixedResultV3Schema>=>r.schema_version==="jpn.mixed3d-result/2"||r.schema_version==="jpn.mixed3d-result/3";
export function verifyLoadingTrace(request:z.infer<typeof anyMixedRequestSchema>,result:z.infer<typeof anyMixedResultSchema>){
  if(!isLoadedRequest(request)||!isLoadedResult(result))return;
  if(request.schema_version==="jpn.mixed3d/3"&&result.schema_version==="jpn.mixed3d-result/3")verifyAxesTrace(request,result);
  const equal=(a:unknown,b:unknown)=>canonicalSpatialInput(a)===canonicalSpatialInput(b),sw=request.self_weight,trace=result.loading.self_weight;
  if(!equal(request.member_loads,result.loading.member_loads)||!!sw!==!!trace)throw new Error("Rastreabilidade das cargas incompatível.");
  if(sw&&trace){
    if(sw.case!==trace.case||!equal(sw.gravity_m_s2,trace.gravity_m_s2)||trace.members.length!==request.members.length||new Set(trace.members.map(m=>m.member)).size!==request.members.length)throw new Error("Rastreabilidade do peso incompleta.");
    let mass=0;
    for(const m of request.members){const a=request.nodes.find(n=>n.id===m.start)!,b=request.nodes.find(n=>n.id===m.end)!,d=sw.densities.find(d=>d.member===m.id)!,t=trace.members.find(t=>t.member===m.id);const area=m.kind==="axial"?m.area_m2:request.sections.find(s=>s.id===m.section)!.area_m2;const expected=d.kg_m3*area*Math.hypot(b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m);mass+=expected;
      if(!t||!equal(d,t.density)||t.representation!==(m.kind==="axial"?"half-to-end-nodes":"consistent-frame-udl")||Math.abs(t.mass_kg-expected)>1e-10*Math.max(expected,1)||t.force_n.some((v,i)=>Math.abs(v-expected*sw.gravity_m_s2[i])>1e-10*Math.max(Math.abs(v),1)))throw new Error("Peso de segmento sem conservação/rastreabilidade.");}
    if(Math.abs(trace.total_mass_kg-mass)>1e-10*Math.max(mass,1))throw new Error("Massa total incompatível.");
  }
}

/** C1: the result must trace, for every frame member, the declared roll it received and the basis the solver actually used. */
function verifyAxesTrace(request:z.infer<typeof loadedMixedRequestV3Schema>,result:z.infer<typeof loadedMixedResultV3Schema>){
  const frames=request.members.filter(m=>m.kind==="frame");
  const ids=Object.keys(result.local_axes.members).sort().join("|");
  if(ids!==frames.map(m=>m.id).sort().join("|"))throw new Error("AXES_TRACE: eixos locais ausentes ou excedentes na resposta /3.");
  for(const m of frames){
    const row=result.local_axes.members[m.id];
    if(Math.abs(row.declared_rotation_deg-m.rotation_deg)>1e-12)throw new Error("AXES_TRACE: giro declarado na resposta difere do enviado em "+m.id+".");
    const g=row.global_to_local;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const dot=g[i][0]*g[j][0]+g[i][1]*g[j][1]+g[i][2]*g[j][2];
      if(Math.abs(dot-(i===j?1:0))>1e-9)throw new Error("AXES_TRACE: base local não ortonormal em "+m.id+".");
    }
  }
}
