import { z } from "zod";

/** First-order bending screening only; never a steel resistance or fabrication check. */
const finite=z.number().finite();
const positive=finite.positive();
export const purlinCandidateSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  family:z.enum(["U","Ue","tube"]),
  height_mm:finite.min(25).max(500),
  width_mm:finite.min(20).max(300),
  thickness_mm:finite.min(0.6,{error:"Espessura incompatível: mínimo de 0,6 mm."}).max(12,{error:"Espessura incompatível: máximo de 12 mm."}),
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
  load_mode:z.enum(["line","surface"]).optional(),
  surface_pressure_n_m2:finite.min(-30000).max(30000).optional(),
  tributary_width_m:finite.min(.05).max(5).optional(),
  load_source:z.string().trim().min(3).max(200).optional(),
  include_self_weight:z.boolean().optional(),
  gravity_m_s2:finite.min(9).max(10).optional(),
  e_gpa:finite.min(50).max(250),
  density_kg_m3:finite.min(100).max(20000),
  deflection_limit_ratio:finite.min(100).max(1000),
  candidates:z.array(purlinCandidateSchema).min(1).max(8),
}).strict().superRefine((r,ctx)=>{
  if(r.load_mode==="surface"){
    if(r.uniform_load_n_m!==0||r.surface_pressure_n_m2===undefined||r.tributary_width_m===undefined||!r.load_source)
      ctx.addIssue({code:"custom",message:"Carga superficial requer pressão, faixa tributária, origem e carga linear zero."});
  }else if(r.surface_pressure_n_m2!==undefined||r.tributary_width_m!==undefined){
    ctx.addIssue({code:"custom",message:"No modo linear, não preencha carga superficial."});
  }
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
  declared_line_load_n_m:finite,self_weight_line_load_n_m:finite,total_line_load_n_m:finite,
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
    load_mode:z.enum(["line","surface"]),
    surface_pressure_n_m2:finite.nullable(),tributary_width_m:finite.nullable(),
    load_source:z.string().nullable(),include_self_weight:z.boolean(),gravity_m_s2:positive,
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
    const base=req.load_mode==="surface"?(req.surface_pressure_n_m2??0)*(req.tributary_width_m??0):req.uniform_load_n_m;
    const weight=req.include_self_weight?c.area_mm2*1e-6*req.density_kg_m3*(req.gravity_m_s2??9.80665):0;
    const net=base-weight;
    const close=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-9);
    if(!close(c.declared_line_load_n_m,base)||!close(c.self_weight_line_load_n_m,-weight)||!close(c.total_line_load_n_m,net))
      throw new Error("A composição da carga foi alterada ou não corresponde à seção.");
    if(!close(c.reactions.reduce((sum,r)=>sum+r.vertical_n,0),-net*req.span_length_m*req.span_count))
      throw new Error("Equilíbrio global de cargas não atendido.");
    const expectedMass=c.area_mm2*1e-6*req.density_kg_m3*req.span_count*req.span_length_m;
    const expectedCost=req.candidates[i].price_brl_per_m===null?null:
      req.candidates[i].price_brl_per_m!*req.span_count*req.span_length_m;
    const deflectionLimit=1000*req.span_length_m/req.deflection_limit_ratio;
    if(!close(c.mass_kg,expectedMass)||!close(c.deflection_limit_mm,deflectionLimit)
      ||c.source!==req.candidates[i].source
      ||(expectedCost===null?c.estimated_material_cost_brl!==null:
        c.estimated_material_cost_brl===null||!close(c.estimated_material_cost_brl,expectedCost))
      ||c.within_user_deflection_limit!==(Math.abs(c.deflection_mm)<=c.deflection_limit_mm*(1+1e-10)))
      throw new Error("Massa, custo, limite de flecha ou proveniência não correspondem às entradas.");
    if(res.input.span_count!==req.span_count||!close(res.input.span_length_m,req.span_length_m)
      ||res.input.end_condition!==req.end_condition||!close(res.input.e_gpa,req.e_gpa)
      ||!close(res.input.density_kg_m3,req.density_kg_m3)||!close(res.input.deflection_limit_ratio,req.deflection_limit_ratio)
      ||!close(res.input.uniform_load_n_m,req.uniform_load_n_m)||res.input.load_mode!==(req.load_mode??"line")
      ||res.input.include_self_weight!==(req.include_self_weight??false)
      ||!close(res.input.gravity_m_s2,req.gravity_m_s2??9.80665)
      ||res.input.load_source!==(req.load_source??null)
      ||res.input.surface_pressure_n_m2!==(req.surface_pressure_n_m2??null)
      ||res.input.tributary_width_m!==(req.tributary_width_m??null)){
      throw new Error("Origem da carga retornada não corresponde à entrada.");
    }
  }
}

export const purlinInitialCandidates: PurlinCandidate[]=[
  {id:"U-75",family:"U",height_mm:75,width_mm:40,thickness_mm:2.65,lip_mm:0,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
  {id:"UE-75",family:"Ue",height_mm:75,width_mm:40,thickness_mm:2.65,lip_mm:15,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
  {id:"TUBO-80",family:"tube",height_mm:80,width_mm:40,thickness_mm:2,lip_mm:0,price_brl_per_m:null,source:"Geometria nominal digitada; confirmar fabricante"},
];
