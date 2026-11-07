import { z } from "zod";

/** First-order bending screening only; never a steel resistance or fabrication check. */
const finite=z.number().finite();
const positive=finite.positive();
export const purlinCandidateSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  family:z.enum(["U","Ue","tube"]),
  height_mm:finite.min(25).max(500),
  width_mm:finite.min(20).max(300),
  thickness_mm:finite.min(0.6).max(12),
  lip_mm:finite.min(0).max(100),
  price_brl_per_m:finite.min(0).max(10000).nullable(),
  source:z.string().trim().min(2).max(200),
}).strict().superRefine((c,ctx)=>{
  if(2*c.thickness_mm>=Math.min(c.height_mm,c.width_mm))
    ctx.addIssue({code:"custom",message:"Espessura incompatível com a seção."});
  if(c.family==="Ue"&&(c.lip_mm<c.thickness_mm||c.lip_mm>c.height_mm/2-c.thickness_mm))
    ctx.addIssue({code:"custom",message:"Enrijecedor fora do espaço disponível."});
  if(c.family!=="Ue"&&c.lip_mm!==0)
    ctx.addIssue({code:"custom",message:"Apenas U enrijecido aceita aba."});
});
export type PurlinCandidate=z.infer<typeof purlinCandidateSchema>;

export const purlinRequestSchema=z.object({
  schema_version:z.literal("jpn.purlin/1"),
  request_id:z.string().min(8).max(80),
  span_count:z.number().int().min(1).max(5),
  span_length_m:finite.min(.5).max(12),
  end_condition:z.enum(["simple","fixed","cantilever"]),
  uniform_load_n_m:finite.min(-200000).max(200000),
  e_gpa:finite.min(50).max(250),
  density_kg_m3:finite.min(100).max(20000),
  deflection_limit_ratio:finite.min(100).max(1000),
  candidates:z.array(purlinCandidateSchema).min(1).max(8),
}).strict().superRefine((r,ctx)=>{
  if(r.end_condition==="cantilever"&&r.span_count!==1)
    ctx.addIssue({code:"custom",message:"Balanço aceita apenas um vão."});
  if(new Set(r.candidates.map(c=>c.id)).size!==r.candidates.length)
    ctx.addIssue({code:"custom",message:"IDs dos perfis devem ser únicos."});
});
export type PurlinRequest=z.infer<typeof purlinRequestSchema>;

const reaction=z.object({at_m:finite,vertical_n:finite,moment_nm:finite}).strict();
const result=z.object({
  id:z.string(),family:z.enum(["U","Ue","tube"]),source:z.string(),
  section_model:z.literal("sharp-corner-linear-elastic-approximation"),
  area_mm2:positive,inertia_mm4:positive,mass_kg:finite.nonnegative(),
  estimated_material_cost_brl:finite.nonnegative().nullable(),
  deflection_mm:finite,deflection_at_m:finite,deflection_limit_mm:positive,
  within_user_deflection_limit:z.boolean(),
  peak_moment_nm:finite,moment_at_m:finite,peak_shear_n:finite,shear_at_m:finite,
  reactions:z.array(reaction).min(1).max(6),
  span_end_moments_nm:z.array(z.tuple([finite,finite])).min(1).max(5),
}).strict();
export const purlinResultSchema=z.object({
  schema_version:z.literal("jpn.purlin-result/1"),request_id:z.string(),
  analysis_scope:z.literal("elastic-strong-axis-bending-only-not-design-approval"),
  input:z.object({
    span_count:z.number().int().min(1).max(5),span_length_m:positive,
    end_condition:z.enum(["simple","fixed","cantilever"]),uniform_load_n_m:finite,
    e_gpa:positive,density_kg_m3:positive,deflection_limit_ratio:positive,
  }).strict(),
  results:z.array(result).min(1).max(8),
  computedStructuralApproval:z.literal(false),fabricationRelease:z.literal(false),
  limitations:z.array(z.string()).min(1),
}).strict();
export type PurlinResult=z.infer<typeof purlinResultSchema>;

export function verifyPurlinResult(req:PurlinRequest,res:PurlinResult){
  if(req.request_id!==res.request_id||req.candidates.length!==res.results.length)
    throw new Error("Resposta não corresponde à requisição.");
  for(let i=0;i<req.candidates.length;i++){
    if(req.candidates[i].id!==res.results[i].id||req.candidates[i].family!==res.results[i].family)
      throw new Error("Perfil retornado não corresponde à entrada.");
    const c=res.results[i];
    if(c.deflection_at_m<0||c.deflection_at_m>req.span_count*req.span_length_m+1e-8)
      throw new Error("Localização de deslocamento inválida.");
    if(c.reactions.some(r=>r.at_m<0||r.at_m>req.span_count*req.span_length_m+1e-8))
      throw new Error("Localização de apoio inválida.");
    if(Math.abs(c.reactions.reduce((s,r)=>s+r.vertical_n,0)+req.uniform_load_n_m*req.span_length_m*req.span_count)>Math.max(1e-6,Math.abs(req.uniform_load_n_m*req.span_length_m*req.span_count)*1e-8))
      throw new Error("Equilíbrio global de cargas não atendido.");
  }
}

export const purlinInitialCandidates: PurlinCandidate[]=[
  {id:"U-75",family:"U",height_mm:75,width_mm:40,thickness_mm:2.65,lip_mm:0,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
  {id:"UE-75",family:"Ue",height_mm:75,width_mm:40,thickness_mm:2.65,lip_mm:15,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
  {id:"TUBO-80",family:"tube",height_mm:80,width_mm:40,thickness_mm:2,lip_mm:0,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
];
