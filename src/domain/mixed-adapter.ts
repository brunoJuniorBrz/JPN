import type { Project } from "./models";
import type { PhysicalPiece } from "./structure";
import { resolveMemberPhysical } from "./member-physical";
import { structureSignature } from "./calculations/project-basis";
import { newSpatialPreparation, spatialPreparationSchema, spatialPreparationReview, type SpatialPreparation } from "./spatial-preparation";
import { ConnectivityError, discretizeGeometry } from "./spatial-connectivity";
import { mixedInputHash, mixedRequestSchema } from "./mixed-analysis";
import { spatialSI } from "./spatial-analysis";
import { verifyEngineeringCombinations } from "./engineering-combinations";
import { reviewSupportInterfaces } from "./support-interface";

export function mixedPieceKind(piece: PhysicalPiece, draft: SpatialPreparation) {
  return draft.memberKinds?.find(m => m.pieceId === piece.id)?.kind ?? draft.groups[piece.role].elementKind;
}
export function mixedPreparationReview(project: Project, draft: SpatialPreparation, loaded = false) {
  const common = spatialPreparationReview(project, draft);
  const replaced = new Set(["PROPERTIES", "ISOTROPY", "CONNECTION", "AXIAL", "MEMBER_CONNECTION", "TOPOLOGY"]);
  if(loaded)replaced.add("LOADS");
  const issues = common.issues.filter(i => !replaced.has(i.code));
  const add = (code: string, message: string) => issues.push({ code, message });
  let mapping: ReturnType<typeof discretizeGeometry> | undefined;
  if (!common.geometry || !draft.connectivity) add("CONNECTIVITY_PENDING", "Revise e registre a conectividade física.");
  else { try { mapping = discretizeGeometry(common.geometry, draft.connectivity, structureSignature(project)); } catch (e) { add(e instanceof ConnectivityError ? e.code : "CONNECTIVITY", (e as Error).message); } }
  for(const issue of reviewSupportInterfaces(project,draft,common.geometry))add(issue.code,issue.message);
  const pieces = common.geometry?.pieces ?? [];
  if (new Set(draft.supports.map(s => s.nodeId)).size !== draft.supports.length) add("DUPLICATE_SUPPORT", "Declarações de apoio duplicadas.");
  if (new Set(draft.memberKinds?.map(m => m.pieceId)).size !== (draft.memberKinds?.length ?? 0)) add("DUPLICATE_KIND", "Tipos físicos duplicados por peça.");
  if (draft.memberKinds?.some(m => !pieces.some(p => p.id === m.pieceId))) add("ORPHAN_KIND", "Tipo físico refere uma peça inexistente.");
  if(draft.physicalCatalog?.assignments.some(a=>!pieces.some(p=>p.id===a.pieceId)))add("ORPHAN_PHYSICAL_ASSIGNMENT","Atribuição física refere barra inexistente.");
  for (const piece of pieces) {
    let group;try{group=resolveMemberPhysical(piece,draft).properties;}catch(e){add("PHYSICAL_REFERENCE",String(e));continue;}
    const kind = mixedPieceKind(piece, draft);
    if (!kind) { add("ELEMENT_KIND", `${piece.id}: declare explicitamente pórtico ou barra axial. Uma articulação não define o tipo da peça.`); continue; }
    if (!group.steelGrade.trim() || !group.materialSource.trim() || !group.materialRevision.trim() || !group.sectionSource.trim() || !group.sectionRevision.trim() || group.eGpa === null || group.areaCm2 === null) add("PROPERTIES", `${piece.id}: E, A, material, fontes e revisões são obrigatórios.`);
    const override = draft.memberConnections.find(m => m.pieceId === piece.id);
    const ends = (["start", "end"] as const).map(e => override && override[e] !== "inherit" ? override[e] : group.connection);
    if (kind === "axial") {
      if (ends.some(e => e !== "axial")) add("CONTRADICTION", `${piece.id}: tipo axial exige extremidades axiais explicitamente declaradas; não herda ligação rígida/articulada de pórtico.`);
    } else {
      if ([group.gGpa, group.nu, group.iyCm4, group.izCm4, group.jCm4, group.rotationDeg].some(v => v === null)) add("FRAME_PROPERTIES", `${piece.id}: pórtico exige G, ν, Iy, Iz, J e giro físico.`);
      else if (Math.abs(group.eGpa! / (2 * group.gGpa! * (1 + group.nu!)) - 1) > .001) add("ISOTROPY", `${piece.id}: E/G/ν incompatíveis.`);
      if (ends.some(e => !["rigid", "pinned"].includes(e))) add("CONTRADICTION", `${piece.id}: pórtico exige ligação rígida ou articulada em cada extremo; axial não é liberação de pórtico.`);
      if (ends.every(e => e === "pinned")) add("UNSUPPORTED_RELEASE", `${piece.id}: pórtico esférico nas duas extremidades ainda não suportado.`);
    }
  }
  return { ...common, mapping, issues, declarationsComplete: !!mapping && !issues.length, analysisReady: false as const };
}

export async function prepareMixedInput(project: Project, loaded = false) {
  const draft = spatialPreparationSchema.parse(project.workspace.spatialPreparation ?? newSpatialPreparation(project));
  if(draft.roofRegions)throw Error("COMPOSED_ROOF_PRELIMINARY: regiões retangulares compostas ainda sem transmissão auditada.");
  if(project.workspace.physicalStructure&&draft.loading?.wind)throw Error("DECLARED_STRUCTURE_UNSUPPORTED: vento em estrutura física declarada exige zonas e fachadas validadas.");
  if(project.workspace.physicalStructure&&draft.loading?.roofDistribution&&!draft.loading.roofArea.length)throw Error("DECLARED_STRUCTURE_UNSUPPORTED: distribuição de área sem ação e faces verificadas.");
  if(project.workspace.physicalStructure&&draft.loading?.roofArea.length&&!draft.physicalRoofFaces)throw Error("DECLARED_STRUCTURE_UNSUPPORTED: declare e revise superfícies de cobertura físicas para distribuir cargas.");
  if(!loaded&&draft.loading?.wind)throw Error("WIND_LOADED_REQUIRED: vento exige o adaptador com cargas distribuídas.");
  if(!loaded&&draft.loading?.roofArea.length)throw Error("DISTRIBUTED_LOADED_REQUIRED: carga de superfície só pode ser analisada pelo adaptador com distribuição explícita.");
  if(!loaded&&draft.loading&&(draft.loading.selfWeight||draft.loading.uniform.length||draft.loading.roofDistribution))throw Error("DISTRIBUTED_LOADED_REQUIRED: carregamento não nodal exige o adaptador mixed3d/2.");
  if (draft.engineeringCombinations) verifyEngineeringCombinations(draft.engineeringCombinations,draft.cases,draft.combinations);
  const review = mixedPreparationReview(project, draft, loaded), blockers = review.issues.filter(i => i.code !== "TOPOLOGY");
  if (blockers.length) throw new ConnectivityError("PREPARATION_INCOMPLETE", blockers.slice(0, 12).map(i => `${i.code}: ${i.message}`).join(" "));
  if (!review.geometry || !draft.connectivity) throw new ConnectivityError("CONNECTIVITY_PENDING", "Revise e registre a conectividade física.");
  const mapping = review.mapping!;
  if (mapping.nodes.length > 150 || mapping.members.length > 320) throw new ConnectivityError("MODEL_LIMIT", "Modelo misto excede 150 nós ou 320 segmentos; nenhum resultado foi forçado.");
  const pieces = new Map(review.geometry.pieces.map(p => [p.id, p]));
  const members = mapping.members.map(s => {
    const piece = pieces.get(s.originalId)!, physical=resolveMemberPhysical(piece,draft),group = physical.properties, kind = mixedPieceKind(piece, draft)!;
    if (kind === "axial") return { id: s.id, start: s.start, end: s.end, kind, e_pa: spatialSI.modulus(group.eGpa!), area_m2: spatialSI.area(group.areaCm2!), source: `${group.steelGrade}; ${group.materialSource}; A: ${group.sectionSource}`, revision: `${group.materialRevision}; ${group.sectionRevision}` };
    const override = draft.memberConnections.find(m => m.pieceId === piece.id);
    const end = (e: "start" | "end") => override && override[e] !== "inherit" ? override[e] : group.connection;
    const release = (value: boolean): [boolean, boolean, boolean, boolean, boolean, boolean] => [false, false, false, value, value, value];
    return { id: s.id, start: s.start, end: s.end, kind, material: physical.materialId, section: physical.sectionId, rotation_deg: group.rotationDeg!, release_start: release(s.originalStart && end("start") === "pinned"), release_end: release(s.originalEnd && end("end") === "pinned") };
  });
  const framePhysical=review.geometry.pieces.filter(p=>mixedPieceKind(p,draft)==="frame").map(p=>resolveMemberPhysical(p,draft));
  const materials=[...new Map(framePhysical.map(p=>[p.materialId,p])).values()].map(({materialId:id,properties:p})=>({id,e_pa:spatialSI.modulus(p.eGpa!),g_pa:spatialSI.modulus(p.gGpa!),nu:p.nu!,source:`${p.steelGrade}; ${p.materialSource}`,revision:p.materialRevision}));
  const sections=[...new Map(framePhysical.map(p=>[p.sectionId,p])).values()].map(({sectionId:id,properties:p})=>({id,area_m2:spatialSI.area(p.areaCm2!),iy_m4:spatialSI.inertia(p.iyCm4!),iz_m4:spatialSI.inertia(p.izCm4!),j_m4:spatialSI.inertia(p.jCm4!),source:p.sectionSource,revision:p.sectionRevision}));
  const revision = await mixedInputHash({ geometry: mapping.geometrySignature, preparation: draft });
  const request = { schema_version: "jpn.mixed3d/1", units: "SI", theory: "linear-elastic-frame-axial",
    project: { id: project.id, revision, source: `JPN adaptador misto/1; ${project.workspace.physicalStructure?"origem jpn.declared-structure/1; ":""}declarações ${revision}; experimental, sem aprovação normativa` },
    nodes: mapping.nodes.map(n => ({ id: n.id, x_m: spatialSI.metres(n.x), y_m: spatialSI.metres(n.y), z_m: spatialSI.metres(n.z) })), members,
    materials,sections,
    supports: draft.supports.filter(s => s.dofs.some(d => d === "fixed")).map(s => ({ node: s.nodeId, restrained: s.dofs.map(d => d === "fixed") })),
    cases: draft.cases, combinations: draft.combinations,
    nodal_loads: draft.loads.map(l => ({ node: l.nodeId, case: l.caseId, fx_n: spatialSI.force(l.fxKn!), fy_n: spatialSI.force(l.fyKn!), fz_n: spatialSI.force(l.fzKn!), mx_nm: spatialSI.moment(l.mxKnm!), my_nm: spatialSI.moment(l.myKnm!), mz_nm: spatialSI.moment(l.mzKnm!) })),
  };
  return { schema_version: "jpn.mixed-adapter/1" as const, approved_for_fabrication: false as const, preparation_sha256: revision, input_sha256: await mixedInputHash(request), mapping, request };
}
export async function adaptMixedProject(project: Project) {
  const prepared=await prepareMixedInput(project);
  return {...prepared,request:mixedRequestSchema.parse(prepared.request)};
}
