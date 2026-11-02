import { z } from "zod";
import { sectionAnalysisRequestSchema } from "./section-analysis";
import { mixedInputHash } from "./mixed-analysis";
import type { Project } from "./models";
import type { ResistanceReport } from "./resistance-report";
const n=z.number().finite(),positive=n.positive().max(1e20),text=z.string().trim().min(1).max(1000),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const criticalModesSchema=z.object({global:positive,local:positive,distortional:positive}).strict().nullable();
export const criticalKeys=["compression","my_positive","my_negative","mz_positive","mz_negative"] as const;
export const memberDesignDeclarationSchema=z.object({schema_version:z.literal("jpn.member-design-declaration/1"),pieceId:text,combinationId:text,
  study:z.object({source:text,revision:text,responsible:text,basis_sha256:sha,boundary_and_load_pattern:text,minimum_search:z.enum(["reviewed-elastic-mode-minima","not-required-pure-tension"])}).strict(),
  critical:z.object({compression:criticalModesSchema,my_positive:criticalModesSchema,my_negative:criticalModesSchema,mz_positive:criticalModesSchema,mz_negative:criticalModesSchema}).strict(),
  tension:z.discriminatedUnion("basis",[z.object({basis:z.literal("declared-net-areas"),net_outside_m2:positive,net_connection_m2:positive,ct:positive.max(1),source:text,revision:text}).strict(),z.object({basis:z.literal("full-section-all-elements-welded"),source:text,revision:text}).strict()]).nullable(),
  unstiffenedSingleWeb:z.boolean(),
}).strict();
export type MemberDesignDeclaration=z.infer<typeof memberDesignDeclarationSchema>;
const forces=z.object({nN:z.array(n).min(1).max(3),vyN:z.array(n).min(1).max(3).nullable(),vzN:z.array(n).min(1).max(3).nullable(),tNm:z.array(n).min(1).max(3).nullable(),myNm:z.array(n).min(1).max(3).nullable(),mzNm:z.array(n).min(1).max(3).nullable()}).strict();
const binding=z.object({mechanical_sha256:sha,analysis_input_sha256:sha,analysis_result_sha256:sha}).strict();
export const coldformedDesignRequestSchema=z.object({schema_version:z.literal("jpn.coldformed-design/1"),units:z.literal("SI"),piece_id:text,combination_id:text,binding,
  section:z.object({family:z.literal("cold-formed"),shape:z.literal("u-stiffened"),area_m2:positive,fy_pa:positive,fu_pa:positive,e_pa:positive,iy_m4:positive,iz_m4:positive,wy_m3:positive,wz_m3:positive,effective_length_y_m:positive,effective_length_z_m:positive,source:text,revision:text}).strict(),
  study:memberDesignDeclarationSchema.shape.study,critical:memberDesignDeclarationSchema.shape.critical,tension:memberDesignDeclarationSchema.shape.tension,
  web:z.object({flat_height_m:positive,thickness_m:positive,unstiffened_single_web:z.boolean()}).strict(),
  fields:z.array(z.object({segment_id:text,offset_m:n.nonnegative(),length_m:positive,forces}).strict()).min(1).max(320),
}).strict();
const point=z.object({segment_id:text,position_m:n,segment_position_m:n,combination_id:text,forces:z.object({nN:n,vyN:n.nullable(),vzN:n.nullable(),tNm:n.nullable(),myNm:n.nullable(),mzNm:n.nullable()}).strict()}).strict();
const check=z.discriminatedUnion("status",[
  z.object({id:text,status:z.literal("BLOCKED"),reason:text,utilization:z.null(),governing:z.null()}).strict(),
  ...(["PASS","FAIL"] as const).map(status=>z.object({id:text,status:z.literal(status),demand:n.nonnegative(),resistance:positive,utilization:n.nonnegative(),governing:point.nullable(),clauses:z.array(text)}).strict()),
]);
const capacity=z.object({design:positive,characteristic:positive.optional(),gamma:positive.optional(),modes:z.record(z.string(),positive).optional(),slenderness:z.union([n,z.record(z.string(),n)]).optional(),governing_mode:text.optional(),clauses:z.array(text),branch:text.optional(),kv:n.optional()}).strict();
export const coldformedDesignResultSchema=z.object({schema_version:z.literal("jpn.coldformed-design-result/1"),units:z.literal("SI"),input_sha256:sha,binding,piece_id:text,combination_id:text,
  standard:z.literal("ABNT NBR 14762:2010"),evaluator_version:z.literal("jpn.nbr14762-mrd/1"),capacities:z.record(z.string(),capacity),checks:z.array(check),status:z.enum(["FAIL","BLOCKED","PASS-IMPLEMENTED-CHECKS"]),
  calculation_input_sha256:sha.optional(),geometry_audit:z.object({library:z.object({name:z.literal("sectionproperties"),version:z.literal("3.10.2"),license:z.literal("MIT")}).strict(),geometry_input_sha256:sha,differences:z.record(z.string(),z.object({declared:n,computed:n,resolution:n,absolute_difference:n}).strict()),refinement:z.object({status:z.literal("observed"),relativeChanges:z.record(z.string(),n),target:n,boundaryArcPoints:z.literal(64),errorBoundCertified:z.literal(false)}).strict(),computed_properties:z.record(z.string(),n),note:text}).strict().optional(),
  member_all_limit_states_verified:z.literal(false),computed_structural_approval:z.literal(false),approved_for_fabrication:z.literal(false),remaining:z.array(text),
}).strict();

export const verifiedColdformedRequestSchema=z.object({schema_version:z.literal("jpn.verified-coldformed/1"),geometry_analysis:sectionAnalysisRequestSchema,solver_j_m4:positive,property_resolutions:z.object({area_m2:n.nonnegative(),iy_m4:n.nonnegative(),iz_m4:n.nonnegative(),wy_m3:n.nonnegative(),wz_m3:n.nonnegative(),j_m4:n.nonnegative()}).strict(),design:coldformedDesignRequestSchema}).strict();

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
  if(!selected.length||selected.some(f=>f.globalToLocal[0].some((v,i)=>Math.abs(v-selected[0].globalToLocal[0][i])>1e-10)))throw Error("Peça deve ser reta e todos os segmentos devem estar disponíveis.");
  const design=coldformedDesignRequestSchema.parse({schema_version:"jpn.coldformed-design/1",units:"SI",piece_id:declaration.pieceId,combination_id:declaration.combinationId,
    binding:{mechanical_sha256:basis,analysis_input_sha256:report.binding.inputSha256,analysis_result_sha256:report.binding.resultSha256},
    section:{family:d.family,shape:d.geometry.shape,area_m2:group.areaCm2!*1e-4,fy_pa:d.fyMpa!*1e6,fu_pa:d.fuMpa!*1e6,e_pa:group.eGpa!*1e9,iy_m4:group.iyCm4!*1e-8,iz_m4:group.izCm4!*1e-8,wy_m3:d.sectionProperties.wyCm3!*1e-6,wz_m3:d.sectionProperties.wzCm3!*1e-6,effective_length_y_m:d.bucklingYM,effective_length_z_m:d.bucklingZM,source:d.source,revision:d.revision},
    study:declaration.study,critical:declaration.critical,tension:declaration.tension,
    web:{flat_height_m:(g.height!-2*(g.insideRadius!+g.wallThickness!))/1000,thickness_m:g.wallThickness!/1000,unstiffened_single_web:declaration.unstiffenedSingleWeb},
    fields:selected.map(f=>({segment_id:f.segmentId,offset_m:f.rows[0].originalPositionM,length_m:f.lengthM,forces:f.forcePolynomials})),
  });
  const resolutions=d.sectionPropertyResolutions??{},quantities={area_m2:["areaCm2",1e-4],iy_m4:["iyCm4",1e-8],iz_m4:["izCm4",1e-8],wy_m3:["wyCm3",1e-6],wz_m3:["wzCm3",1e-6],j_m4:["jCm4",1e-8]} as const;
  return verifiedColdformedRequestSchema.parse({schema_version:"jpn.verified-coldformed/1",design,solver_j_m4:group.jCm4!*1e-8,
    property_resolutions:Object.fromEntries(Object.entries(quantities).map(([key,[original,scale]])=>[key,(resolutions[original]??0)*scale])),
    geometry_analysis:{schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:"u-stiffened",height:g.height,width:g.width,lip:g.lip,wallThickness:g.wallThickness,insideRadius:g.insideRadius},poisson:group.nu,source:d.geometry.source,revision:d.geometry.revision,responsible:declaration.study.responsible,convergence:.001},
  });
}
