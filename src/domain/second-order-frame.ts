import {z} from "zod";
import type {Project} from "./models";
import {adaptMixedProject} from "./mixed-adapter";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {mixedInputHash,mixedRequestSchema,mixedResultSchema,verifyMixedResult} from "./mixed-analysis";
import {anyMixedRequestSchema} from "./structural-loading";
import {canonicalSpatialInput} from "./spatial-analysis";

const finite=z.number(),vector=z.tuple([finite,finite,finite]);
const id=z.string().min(1).max(100),hash=z.string().regex(/^[a-f0-9]{64}$/);
const binding=z.object({model_sha256:hash,preparation_sha256:hash,mapping_sha256:hash}).strict();
export const secondOrderNumericsSchema=z.object({
  coarse_subdivisions:z.number().int().min(1).max(32),fine_subdivisions:z.number().int().min(2).max(64),
  max_tc_iterations:z.number().int().min(1).max(30),
  equilibrium_relative_tolerance:z.literal(1e-8),refinement_relative_tolerance:z.literal(1e-4),
}).strict().refine(n=>n.fine_subdivisions===2*n.coarse_subdivisions,"PDELTA_NUMERICS: refinamento 2:1 obrigatório");
export const secondOrderRequestSchema=z.object({
  schema_version:z.literal("jpn.second-order-frame/1"),units:z.literal("SI"),
  analysis_type:z.literal("experimental-pdelta-diagnostic"),binding,model:anyMixedRequestSchema,
  numerics:secondOrderNumericsSchema,
}).strict().superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(v.model.members.some(m=>m.kind!=="frame"))issue("PDELTA_AXIAL_KG_UNSUPPORTED: Spring3D recusado");
  const connected=new Set(v.model.members.flatMap(m=>[m.start,m.end]));
  if(v.model.nodes.some(n=>!connected.has(n.id)))issue("PDELTA_ORPHAN_NODE: nó sem barra física");
  if(v.model.members.some(m=>m.kind==="frame"&&[...m.release_start,...m.release_end].some(Boolean)))
    issue("PDELTA_RELEASE_PENDING: liberações não validadas no piloto");
  if(v.model.schema_version==="jpn.mixed3d/2"&&(v.model.member_loads.length||v.model.self_weight))
    issue("PDELTA_DISTRIBUTED_LOAD_PENDING: manter carregamentos reais; não converter para burlar o domínio");
});
export type SecondOrderRequest=z.infer<typeof secondOrderRequestSchema>;
const candidateNode=z.object({translation_m:vector,rotation_rad:vector,reaction_force_n:vector,reaction_moment_nm:vector}).strict();
const candidateMember=z.object({end_actions_local:z.array(finite).length(12),end_actions_global:z.array(finite).length(12),recovered_axial_strain_force_n:finite}).strict();
const candidateCombination=z.object({
  nodes:z.record(id,candidateNode),members:z.record(id,candidateMember),
  equilibrium:z.object({force_residual_n:vector,initial_geometry_moment_residual_nm:vector,
    deformed_geometry_moment_residual_nm:vector,force_relative_residual:vector,moment_relative_residual:vector,
    reference:z.literal("global dead loads at displaced nodes; no omitted H*uz term"),accepted:z.boolean()}).strict(),
  native_trace:z.object({elastic_assemblies:z.number().int().positive(),geometric_assemblies:z.number().int().positive(),
    tc_iterations:z.number().int().positive(),nonlinear_equilibrium_iterations:z.null(),native_method:z.string(),
    minimum_tangent_ratio:finite,maximum_tangent_ratio:finite.positive(),algebraic_relative_residual:finite.nonnegative().max(1e-8),
    scaled_tangent_condition:finite.min(1).max(1e10),assembly_axial_n:z.record(id,finite)}).strict(),
}).strict();
const mesh=z.object({analysis_model:mixedRequestSchema,subdivisions:z.number().int().min(1).max(64),
  node_count:z.number().int().min(2).max(150),member_count:z.number().int().min(1).max(320),
  elastic_scaled_condition:finite.min(1).max(1e10),
  numerical_member_mapping:z.array(z.object({id,parent_member:id,start_fraction:finite.min(0).max(1),end_fraction:finite.min(0).max(1)}).strict()).max(320),
  combinations:z.record(id,candidateCombination),
}).strict();
export const secondOrderDiagnosticSchema=z.object({
  schema_version:z.literal("jpn.second-order-frame-diagnostic/1"),status:z.literal("diagnostic-rejected"),
  units:z.literal("SI"),input_sha256:hash,binding,project:mixedRequestSchema.shape.project,
  solver:z.object({name:z.literal("PyNiteFEA"),version:z.literal("3.2.1"),method:z.literal("analyze_PDelta"),adapter:z.literal("jpn.second-order-frame/1")}).strict(),
  coarse:mesh,candidate:mesh,linear_baseline:mixedResultSchema,
  comparison:z.record(id,z.object({maximum_linear_translation_m:finite.nonnegative(),maximum_candidate_translation_m:finite.nonnegative(),
    maximum_translation_change_m:finite.nonnegative(),refinement_relative_displacement_error:finite.nonnegative(),
    refinement_relative_rotation_error:finite.nonnegative(),refinement_relative_member_end_action_error:finite.nonnegative()}).strict()),
  blockers:z.array(z.string()).max(20),physical_convergence_verified:z.literal(false),production_enabled:z.literal(false),
  normative_stability_verified:z.literal(false),computed_structural_approval:z.literal(false),fabrication_release:z.literal(false),
  release_gate:z.literal("NOT_READY_BLOCKED"),limitations:z.array(z.string()).min(1).max(20),
}).strict();
export type SecondOrderDiagnostic=z.infer<typeof secondOrderDiagnosticSchema>;
const same=(a:unknown,b:unknown)=>canonicalSpatialInput(a)===canonicalSpatialInput(b);
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
function fail(message:string):never{throw Error("PDELTA_DIAGNOSTIC_INVALID: "+message);}
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function verifySecondOrderMeshGeometry(source:SecondOrderRequest["model"],value:Pick<z.infer<typeof mesh>,"analysis_model"|"subdivisions"|"node_count"|"member_count"|"numerical_member_mapping">,subdivisions:number){
  const analysis=value.analysis_model;
  if(value.subdivisions!==subdivisions||value.node_count!==analysis.nodes.length||value.member_count!==analysis.members.length||
     analysis.members.length!==source.members.length*subdivisions||value.numerical_member_mapping.length!==analysis.members.length)
    fail("malha numérica incompleta");
  for(const key of ["units","theory","project","materials","sections","supports","cases","nodal_loads","combinations"] as const)
    if(!same(source[key],analysis[key]))fail("a malha alterou declarações físicas: "+key);
  if(analysis.nodes.length!==source.nodes.length+source.members.length*(subdivisions-1))fail("nós numéricos inesperados");
  const points=new Map(analysis.nodes.map(n=>[n.id,n])),members=new Map(analysis.members.map(m=>[m.id,m]));
  for(const n of source.nodes)if(!same(points.get(n.id),n))fail("coordenada física alterada");
  const mapped=new Set<string>();
  for(const parent of source.members){
    const children=value.numerical_member_mapping.filter(m=>m.parent_member===parent.id).sort((a,b)=>a.start_fraction-b.start_fraction);
    if(children.length!==subdivisions)fail("peça sem todos os segmentos numéricos");
    const start=points.get(parent.start)!,end=points.get(parent.end)!;
    for(const [i,child]of children.entries()){
      const m=members.get(child.id);
      if(!m||mapped.has(child.id)||m.kind!=="frame"||parent.kind!=="frame"||
        child.start_fraction!==i/subdivisions||child.end_fraction!==(i+1)/subdivisions||
        m.material!==parent.material||m.section!==parent.section||m.rotation_deg!==parent.rotation_deg||
        !same(m.release_start,parent.release_start)||!same(m.release_end,parent.release_end))fail("rastreio de barra adulterado");
      mapped.add(child.id);
      for(const [nodeId,t]of [[m.start,child.start_fraction],[m.end,child.end_fraction]] as const){
        const node=points.get(nodeId);if(!node)fail("extremo numérico ausente");
        for(const axis of ["x_m","y_m","z_m"] as const)if(!near(node[axis],start[axis]+(end[axis]-start[axis])*t))fail("extremo fora da peça física");
      }
      if(i===0&&m.start!==parent.start||i===subdivisions-1&&m.end!==parent.end)fail("extremo físico remapeado");
      if(i>0&&members.get(children[i-1].id)!.end!==m.start)fail("malha numérica descontínua");
    }
  }
}

function verifyMesh(request:SecondOrderRequest,value:z.infer<typeof mesh>,subdivisions:number){
  const source=request.model,analysis=value.analysis_model;
  verifySecondOrderMeshGeometry(source,value,subdivisions);
  const cases=source.combinations.map(c=>c.id).sort();
  if(!same(Object.keys(value.combinations).sort(),cases))fail("combinações diferentes");
  for(const [caseId,answer]of Object.entries(value.combinations)){
    if(!same(Object.keys(answer.nodes).sort(),analysis.nodes.map(n=>n.id).sort())||
       !same(Object.keys(answer.members).sort(),analysis.members.map(n=>n.id).sort()))fail("IDs de resposta diferentes da malha");
    const forces=new Map(analysis.nodes.map(n=>[n.id,[0,0,0,0,0,0]]));
    const factors=analysis.combinations.find(c=>c.id===caseId)!.factors;
    for(const load of analysis.nodal_loads){const f=forces.get(load.node)!;
      for(const [i,k]of (["fx_n","fy_n","fz_n","mx_nm","my_nm","mz_nm"] as const).entries())f[i]+=(factors[load.case]??0)*load[k];}
    const netF=[0,0,0],netM=[0,0,0],initialM=[0,0,0],fs=[1,1,1],ms=[1,1,1],origin=analysis.nodes[0];
    for(const node of analysis.nodes){
      const n=answer.nodes[node.id],load=forces.get(node.id)!,r=[node.x_m-origin.x_m,node.y_m-origin.y_m,node.z_m-origin.z_m];
      const fixed=analysis.supports.find(s=>s.node===node.id)?.restrained??[false,false,false,false,false,false];
      const motion=[...n.translation_m,...n.rotation_rad],reaction=[...n.reaction_force_n,...n.reaction_moment_nm];
      if(fixed.some((isFixed,i)=>isFixed?Math.abs(motion[i])>1e-12:Math.abs(reaction[i])>1e-8))fail("resposta incompatível com o apoio físico");
      const force=load.slice(0,3).map((f,i)=>f+n.reaction_force_n[i]),couple=load.slice(3).map((m,i)=>m+n.reaction_moment_nm[i]);
      const displaced=r.map((v,i)=>v+n.translation_m[i]),moment=cross(displaced,force),before=cross(r,force),applied=cross(displaced,load);
      for(let i=0;i<3;i++){netF[i]+=force[i];netM[i]+=moment[i]+couple[i];initialM[i]+=before[i]+couple[i];fs[i]+=Math.abs(load[i]);ms[i]+=Math.abs(applied[i])+Math.abs(load[i+3]);}
    }
    const e=answer.equilibrium,rf=netF.map((f,i)=>Math.abs(f)/fs[i]),rm=netM.map((m,i)=>Math.abs(m)/ms[i]);
    for(const [calculated,provided]of [[netF,e.force_residual_n],[netM,e.deformed_geometry_moment_residual_nm],
      [initialM,e.initial_geometry_moment_residual_nm],[rf,e.force_relative_residual],[rm,e.moment_relative_residual]])
      if(calculated.some((v,i)=>!near(v,provided[i])))fail("equilíbrio informado não corresponde às forças/posições");
    if(e.accepted!==(Math.max(...rf,...rm)<=1e-8))fail("aprovação numérica incompatível com o residual");
    const trace=answer.native_trace;
    const free=analysis.nodes.length*6-analysis.supports.reduce((sum,s)=>sum+s.restrained.filter(Boolean).length,0);
    const roundoff=100*free*Number.EPSILON*Math.max(1,Math.abs(trace.maximum_tangent_ratio));
    if(trace.elastic_assemblies!==trace.geometric_assemblies||trace.tc_iterations!==trace.geometric_assemblies||
       trace.tc_iterations>request.numerics.max_tc_iterations||trace.minimum_tangent_ratio<.6-roundoff)
      fail("etapas/margem não conferidas");
  }
}

export async function verifySecondOrderFrameDiagnostic(request:SecondOrderRequest,result:SecondOrderDiagnostic){
  if(await mixedInputHash(request.model)!==request.binding.model_sha256||await mixedInputHash(request)!==result.input_sha256||
     !same(request.binding,result.binding)||!same(request.model.project,result.project))fail("hash/revisão/obra diferentes");
  verifyMesh(request,result.coarse,request.numerics.coarse_subdivisions);
  verifyMesh(request,result.candidate,request.numerics.fine_subdivisions);
  verifyMixedResult(result.candidate.analysis_model,result.linear_baseline,await mixedInputHash(result.candidate.analysis_model));
  const cases=request.model.combinations.map(c=>c.id).sort();
  if(!same(Object.keys(result.comparison).sort(),cases)||
     !result.blockers.includes("PDELTA_PRODUCTION_DOMAIN_NOT_VERIFIED"))fail("estado incompleto");
  for(const cid of cases){
    const c=result.comparison[cid],e=result.candidate.combinations[cid].equilibrium;
    if(!e.accepted&&!result.blockers.includes("PDELTA_DEAD_LOAD_EQUILIBRIUM_NOT_VERIFIED:"+cid))fail("residual sem bloqueio");
    if(Math.max(c.refinement_relative_displacement_error,c.refinement_relative_rotation_error,c.refinement_relative_member_end_action_error)>1e-4&&
       !result.blockers.includes("PDELTA_REFINEMENT_NOT_CONVERGED:"+cid))fail("refinamento sem bloqueio");
  }
}

export async function prepareSecondOrderFrameAnalysis(project:Project,numerics:unknown){
  const prepared=await(project.workspace.spatialPreparation?.loading?adaptLoadedMixedProject(project):adaptMixedProject(project));
  const request=secondOrderRequestSchema.parse({schema_version:"jpn.second-order-frame/1",units:"SI",
    analysis_type:"experimental-pdelta-diagnostic",binding:{model_sha256:prepared.input_sha256,
      preparation_sha256:prepared.preparation_sha256,mapping_sha256:await mixedInputHash(prepared.mapping)},model:prepared.request,numerics});
  return {request,input_sha256:await mixedInputHash(request),physicalPreparation:prepared};
}
export type PreparedSecondOrderFrame=Awaited<ReturnType<typeof prepareSecondOrderFrameAnalysis>>;
export async function buildSecondOrderFrameReport(project:Project,prepared:PreparedSecondOrderFrame,value:unknown){
  const current=await prepareSecondOrderFrameAnalysis(project,prepared.request.numerics);
  if(current.input_sha256!==prepared.input_sha256||!same(current.request,prepared.request))throw Error("STALE_PDELTA_ANALYSIS: projeto alterado");
  const diagnostic=secondOrderDiagnosticSchema.parse(value);
  await verifySecondOrderFrameDiagnostic(current.request,diagnostic);
  const report={schema_version:"jpn.second-order-frame-report/1" as const,request:current.request,diagnostic,
    status:"NOT_READY_BLOCKED" as const,computedStructuralApproval:false as const,fabricationRelease:false as const,
    purpose:"Diagnóstico experimental local; não substitui o relatório resistente nem habilita segunda ordem produtiva."};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export async function assertSecondOrderFrameReportCurrent(report:Awaited<ReturnType<typeof buildSecondOrderFrameReport>>,project:Project,prepared:PreparedSecondOrderFrame,value:unknown){
  const {reportSha256,...body}=report;
  if(await mixedInputHash(body)!==reportSha256)throw Error("STALE_PDELTA_REPORT: conteúdo alterado");
  const next=await buildSecondOrderFrameReport(project,prepared,value);
  if(next.reportSha256!==reportSha256)throw Error("STALE_PDELTA_REPORT: reexecute a partir do projeto atual");
}
