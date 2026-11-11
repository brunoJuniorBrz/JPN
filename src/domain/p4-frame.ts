import {z} from "zod";
import type {Project} from "./models";
import {mixedInputHash,mixedRequestSchema,mixedResultSchema,verifyMixedResult} from "./mixed-analysis";
import {canonicalSpatialInput} from "./spatial-analysis";
import {secondOrderRequestSchema,prepareSecondOrderFrameAnalysis,verifySecondOrderMeshGeometry} from "./second-order-frame";
import {corotationalNumericsSchema} from "./corotational-frame";
import {auditP4Element} from "./p4-energy-audit";

const f=z.number(),nonnegative=f.nonnegative(),v=z.tuple([f,f,f]),quaternion=z.tuple([f,f,f,f]);
const id=z.string().min(1).max(100),hash=z.string().regex(/^[0-9a-f]{64}$/),basis=z.array(v).length(3);
export const p4RequestSchema=z.object({...secondOrderRequestSchema.shape,schema_version:z.literal("jpn.second-order-frame/3"),
  analysis_type:z.literal("experimental-p4-corotational-diagnostic"),dimensionality:z.union([z.literal(2),z.literal(3)]),
  formulation:z.enum(["xz-hermite-arc/1","spatial-quaternion-arc/1"]),numerics:corotationalNumericsSchema,
}).strict().superRefine((r,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if((r.dimensionality===2)!==(r.formulation==="xz-hermite-arc/1"))issue("P4_FORMULATION");
  const {dimensionality:unused,formulation:unused2,...old}=r;void unused;void unused2;
  const valid=secondOrderRequestSchema.safeParse({...old,schema_version:"jpn.second-order-frame/1",analysis_type:"experimental-pdelta-diagnostic",
    numerics:{coarse_subdivisions:r.numerics.coarse_subdivisions,fine_subdivisions:r.numerics.fine_subdivisions,max_tc_iterations:1,
      equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4}});
  if(!valid.success)issue("P4_PHYSICAL_DOMAIN: "+valid.error.message);
  if(r.model.members.some(m=>m.kind==="frame"&&m.rotation_deg!==0))issue("P4_SECTION_ROLL_PENDING");
  if(r.dimensionality===2){
    if(r.model.nodes.some(n=>Math.abs(n.y_m-r.model.nodes[0].y_m)>1e-12)||r.model.nodal_loads.some(l=>l.fy_n||l.mx_nm||l.mz_nm))issue("P4_SPATIAL_PROJECTION_FORBIDDEN");
  }else{
    if(r.model.nodal_loads.some(l=>l.mx_nm||l.my_nm||l.mz_nm))issue("SPATIAL_APPLIED_MOMENT_PENDING");
    if(r.model.supports.some(s=>s.restrained.slice(3).some(Boolean)&&!s.restrained.slice(3).every(Boolean)))issue("SPATIAL_PARTIAL_ROTATION_SUPPORT_PENDING");
  }
});
export type P4Request=z.infer<typeof p4RequestSchema>;
export type P4Formulation=P4Request["formulation"];
const node=z.object({translation_m:v,rotation_rad:v,orientation_quaternion:quaternion,reaction_force_n:v,reaction_moment_nm:v}).strict();
const member=z.object({end_actions_global:z.array(f).length(12),end_actions_local:z.array(f).length(12),current_basis:basis,reference_basis:basis,
  strain_energy_j:nonnegative,local_state:z.object({extension_m:f,arc_extension_m:nonnegative,axial_n:f,torsion_nm:f,
    local_rotation_i:v.optional(),local_rotation_j:v.optional(),torsion_rad:f.optional()}).strict()}).strict();
const step=z.object({step:z.number().int().min(1).max(10),iterations:z.number().int().min(1).max(29),newton_residual_evaluations:z.number().int().min(2).max(30),
  line_search_force_evaluations:z.number().int().min(1).max(261),linear_system_solves:z.number().int().min(2).max(58),
  algebraic_relative_residual:nonnegative.max(1e-8),scaled_displacement_increment:nonnegative.max(1e-10),scaled_internal_force_change:nonnegative.max(1e-8),
  minimum_tangent_ratio:f,maximum_tangent_ratio:f.positive(),scaled_tangent_condition:f.min(1).max(1e10)}).strict();
const meshSchema=z.object({analysis_model:mixedRequestSchema,subdivisions:z.number().int().min(1).max(64),node_count:z.number().int().min(2).max(150),
  member_count:z.number().int().min(1).max(320),elastic_scaled_condition:f.min(1).max(1e10),
  numerical_member_mapping:z.array(z.object({id,parent_member:id,start_fraction:f.min(0).max(1),end_fraction:f.min(0).max(1)}).strict()).max(320),
  combinations:z.record(id,z.object({nodes:z.record(id,node),members:z.record(id,member),
    equilibrium:z.object({force_residual_n:v,deformed_geometry_moment_residual_nm:v,force_relative_residual:v,moment_relative_residual:v,accepted:z.literal(true)}).strict(),
    newton_steps:z.array(step).length(10),strain_energy_j:nonnegative,final_external_dead_load_potential_j:f,physical_equilibrium_verified:z.literal(true),
    stability:z.object({domain:z.enum(["XZ invariant subspace only","full spatial conservative energy Hessian"]),positive_definite:z.literal(true),
      minimum_generalized_eigenvalue:f.positive(),generalized_mode:z.array(f).min(6).max(900),
      normalization:z.literal("max(abs(mode)/[span translations, unit rotations])=1"),normative_stability_verified:z.literal(false)}).strict(),
  }).strict()),
}).strict();
export const p4DiagnosticSchema=z.object({schema_version:z.literal("jpn.second-order-frame-diagnostic/3"),status:z.literal("diagnostic-only"),units:z.literal("SI"),
  input_sha256:hash,binding:secondOrderRequestSchema.shape.binding,project:mixedRequestSchema.shape.project,
  dimensionality:p4RequestSchema.shape.dimensionality,formulation:p4RequestSchema.shape.formulation,
  solver:z.object({name:z.literal("JPN-P4"),version:z.literal("1.0"),method:z.literal("energy-consistent-Newton"),
    rotation_measure:z.literal("SO(3) exponential coordinates; scalar-first quaternions")}).strict(),coarse:meshSchema,candidate:meshSchema,linear_baseline:mixedResultSchema,
  comparison:z.record(id,z.object({translation_m:nonnegative,rotation_rad:nonnegative,member_end_actions:nonnegative}).strict()),
  blockers:z.array(z.string()).min(3).max(20),physical_convergence_verified:z.boolean(),spatial_domain_verified:z.literal(false),production_enabled:z.literal(false),
  normative_stability_verified:z.literal(false),computed_structural_approval:z.literal(false),fabrication_release:z.literal(false),release_gate:z.literal("NOT_READY_BLOCKED"),
}).strict();
export type P4Diagnostic=z.infer<typeof p4DiagnosticSchema>;
const same=(a:unknown,b:unknown)=>canonicalSpatialInput(a)===canonicalSpatialInput(b);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:number[])=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
function fail(reason:string):never{throw Error("P4_DIAGNOSTIC_INVALID: "+reason);}
function near(a:number,b:number,atol=1e-8){if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>atol+1e-8*Math.max(Math.abs(a),Math.abs(b)))fail("energia/força/residual inconsistentes");}
const forceKeys=["fx_n","fy_n","fz_n","mx_nm","my_nm","mz_nm"] as const;

function verifyMesh(request:P4Request,mesh:z.infer<typeof meshSchema>,subdivisions:number){
  verifySecondOrderMeshGeometry(request.model,mesh,subdivisions);
  const model=mesh.analysis_model,points=new Map(model.nodes.map(n=>[n.id,[n.x_m,n.y_m,n.z_m]])),dim=request.dimensionality;
  if(!same(Object.keys(mesh.combinations).sort(),model.combinations.map(c=>c.id).sort()))fail("combinações incompletas");
  const span=Math.max(1e-5,...[0,1,2].map(i=>Math.max(...Array.from(points.values(),p=>p[i]))-Math.min(...Array.from(points.values(),p=>p[i]))));
  for(const [cid,a]of Object.entries(mesh.combinations)){
    if(!same(Object.keys(a.nodes).sort(),model.nodes.map(n=>n.id).sort())||!same(Object.keys(a.members).sort(),model.members.map(m=>m.id).sort()))fail("IDs incompletos");
    const loads=new Map(model.nodes.map(n=>[n.id,Array(6).fill(0) as number[]])),internal=new Map(model.nodes.map(n=>[n.id,Array(6).fill(0) as number[]]));
    const factors=model.combinations.find(c=>c.id===cid)!.factors;
    for(const l of model.nodal_loads)forceKeys.forEach((key,i)=>loads.get(l.node)![i]+=(factors[l.case]??0)*l[key]);
    let energy=0,potential=0;
    for(const m of model.members){
      if(m.kind!=="frame")fail("axial recusada");
      const x=[points.get(m.start)!,points.get(m.end)!],n=[a.nodes[m.start],a.nodes[m.end]],r=a.members[m.id];
      const q=n.flatMap(n=>[...n.translation_m,...n.rotation_rad]),axis=unit(x[1].map((v,i)=>v-x[0][i]));
      const z=Math.abs(axis[1])>1-1e-12?[0,0,1]:unit(cross(axis,[0,1,0])),expected=[axis,unit(cross(z,axis)),z];
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(expected[i][j],r.reference_basis[i][j],1e-10);
      const sec=model.sections.find(s=>s.id===m.section)!,mat=model.materials.find(s=>s.id===m.material)!;
      const audited=auditP4Element(x,q,mat.e_pa*sec.area_m2,mat.e_pa*sec.iy_m4,mat.e_pa*sec.iz_m4,mat.g_pa*sec.j_m4,r.reference_basis,dim);
      audited.physical.forEach((v,i)=>near(v,r.end_actions_global[i],1e-5));near(audited.energy,r.strain_energy_j);energy+=audited.energy;
      audited.currentBasis.forEach((row,i)=>row.forEach((v,j)=>near(v,r.current_basis[i][j],1e-10)));
      near(audited.axial,r.local_state.axial_n,1e-5);near(audited.extension,r.local_state.extension_m,1e-10);
      near(audited.arc,r.local_state.arc_extension_m,1e-10);near(audited.torsion,r.local_state.torsion_nm,1e-5);
      if(dim===3){
        if(!r.local_state.local_rotation_i||!r.local_state.local_rotation_j||r.local_state.torsion_rad===undefined)fail("diretores ausentes");
        audited.betaI.forEach((v,i)=>near(v,r.local_state.local_rotation_i![i],1e-10));audited.betaJ.forEach((v,i)=>near(v,r.local_state.local_rotation_j![i],1e-10));
      }
      n.forEach((n,i)=>n.orientation_quaternion.forEach((v,j)=>near(v,audited.quaternions[i][j],1e-10)));
      const currentAxis=unit(x[1].map((v,i)=>v+n[1].translation_m[i]-x[0][i]-n[0].translation_m[i]));
      currentAxis.forEach((v,i)=>near(v,r.current_basis[0][i],1e-10));
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(r.current_basis[i].reduce((s,v,k)=>s+v*r.current_basis[j][k],0),i===j?1:0,1e-10);
      cross(r.current_basis[0],r.current_basis[1]).forEach((v,i)=>near(v,r.current_basis[2][i],1e-10));
      for(let start=0;start<12;start+=3)for(let i=0;i<3;i++)near(r.current_basis[i].reduce((s,v,k)=>s+v*r.end_actions_global[start+k],0),r.end_actions_local[start+i],1e-5);
      for(let i=0;i<6;i++){internal.get(m.start)![i]+=r.end_actions_global[i];internal.get(m.end)![i]+=r.end_actions_global[i+6];}
    }
    near(energy,a.strain_energy_j);
    const netF=[0,0,0],netM=[0,0,0],fs=[1,1,1],ms=[1,1,1],origin=points.get(model.nodes[0].id)!;
    for(const p of model.nodes){
      const n=a.nodes[p.id],load=loads.get(p.id)!,reaction=[...n.reaction_force_n,...n.reaction_moment_nm],motion=[...n.translation_m,...n.rotation_rad];
      const fixed=model.supports.find(s=>s.node===p.id)?.restrained??Array(6).fill(false);
      if(fixed.some((v,i)=>v?Math.abs(motion[i])>1e-12:Math.abs(reaction[i])>1e-8))fail("vínculo alterado");
      if(Math.max(...n.translation_m.map(Math.abs))/span>.01||Math.hypot(...n.rotation_rad)>.05)fail("movimento fora do domínio");
      if(dim===2&&(n.translation_m[1]!==0||n.rotation_rad[0]!==0||n.rotation_rad[2]!==0))fail("projeção espacial indevida");
      for(let i=0;i<6;i++){near(internal.get(p.id)![i],load[i]+reaction[i],1e-5);potential+=load[i]*motion[i];}
      const force=load.slice(0,3).map((v,i)=>v+reaction[i]),moment=load.slice(3).map((v,i)=>v+reaction[i+3]);
      const r=points.get(p.id)!.map((v,i)=>v+n.translation_m[i]-origin[i]),m=cross(r,force),applied=cross(r,load);
      for(let i=0;i<3;i++){netF[i]+=force[i];netM[i]+=m[i]+moment[i];fs[i]+=Math.abs(load[i]);ms[i]+=Math.abs(applied[i])+Math.abs(load[i+3]);}
    }
    near(potential,a.final_external_dead_load_potential_j);
    const rf=netF.map((v,i)=>Math.abs(v)/fs[i]),rm=netM.map((v,i)=>Math.abs(v)/ms[i]);
    for(const [x,y]of [[netF,a.equilibrium.force_residual_n],[netM,a.equilibrium.deformed_geometry_moment_residual_nm],[rf,a.equilibrium.force_relative_residual],[rm,a.equilibrium.moment_relative_residual]])x.forEach((v,i)=>near(v,y[i]));
    if(Math.max(...rf,...rm)>1e-8)fail("equilíbrio deformado reprovado");
    const dofs=dim===2?3:6,free=dofs*model.nodes.length-model.supports.reduce((sum,s)=>sum+(dim===2?[0,2,4]:[0,1,2,3,4,5]).filter(i=>s.restrained[i]).length,0);
    a.newton_steps.forEach((s,i)=>{const roundoff=100*free*Number.EPSILON*Math.max(1,s.maximum_tangent_ratio);
      if(s.step!==i+1||s.newton_residual_evaluations!==s.iterations+1||s.linear_system_solves!==2*s.iterations||s.line_search_force_evaluations<s.iterations||s.minimum_tangent_ratio<.6-roundoff)fail("etapas/margem inconsistentes");});
    if(a.stability.generalized_mode.length!==model.nodes.length*dofs||a.stability.domain!==(dim===2?"XZ invariant subspace only":"full spatial conservative energy Hessian"))fail("modo/domínio de estabilidade inválido");
    let normalized=0;
    model.nodes.forEach((n,index)=>{
      const fixed=model.supports.find(s=>s.node===n.id)?.restrained??Array(6).fill(false);
      for(let d=0;d<dofs;d++){const m=a.stability.generalized_mode[index*dofs+d],physical=dim===2?[0,2,4][d]:d;
        if(fixed[physical]&&Math.abs(m)>1e-12)fail("modo altera apoio físico");normalized=Math.max(normalized,Math.abs(m)/(d<(dim===2?2:3)?span:1));}
    });
    near(normalized,1,1e-8);
    near(a.stability.minimum_generalized_eigenvalue,a.newton_steps[9].minimum_tangent_ratio,1e-8);
  }
}

export async function verifyP4Diagnostic(request:P4Request,result:P4Diagnostic){
  if(await mixedInputHash(request.model)!==request.binding.model_sha256||await mixedInputHash(request)!==result.input_sha256||
    !same(request.binding,result.binding)||!same(request.model.project,result.project)||request.formulation!==result.formulation||request.dimensionality!==result.dimensionality)fail("hash/revisão/formulação divergentes");
  verifyMesh(request,result.coarse,request.numerics.coarse_subdivisions);verifyMesh(request,result.candidate,request.numerics.fine_subdivisions);
  verifyMixedResult(result.candidate.analysis_model,result.linear_baseline,await mixedInputHash(result.candidate.analysis_model));
  for(const b of ["P4_PRODUCTION_DOMAIN_NOT_VERIFIED","P4_NORMATIVE_REVIEW_PENDING",request.dimensionality===2?"P4_OUT_OF_PLANE_STABILITY_PENDING":"P4_SPATIAL_DOMAIN_NOT_VERIFIED"])if(!result.blockers.includes(b))fail("bloqueio ausente");
  if(!same(Object.keys(result.comparison).sort(),request.model.combinations.map(c=>c.id).sort()))fail("comparação incompleta");
  let verified=true;
  for(const c of request.model.combinations){
    const fine=result.candidate.combinations[c.id],coarse=result.coarse.combinations[c.id],errors:number[]=[];
    for(const field of ["translation_m","rotation_rad"] as const){const a=request.model.nodes.flatMap(n=>coarse.nodes[n.id][field]),b=request.model.nodes.flatMap(n=>fine.nodes[n.id][field]);
      const error=Math.max(...b.map((v,i)=>Math.abs(v-a[i])))/Math.max(1e-12,...b.map(Math.abs));near(error,result.comparison[c.id][field],1e-10);errors.push(error);}
    const ends=(m:z.infer<typeof meshSchema>,parent:string)=>{const children=m.numerical_member_mapping.filter(c=>c.parent_member===parent).sort((a,b)=>a.start_fraction-b.start_fraction),r=m.combinations[c.id].members;
      return [...r[children[0].id].end_actions_global.slice(0,6),...r[children.at(-1)!.id].end_actions_global.slice(6)];};
    const err=Math.max(...request.model.members.flatMap(p=>{const a=ends(result.coarse,p.id),b=ends(result.candidate,p.id);return b.map((v,i)=>Math.abs(v-a[i])/Math.max(1,Math.abs(v)));}));
    near(err,result.comparison[c.id].member_end_actions,1e-10);errors.push(err);
    if(Math.max(...errors)>1e-4){verified=false;if(!result.blockers.includes("P4_REFINEMENT_NOT_CONVERGED:"+c.id))fail("refinamento sem bloqueio");}
  }
  if(result.physical_convergence_verified!==verified)fail("convergência indevidamente declarada");
}

export async function prepareP4FrameAnalysis(project:Project,numerics:unknown,formulation:P4Formulation){
  const n=corotationalNumericsSchema.parse(numerics),prepared=await prepareSecondOrderFrameAnalysis(project,{coarse_subdivisions:n.coarse_subdivisions,
    fine_subdivisions:n.fine_subdivisions,max_tc_iterations:1,equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4});
  const request=p4RequestSchema.parse({...prepared.request,schema_version:"jpn.second-order-frame/3",analysis_type:"experimental-p4-corotational-diagnostic",
    dimensionality:formulation==="xz-hermite-arc/1"?2:3,formulation,numerics:n});
  return {request,input_sha256:await mixedInputHash(request),physicalPreparation:prepared.physicalPreparation};
}
export type PreparedP4Frame=Awaited<ReturnType<typeof prepareP4FrameAnalysis>>;
export async function buildP4FrameReport(project:Project,prepared:PreparedP4Frame,value:unknown){
  const current=await prepareP4FrameAnalysis(project,prepared.request.numerics,prepared.request.formulation);
  if(current.input_sha256!==prepared.input_sha256||!same(current.request,prepared.request))throw Error("STALE_P4_ANALYSIS");
  const diagnostic=p4DiagnosticSchema.parse(value);await verifyP4Diagnostic(current.request,diagnostic);
  const report={schema_version:"jpn.second-order-frame-report/3" as const,request:current.request,diagnostic,status:"NOT_READY_BLOCKED" as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,purpose:"Ensaio P4; domínio espacial, revisão normativa e uso produtivo bloqueados."};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export async function assertP4ReportCurrent(report:Awaited<ReturnType<typeof buildP4FrameReport>>,project:Project,prepared:PreparedP4Frame,value:unknown){
  const {reportSha256,...body}=report;
  if(await mixedInputHash(body)!==reportSha256||(await buildP4FrameReport(project,prepared,value)).reportSha256!==reportSha256)throw Error("STALE_P4_REPORT");
}
