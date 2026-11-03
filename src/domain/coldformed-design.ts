import { z } from "zod";
import { sectionAnalysisRequestSchema } from "./section-analysis";
import { mixedInputHash } from "./mixed-analysis";
import type { Project } from "./models";
import type { ResistanceReport } from "./resistance-report";
const n=z.number().finite(),positive=n.positive().max(1e20),text=z.string().trim().min(1).max(1000),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const criticalModesSchema=z.object({global:positive,local:positive,distortional:positive}).strict().nullable();
export const criticalKeys=["compression","my_positive","my_negative","mz_positive","mz_negative"] as const;
export const memberDesignDeclarationSchema=z.object({schema_version:z.literal("jpn.member-design-declaration/1"),pieceId:text,combinationId:text,
  study:z.object({source:text,revision:text,responsible:text,basis_sha256:sha,boundary_and_load_pattern:text,minimum_search:z.enum(["reviewed-elastic-mode-minima","not-required-pure-tension","computed-cfsm-ss"])}).strict(),
  critical:z.object({compression:criticalModesSchema,my_positive:criticalModesSchema,my_negative:criticalModesSchema,mz_positive:criticalModesSchema,mz_negative:criticalModesSchema}).strict(),
  tension:z.discriminatedUnion("basis",[z.object({basis:z.literal("declared-net-areas"),net_outside_m2:positive,net_connection_m2:positive,ct:positive.max(1),source:text,revision:text}).strict(),z.object({basis:z.literal("full-section-all-elements-welded"),source:text,revision:text}).strict()]).nullable(),
  unstiffenedSingleWeb:z.boolean(),
}).strict();
export type MemberDesignDeclaration=z.infer<typeof memberDesignDeclarationSchema>;
const forces=z.object({nN:z.array(n).min(1).max(3),vyN:z.array(n).min(1).max(3).nullable(),vzN:z.array(n).min(1).max(3).nullable(),tNm:z.array(n).min(1).max(3).nullable(),myNm:z.array(n).min(1).max(3).nullable(),mzNm:z.array(n).min(1).max(3).nullable()}).strict();
const binding=z.object({mechanical_sha256:sha,analysis_input_sha256:sha,analysis_result_sha256:sha}).strict();
const connectionContextSchema=z.object({piece_id:text,joints:z.array(z.object({id:text,node_id:text,source:text,revision:text,fixing:z.enum(["pending","bolted","welded","combined"]),has_bolts:z.boolean(),holes:z.array(z.object({id:text,component_id:text,diameter_mm:n.nonnegative().max(1e6).nullable(),y_mm:n.min(-1e6).max(1e6).nullable(),z_mm:n.min(-1e6).max(1e6).nullable()}).strict()).max(500),welds:z.array(z.object({id:text,type:text.nullable(),size_mm:positive.nullable(),length_mm:positive.nullable()}).strict()).max(100)}).strict()).max(30)}).strict();
export const coldformedDesignRequestSchema=z.object({schema_version:z.literal("jpn.coldformed-design/1"),units:z.literal("SI"),piece_id:text,combination_id:text,binding,
  section:z.object({family:z.literal("cold-formed"),shape:z.literal("u-stiffened"),area_m2:positive,fy_pa:positive,fu_pa:positive,e_pa:positive,iy_m4:positive,iz_m4:positive,wy_m3:positive,wz_m3:positive,effective_length_y_m:positive,effective_length_z_m:positive,source:text,revision:text}).strict(),
  study:memberDesignDeclarationSchema.shape.study,critical:memberDesignDeclarationSchema.shape.critical,tension:memberDesignDeclarationSchema.shape.tension,
  web:z.object({flat_height_m:positive,thickness_m:positive,unstiffened_single_web:z.boolean()}).strict(),
  fields:z.array(z.object({segment_id:text,offset_m:n.nonnegative(),length_m:positive,forces}).strict()).min(1).max(320),
}).strict();
const point=z.object({segment_id:text,position_m:n,segment_position_m:n,combination_id:text,forces:z.object({nN:n,vyN:n.nullable(),vzN:n.nullable(),tNm:n.nullable(),myNm:n.nullable(),mzNm:n.nullable()}).strict()}).strict();
const check=z.discriminatedUnion("status",[
  z.object({id:text,status:z.literal("BLOCKED"),reason:text,utilization:z.null(),governing:z.null()}).strict(),
  ...(["PASS","FAIL","CONDITIONAL"] as const).map(status=>z.object({id:text,status:z.literal(status),demand:n.nonnegative(),resistance:positive,utilization:n.nonnegative(),governing:point.nullable(),clauses:z.array(text),conditional_dependencies:z.array(text)}).strict()),
]);
const capacity=z.object({design:positive,characteristic:positive.optional(),gamma:positive.optional(),modes:z.record(z.string(),positive).optional(),slenderness:z.union([n,z.record(z.string(),n)]).optional(),governing_mode:text.optional(),clauses:z.array(text),branch:text.optional(),kv:n.optional()}).strict();
const stabilityModelSchema=z.object({boundary:z.literal("fork-fork-free-warping"),load_pattern:z.literal("uniform-compression"),intermediate_restraints:z.literal("none"),length_m:positive,half_waves_max:z.literal(64),target:z.literal(.001)}).strict();
const modalFamily=z.object({critical_stress_mpa:positive,half_wave_number:n.int().min(1).max(64),half_wavelength_mm:positive,modal_dimension:n.int().positive(),curve_mpa:z.array(positive).length(64)}).strict();
const bucklingAuditSchema=z.object({schema_version:z.literal("jpn.computed-member-buckling/1"),method:z.literal("NBR14762-global-and-constrained-FSM"),library:z.object({pycufsm:z.literal("0.2.0"),numpy:z.literal("2.3.3"),scipy:z.literal("1.15.3"),license:z.literal("AFL-3.0")}).strict(),model:stabilityModelSchema,model_sha256:sha,
  global_result:z.object({global_n:positive,flexure_y_n:positive,flexure_z_n:positive,torsion_n:positive,flexural_torsional_n:positive,r0_squared_m2:positive,clauses:z.array(text),axes:text}).strict(),compression_critical_n:z.object({global:positive,local:positive,distortional:positive}).strict(),refinements:z.array(z.object({nodes:n.int().positive().max(96),arc_segments:n.int().positive(),flat_segments:n.int().positive(),midline_area_mm2:positive,families:z.object({local:modalFamily,distortional:modalFamily}).strict()}).strict()).length(3),relative_changes:z.object({local:n.nonnegative(),distortional:n.nonnegative()}).strict(),half_wave_numbers:z.array(n.int().positive()).length(64),elapsed_seconds:n.nonnegative(),search_coverage:z.literal("all-integer-half-waves-1-through-64"),error_bound_certified:z.literal(false),full_member_approval:z.literal(false)}).strict();
export const coldformedDesignResultSchema=z.object({schema_version:z.literal("jpn.coldformed-design-result/2"),units:z.literal("SI"),input_sha256:sha,binding,piece_id:text,combination_id:text,
  standard:z.literal("ABNT NBR 14762:2010"),evaluator_version:z.literal("jpn.nbr14762-mrd/2"),capacities:z.record(z.string(),capacity),checks:z.array(check),status:z.enum(["FAIL","BLOCKED","CONDITIONAL-EXTERNAL-INPUTS","CONDITIONAL-MODEL-LIMITS","PASS-IMPLEMENTED-CHECKS"]),
  calculation_input_sha256:sha.optional(),geometry_audit:z.object({library:z.object({name:z.literal("sectionproperties"),version:z.literal("3.10.2"),license:z.literal("MIT")}).strict(),geometry_input_sha256:sha,differences:z.record(z.string(),z.object({declared:n,computed:n,resolution:n,absolute_difference:n}).strict()),refinement:z.object({status:z.literal("observed"),relativeChanges:z.record(z.string(),n),target:n,boundaryArcPoints:z.literal(64),errorBoundCertified:z.literal(false)}).strict(),computed_properties:z.record(z.string(),n),note:text}).strict().optional(),
  connection_audit:z.object({status:z.literal("conditional-unverified"),input_sha256:sha.nullable(),connection_ids:z.array(text),hole_count:n.int().nonnegative(),warning:text}).strict().optional(),
  buckling_audit:bucklingAuditSchema.optional(),
  member_all_limit_states_verified:z.literal(false),computed_structural_approval:z.literal(false),approved_for_fabrication:z.literal(false),remaining:z.array(text),
}).strict();

export const verifiedColdformedRequestSchema=z.object({schema_version:z.literal("jpn.verified-coldformed/1"),geometry_analysis:sectionAnalysisRequestSchema,solver_j_m4:positive,property_resolutions:z.object({area_m2:n.nonnegative(),iy_m4:n.nonnegative(),iz_m4:n.nonnegative(),wy_m3:n.nonnegative(),wz_m3:n.nonnegative(),j_m4:n.nonnegative()}).strict(),design:coldformedDesignRequestSchema,connection_context:connectionContextSchema.optional(),stability_model:stabilityModelSchema.optional()}).strict();

export function requireCommonMemberAxes(matrices:number[][][]){
  if(!matrices.length)throw Error("Esforços contínuos ausentes.");
  for(const r of matrices){
    if(r.length!==3||r.some(row=>row.length!==3||row.some(v=>!Number.isFinite(v))))throw Error("Referencial local inválido.");
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i].reduce((s,v,k)=>s+v*r[j][k],0)-(i===j?1:0))>1e-10)throw Error("Referencial local não ortonormal.");
    const cross=[r[0][1]*r[1][2]-r[0][2]*r[1][1],r[0][2]*r[1][0]-r[0][0]*r[1][2],r[0][0]*r[1][1]-r[0][1]*r[1][0]];
    if(cross.some((v,i)=>Math.abs(v-r[2][i])>1e-10))throw Error("Referencial local refletido.");
    if(r.some((row,j)=>row.some((v,i)=>Math.abs(v-matrices[0][j][i])>1e-10)))throw Error("Os três eixos locais dos segmentos precisam coincidir; roll distinto exige modelo resistente próprio, sem reunir My/Mz em eixos incorretos.");
  }
}

/** Exclude only the derived project preparation hash (which includes this
 * declaration), preventing a self-referential hash. ALL mechanical data,
 * actions, combinations, source revisions and connection declarations remain. */
export async function memberDesignBasis(project:Project,report:ResistanceReport,pieceId:string){
  const declaration=project.workspace.spatialPreparation?.resistance?.find(d=>d.pieceId===pieceId);
  const {project:meta,...mechanical}=report.physicalInput;
  return mixedInputHash({projectId:meta.id,mechanical,pieceId,declaration,connections:project.workspace.spatialPreparation?.connections??null});
}
export async function prepareColdformedDesign(project:Project,report:ResistanceReport,declaration:MemberDesignDeclaration){
  const draft=project.workspace.spatialPreparation!,d=draft.resistance?.find(d=>d.pieceId===declaration.pieceId),piece=report.pieces.find(p=>p.pieceId===declaration.pieceId),group=piece?.physicalProperties;
  if(!d||!group||d.family!=="cold-formed"||d.geometry?.shape!=="u-stiffened")throw Error("Domínio: U enrijecido físico, com material e geometria declarados.");
  if(piece.dataIssues.length)throw Error("Corrija os dados físicos antes de verificar: "+piece.dataIssues.join(" "));
  if(!draft.engineeringCombinations?.combinations.some(c=>c.id===declaration.combinationId&&c.purpose==="ULS"))throw Error("Selecione uma combinação explicitamente declarada ULS.");
  const basis=await memberDesignBasis(project,report,declaration.pieceId);
  if(declaration.study.basis_sha256!==basis)throw Error("Estudo crítico obsoleto: revise geometria, material, contenções e padrão de carregamento e registre novamente.");
  const continuous=report.continuousDemands?.pieces.find(p=>p.pieceId===declaration.pieceId);
  if(!continuous)throw Error("Recupere primeiro os esforços contínuos com Calcular ações de ligações.");
  const selected=continuous.fields.filter(f=>f.combinationId===declaration.combinationId),g=d.geometry.dimensionsMm;
  requireCommonMemberAxes(selected.map(f=>f.globalToLocal));
  if(declaration.tension?.basis==="full-section-all-elements-welded"){
    const joints=draft.connections?.connections.filter(c=>c.participants.some(p=>p.pieceId===declaration.pieceId))??[];
    if(joints.some(c=>c.transferGeometry?.fixing==="bolted"||c.transferGeometry?.fixing==="combined"||c.components.some(x=>x.kind==="bolts")||c.transferGeometry?.holes.some(h=>h.pieceId===declaration.pieceId)))throw Error("CONNECTION_GEOMETRY_CONTRADICTION: hipótese de seção plena soldada contradiz furação/parafusos cadastrados. Revise a ligação física; não se presume área líquida igual à bruta.");
  }
  const design=coldformedDesignRequestSchema.parse({schema_version:"jpn.coldformed-design/1",units:"SI",piece_id:declaration.pieceId,combination_id:declaration.combinationId,
    binding:{mechanical_sha256:basis,analysis_input_sha256:report.binding.inputSha256,analysis_result_sha256:report.binding.resultSha256},
    section:{family:d.family,shape:d.geometry.shape,area_m2:group.areaCm2!*1e-4,fy_pa:d.fyMpa!*1e6,fu_pa:d.fuMpa!*1e6,e_pa:group.eGpa!*1e9,iy_m4:group.iyCm4!*1e-8,iz_m4:group.izCm4!*1e-8,wy_m3:d.sectionProperties.wyCm3!*1e-6,wz_m3:d.sectionProperties.wzCm3!*1e-6,effective_length_y_m:d.bucklingYM,effective_length_z_m:d.bucklingZM,source:d.source,revision:d.revision},
    study:declaration.study,critical:declaration.critical,tension:declaration.tension,
    web:{flat_height_m:(g.height!-2*(g.insideRadius!+g.wallThickness!))/1000,thickness_m:g.wallThickness!/1000,unstiffened_single_web:declaration.unstiffenedSingleWeb},
    fields:selected.map(f=>({segment_id:f.segmentId,offset_m:f.rows[0].originalPositionM,length_m:f.lengthM,forces:f.forcePolynomials})),
  });
  const resolutions=d.sectionPropertyResolutions??{},quantities={area_m2:["areaCm2",1e-4],iy_m4:["iyCm4",1e-8],iz_m4:["izCm4",1e-8],wy_m3:["wyCm3",1e-6],wz_m3:["wzCm3",1e-6],j_m4:["jCm4",1e-8]} as const;
  return verifiedColdformedRequestSchema.parse({schema_version:"jpn.verified-coldformed/1",design,solver_j_m4:group.jCm4!*1e-8,
    ...(declaration.study.minimum_search==="computed-cfsm-ss"?{stability_model:{boundary:"fork-fork-free-warping",load_pattern:"uniform-compression",intermediate_restraints:"none",length_m:report.demands.pieces.find(p=>p.pieceId===declaration.pieceId)!.lengthM,half_waves_max:64,target:.001}}:{}),
    connection_context:{piece_id:declaration.pieceId,joints:(draft.connections?.connections.filter(c=>c.participants.some(p=>p.pieceId===declaration.pieceId))??[]).map(c=>({id:c.id,node_id:c.nodeId,source:c.source,revision:c.revision,fixing:c.transferGeometry?.fixing??"pending",has_bolts:c.components.some(x=>x.kind==="bolts"),holes:(c.transferGeometry?.holes.filter(h=>h.pieceId===declaration.pieceId)??[]).map(h=>({id:h.id,component_id:h.componentId,diameter_mm:h.diameterMm,y_mm:h.yMm,z_mm:h.zMm})),welds:c.components.filter(x=>x.kind==="weld").map(w=>({id:w.id,type:w.type?.trim()||null,size_mm:w.sizeMm,length_mm:w.lengthMm}))}))},
    property_resolutions:Object.fromEntries(Object.entries(quantities).map(([key,[original,scale]])=>[key,(resolutions[original]??0)*scale])),
    geometry_analysis:{schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:"u-stiffened",height:g.height,width:g.width,lip:g.lip,wallThickness:g.wallThickness,insideRadius:g.insideRadius},poisson:group.nu,source:d.geometry.source,revision:d.geometry.revision,responsible:declaration.study.responsible,convergence:.001},
  });
}
