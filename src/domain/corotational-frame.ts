import {z} from "zod";
import type {Project} from "./models";
import {mixedInputHash,mixedRequestSchema,mixedResultSchema,verifyMixedResult} from "./mixed-analysis";
import {canonicalSpatialInput} from "./spatial-analysis";
import {secondOrderRequestSchema,prepareSecondOrderFrameAnalysis,verifySecondOrderMeshGeometry} from "./second-order-frame";

const scalar=z.number(),positive=scalar.nonnegative(),vector=z.tuple([scalar,scalar,scalar]);
const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(100);
export const corotationalNumericsSchema=z.object({
  coarse_subdivisions:z.number().int().min(1).max(32),fine_subdivisions:z.number().int().min(2).max(64),
  load_steps:z.literal(10),max_newton_iterations:z.literal(30),equilibrium_relative_tolerance:z.literal(1e-8),
  refinement_relative_tolerance:z.literal(1e-4),displacement_increment_tolerance:z.literal(1e-10),force_change_tolerance:z.literal(1e-8),
}).strict().refine(n=>n.fine_subdivisions===2*n.coarse_subdivisions,"Refinamento 2:1 obrigatório");
export const corotationalRequestSchema=z.object({...secondOrderRequestSchema.shape,
  schema_version:z.literal("jpn.second-order-frame/2"),analysis_type:z.literal("experimental-corotational-xz-diagnostic"),
  numerics:corotationalNumericsSchema,
}).strict().superRefine((r,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  const {max_newton_iterations:iterations,...n}=r.numerics;void iterations;
  const legacy=secondOrderRequestSchema.safeParse({...r,schema_version:"jpn.second-order-frame/1",
    analysis_type:"experimental-pdelta-diagnostic",numerics:{coarse_subdivisions:n.coarse_subdivisions,
      fine_subdivisions:n.fine_subdivisions,max_tc_iterations:1,equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4}});
  if(!legacy.success)issue("COROTATIONAL_PHYSICAL_DOMAIN: "+legacy.error.message);
  const y=r.model.nodes[0]?.y_m;
  if(r.model.nodes.some(p=>Math.abs(p.y_m-y)>1e-12)||r.model.nodal_loads.some(l=>l.fy_n!==0||l.mx_nm!==0||l.mz_nm!==0))
    issue("COROTATIONAL_SPATIAL_PENDING: não projetar geometria nem descartar ações");
  if(r.model.members.some(m=>m.kind==="frame"&&m.rotation_deg!==0))issue("COROTATIONAL_SECTION_ROLL_PENDING");
});
export type CorotationalRequest=z.infer<typeof corotationalRequestSchema>;
const node=z.object({translation_m:vector,rotation_rad:vector,reaction_force_n:vector,reaction_moment_nm:vector}).strict();
const member=z.object({end_actions_global:z.array(scalar).length(12),end_actions_local:z.array(scalar).length(12),
  current_basis:z.array(vector).length(3),axial_n:scalar,geometric_axial_n:scalar,basic_deformation:vector,basic_force:vector,strain_energy_j:positive}).strict();
const equilibrium=z.object({force_residual_n:vector,deformed_geometry_moment_residual_nm:vector,
  force_relative_residual:vector,moment_relative_residual:vector,accepted:z.literal(true)}).strict();
const step=z.object({step:z.number().int().min(1).max(10),iterations:z.number().int().min(1).max(29),
  newton_residual_evaluations:z.number().int().min(2).max(30),line_search_force_evaluations:z.number().int().min(1).max(261),linear_system_solves:z.number().int().min(2).max(58),algebraic_relative_residual:positive.max(1e-8),
  scaled_displacement_increment:positive.max(1e-10),scaled_internal_force_change:positive.max(1e-8),
  minimum_tangent_ratio:scalar,maximum_tangent_ratio:scalar.positive(),scaled_tangent_condition:scalar.min(1).max(1e10)}).strict();
const mesh=z.object({analysis_model:mixedRequestSchema,subdivisions:z.number().int().min(1).max(64),
  node_count:z.number().int().min(2).max(150),member_count:z.number().int().min(1).max(320),
  numerical_member_mapping:z.array(z.object({id,parent_member:id,start_fraction:scalar.min(0).max(1),end_fraction:scalar.min(0).max(1)}).strict()).max(320),
  elastic_scaled_condition:scalar.min(1).max(1e10),combinations:z.record(id,z.object({nodes:z.record(id,node),members:z.record(id,member),
    equilibrium,newton_steps:z.array(step).length(10),strain_energy_j:positive,final_external_dead_load_potential_j:scalar,
    physical_equilibrium_verified:z.literal(true)}).strict()),
}).strict();
export const corotationalDiagnosticSchema=z.object({schema_version:z.literal("jpn.second-order-frame-diagnostic/2"),
  status:z.literal("diagnostic-only"),units:z.literal("SI"),input_sha256:hash,binding:secondOrderRequestSchema.shape.binding,
  project:mixedRequestSchema.shape.project,solver:z.object({name:z.literal("JPN-Corotational-XZ"),version:z.literal("1.0"),
    method:z.literal("energy-gradient-consistent-Newton"),adapter:z.literal("jpn.second-order-frame/2"),
    formulation:z.literal("finite chord rotation; small elastic basic strains; no within-element P-small-delta")}).strict(),
  coarse:mesh,candidate:mesh,linear_baseline:mixedResultSchema,
  comparison:z.record(id,z.object({translation_m:positive,rotation_rad:positive,member_end_actions:positive}).strict()),
  blockers:z.array(z.string()).min(2).max(20),physical_convergence_verified:z.boolean(),production_enabled:z.literal(false),
  normative_stability_verified:z.literal(false),computed_structural_approval:z.literal(false),fabrication_release:z.literal(false),
  release_gate:z.literal("NOT_READY_BLOCKED"),
}).strict();
export type CorotationalDiagnostic=z.infer<typeof corotationalDiagnosticSchema>;
const same=(a:unknown,b:unknown)=>canonicalSpatialInput(a)===canonicalSpatialInput(b);
function fail(message:string):never{throw Error("COROTATIONAL_DIAGNOSTIC_INVALID: "+message);}
function close(a:number,b:number,atol=1e-8){if(Math.abs(a-b)>atol+1e-8*Math.max(Math.abs(a),Math.abs(b)))fail("estado mecânico/energia/residual divergente");}
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const keys=["fx_n","fy_n","fz_n","mx_nm","my_nm","mz_nm"] as const;

function verifyMesh(request:CorotationalRequest,value:z.infer<typeof mesh>,subdivisions:number){
  verifySecondOrderMeshGeometry(request.model,value,subdivisions);
  const model=value.analysis_model,points=new Map(model.nodes.map(n=>[n.id,n]));
  if(!same(Object.keys(value.combinations).sort(),model.combinations.map(c=>c.id).sort()))fail("combinações incompletas");
  for(const [cid,answer]of Object.entries(value.combinations)){
    if(!same(Object.keys(answer.nodes).sort(),model.nodes.map(n=>n.id).sort())||
       !same(Object.keys(answer.members).sort(),model.members.map(m=>m.id).sort()))fail("IDs de resultados incompletos");
    const loads=new Map(model.nodes.map(n=>[n.id,[0,0,0,0,0,0]])),internal=new Map(model.nodes.map(n=>[n.id,[0,0,0,0,0,0]]));
    const factors=model.combinations.find(c=>c.id===cid)!.factors;
    for(const l of model.nodal_loads)for(let i=0;i<6;i++)loads.get(l.node)![i]+=(factors[l.case]??0)*l[keys[i]];
    let energy=0,potential=0;
    for(const m of model.members){
      if(m.kind!=="frame")fail("barra axial recusada");
      const a=points.get(m.start)!,b=points.get(m.end)!,u=answer.nodes[m.start],v=answer.nodes[m.end],r=answer.members[m.id];
      const x=b.x_m-a.x_m,z=b.z_m-a.z_m,dx=v.translation_m[0]-u.translation_m[0],dz=v.translation_m[2]-u.translation_m[2];
      const length0=Math.hypot(x,z),xx=x+dx,zz=z+dz,length=Math.hypot(xx,zz);
      if(length<=1e-5)fail("comprimento inválido");
      const alpha=Math.atan2(x*zz-z*xx,x*xx+z*zz);
      const basic=[(2*(x*dx+z*dz)+dx*dx+dz*dz)/(length+length0),-u.rotation_rad[1]-alpha,-v.rotation_rad[1]-alpha];
      if(Math.abs(basic[0])/length0>.01||Math.max(...basic.slice(1).map(Math.abs))>.05)fail("deformação fora do domínio");
      const sec=model.sections.find(s=>s.id===m.section)!,mat=model.materials.find(t=>t.id===m.material)!;
      const stress=[mat.e_pa*sec.area_m2/length0*basic[0],mat.e_pa*sec.iy_m4/length0*(4*basic[1]+2*basic[2]),
        mat.e_pa*sec.iy_m4/length0*(2*basic[1]+4*basic[2])];
      basic.forEach((d,i)=>close(d,r.basic_deformation[i],1e-10));stress.forEach((s,i)=>close(s,r.basic_force[i],1e-5));
      close(r.axial_n,stress[0],1e-5);close(r.geometric_axial_n,stress[0],1e-5);
      const cx=xx/length,cz=zz/length,sum=stress[1]+stress[2];
      const fx=-stress[0]*cx-sum*cz/length,fz=-stress[0]*cz+sum*cx/length;
      const expected=[fx,0,fz,0,-stress[1],0,-fx,0,-fz,0,-stress[2],0];
      expected.forEach((f,i)=>close(f,r.end_actions_global[i],1e-5));
      const basis=[[cx,0,cz],[0,1,0],[-cz,0,cx]];
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)close(basis[i][j],r.current_basis[i][j],1e-12);
      for(let i=0;i<12;i+=3)for(let j=0;j<3;j++)close(basis[j].reduce((sum,v,k)=>sum+v*r.end_actions_global[i+k],0),r.end_actions_local[i+j],1e-5);
      for(let i=0;i<6;i++){internal.get(m.start)![i]+=r.end_actions_global[i];internal.get(m.end)![i]+=r.end_actions_global[i+6];}
      const e=.5*basic.reduce((sum,v,i)=>sum+v*stress[i],0);close(e,r.strain_energy_j);energy+=e;
    }
    close(energy,answer.strain_energy_j);
    const netF=[0,0,0],netM=[0,0,0],fs=[1,1,1],ms=[1,1,1],origin=model.nodes[0];
    const span=Math.max(1e-5,...(["x_m","y_m","z_m"] as const).map(k=>Math.max(...model.nodes.map(n=>n[k]))-Math.min(...model.nodes.map(n=>n[k]))));
    for(const p of model.nodes){
      const n=answer.nodes[p.id],load=loads.get(p.id)!,reaction=[...n.reaction_force_n,...n.reaction_moment_nm],motion=[...n.translation_m,...n.rotation_rad];
      const fixed=model.supports.find(s=>s.node===p.id)?.restrained??[false,false,false,false,false,false];
      if(fixed.some((v,i)=>v?Math.abs(motion[i])>1e-12:Math.abs(reaction[i])>1e-8))fail("apoio alterado");
      if(n.translation_m[1]!==0||n.rotation_rad[0]!==0||n.rotation_rad[2]!==0||
         Math.max(...n.translation_m.map(Math.abs))/span>.01||Math.max(...n.rotation_rad.map(Math.abs))>.05)fail("movimento fora do domínio");
      for(let i=0;i<6;i++){close(internal.get(p.id)![i],load[i]+reaction[i],1e-5);potential+=load[i]*motion[i];}
      const force=load.slice(0,3).map((v,i)=>v+reaction[i]),couple=load.slice(3).map((v,i)=>v+reaction[i+3]);
      const r=[p.x_m-origin.x_m+n.translation_m[0],p.y_m-origin.y_m+n.translation_m[1],p.z_m-origin.z_m+n.translation_m[2]];
      const moment=cross(r,force),applied=cross(r,load);
      for(let i=0;i<3;i++){netF[i]+=force[i];netM[i]+=moment[i]+couple[i];fs[i]+=Math.abs(load[i]);ms[i]+=Math.abs(applied[i])+Math.abs(load[i+3]);}
    }
    close(potential,answer.final_external_dead_load_potential_j);
    const rf=netF.map((v,i)=>Math.abs(v)/fs[i]),rm=netM.map((v,i)=>Math.abs(v)/ms[i]),e=answer.equilibrium;
    for(const [a,b]of [[netF,e.force_residual_n],[netM,e.deformed_geometry_moment_residual_nm],[rf,e.force_relative_residual],[rm,e.moment_relative_residual]])
      a.forEach((v,i)=>close(v,b[i],1e-8));
    if(Math.max(...rf,...rm)>1e-8)fail("equilíbrio deformado não atendido");
    answer.newton_steps.forEach((s,i)=>{
      const free=3*model.nodes.length-model.supports.reduce((sum,s)=>sum+[0,2,4].filter(i=>s.restrained[i]).length,0);
      const allowance=100*free*Number.EPSILON*Math.max(1,Math.abs(s.maximum_tangent_ratio));
      if(s.step!==i+1||s.newton_residual_evaluations!==s.iterations+1||s.linear_system_solves!==2*s.iterations||s.line_search_force_evaluations<s.iterations||s.minimum_tangent_ratio<.6-allowance)fail("iterações/margem inconsistentes");
    });
  }
}

export async function verifyCorotationalDiagnostic(request:CorotationalRequest,result:CorotationalDiagnostic){
  if(await mixedInputHash(request.model)!==request.binding.model_sha256||await mixedInputHash(request)!==result.input_sha256||
     !same(request.binding,result.binding)||!same(request.model.project,result.project))fail("hash/revisão divergente");
  verifyMesh(request,result.coarse,request.numerics.coarse_subdivisions);verifyMesh(request,result.candidate,request.numerics.fine_subdivisions);
  verifyMixedResult(result.candidate.analysis_model,result.linear_baseline,await mixedInputHash(result.candidate.analysis_model));
  if(!result.blockers.includes("COROTATIONAL_PRODUCTION_DOMAIN_NOT_VERIFIED")||!result.blockers.includes("COROTATIONAL_3D_STABILITY_PENDING"))fail("bloqueios obrigatórios ausentes");
  if(!same(Object.keys(result.comparison).sort(),request.model.combinations.map(c=>c.id).sort()))fail("comparação incompleta");
  let verified=true;
  for(const c of request.model.combinations){
    const answer=result.candidate.combinations[c.id],before=result.coarse.combinations[c.id];
    const errors:number[]=[];
    for(const field of ["translation_m","rotation_rad"] as const){
      const a=request.model.nodes.flatMap(n=>before.nodes[n.id][field]),b=request.model.nodes.flatMap(n=>answer.nodes[n.id][field]);
      const error=Math.max(...b.map((v,i)=>Math.abs(v-a[i])))/Math.max(1e-12,...b.map(Math.abs));
      close(error,result.comparison[c.id][field],1e-10);errors.push(error);
    }
    const ends=(m:z.infer<typeof mesh>,parent:string)=>{
      const children=m.numerical_member_mapping.filter(c=>c.parent_member===parent).sort((a,b)=>a.start_fraction-b.start_fraction),r=m.combinations[c.id].members;
      return [...r[children[0].id].end_actions_global.slice(0,6),...r[children.at(-1)!.id].end_actions_global.slice(6)];
    };
    const endError=Math.max(...request.model.members.flatMap(p=>{
      const a=ends(result.coarse,p.id),b=ends(result.candidate,p.id);return b.map((v,i)=>Math.abs(v-a[i])/Math.max(1,Math.abs(v)));}));
    close(endError,result.comparison[c.id].member_end_actions,1e-10);errors.push(endError);
    if(Math.max(...errors)>1e-4){verified=false;if(!result.blockers.includes("COROTATIONAL_REFINEMENT_NOT_CONVERGED:"+c.id))fail("refinamento sem bloqueio");}
  }
  if(result.physical_convergence_verified!==verified)fail("convergência declarada sem demonstração");
}

export async function prepareCorotationalFrameAnalysis(project:Project,numerics:unknown){
  const n=corotationalNumericsSchema.parse(numerics);
  const prepared=await prepareSecondOrderFrameAnalysis(project,{coarse_subdivisions:n.coarse_subdivisions,fine_subdivisions:n.fine_subdivisions,
    max_tc_iterations:1,equilibrium_relative_tolerance:1e-8,refinement_relative_tolerance:1e-4});
  const request=corotationalRequestSchema.parse({...prepared.request,schema_version:"jpn.second-order-frame/2",
    analysis_type:"experimental-corotational-xz-diagnostic",numerics:n});
  return {request,input_sha256:await mixedInputHash(request),physicalPreparation:prepared.physicalPreparation};
}
export type PreparedCorotationalFrame=Awaited<ReturnType<typeof prepareCorotationalFrameAnalysis>>;
export async function buildCorotationalFrameReport(project:Project,prepared:PreparedCorotationalFrame,value:unknown){
  const current=await prepareCorotationalFrameAnalysis(project,prepared.request.numerics);
  if(current.input_sha256!==prepared.input_sha256||!same(current.request,prepared.request))throw Error("STALE_COROTATIONAL_ANALYSIS: projeto alterado");
  const diagnostic=corotationalDiagnosticSchema.parse(value);await verifyCorotationalDiagnostic(current.request,diagnostic);
  const report={schema_version:"jpn.second-order-frame-report/2" as const,request:current.request,diagnostic,status:"NOT_READY_BLOCKED" as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,purpose:"Ensaio corrotacional XZ; estabilidade 3D e uso produtivo bloqueados."};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export async function assertCorotationalReportCurrent(report:Awaited<ReturnType<typeof buildCorotationalFrameReport>>,project:Project,prepared:PreparedCorotationalFrame,value:unknown){
  const {reportSha256,...body}=report;
  if(await mixedInputHash(body)!==reportSha256||(await buildCorotationalFrameReport(project,prepared,value)).reportSha256!==reportSha256)
    throw Error("STALE_COROTATIONAL_REPORT: conteúdo/projeto alterado");
}
