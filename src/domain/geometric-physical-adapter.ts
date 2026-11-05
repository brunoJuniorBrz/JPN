import type { Project } from "./models";
import { structureSignature } from "./calculations/project-basis";
import { spatialPreparationSchema, spatialPreparationReview } from "./spatial-preparation";
import { canonicalSpatialInput, spatialRequestSchema, spatialInputHash, spatialSI } from "./spatial-analysis";
import { ConnectivityError, discretizeGeometry } from "./spatial-connectivity";

export async function adaptSpatialProject(project: Project) {
  if(project.workspace.physicalStructure||project.workspace.spatialPreparation?.physicalCatalog)throw Error("PHYSICAL_MODEL_MIXED_REQUIRED: geometria declarada e propriedades individuais exigem o adaptador mixed3d; sem fallback ao grupo ou gerador.");
  const draft = spatialPreparationSchema.parse(project.workspace.spatialPreparation);
  if (new Set(draft.supports.map(s => s.nodeId)).size !== draft.supports.length) throw new ConnectivityError("DUPLICATE_SUPPORT", "Há declarações de apoio repetidas para o mesmo nó; revise, sem consolidar restrições automaticamente.");
  const review = spatialPreparationReview(project, draft);
  const blockers = review.issues.filter(i => i.code !== "TOPOLOGY");
  if (blockers.length) throw new ConnectivityError("PREPARATION_INCOMPLETE", blockers.map(i => `${i.code}: ${i.message}`).join(" "));
  if (!review.geometry || !draft.connectivity) throw new ConnectivityError("CONNECTIVITY_PENDING", "A conectividade física ainda não foi declarada.");
  const mapping = discretizeGeometry(review.geometry, draft.connectivity, structureSignature(project));
  const pieces = new Map(review.geometry.pieces.map(p => [p.id, p]));
  const members = mapping.members.map(segment => {
    const piece = pieces.get(segment.originalId)!, group = draft.groups[piece.role], override = draft.memberConnections.find(m => m.pieceId === piece.id);
    const start = override && override.start !== "inherit" ? override.start : group.connection;
    const end = override && override.end !== "inherit" ? override.end : group.connection;
    if ([start, end].includes("axial")) throw new ConnectivityError("AXIAL_UNSUPPORTED", "Este núcleo não converte barras axiais em pórticos. Modelo misto ainda não implementado.", [piece.id]);
    if ([start, end].includes("pending")) throw new ConnectivityError("RELEASE_PENDING", "Ligação ainda pendente.", [piece.id]);
    if (start === "pinned" && end === "pinned") throw new ConnectivityError("PINNED_TORSION_UNSUPPORTED", "Pórtico com ambas extremidades esféricas: torção livre ainda não representada. Não se inventou restrição torsional.", [piece.id]);
    const release = (pinned: boolean): [boolean, boolean, boolean, boolean, boolean, boolean] => [false, false, false, pinned, pinned, pinned];
    return { id: segment.id, start: segment.start, end: segment.end, kind: "frame" as const, material: `MAT-${piece.role}`, section: `SEC-${piece.role}`, rotation_deg: group.rotationDeg!,
      release_start: release(segment.originalStart && start === "pinned"), release_end: release(segment.originalEnd && end === "pinned") };
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSpatialInput({ geometry: mapping.geometrySignature, preparation: draft })));
  const revision = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const roles = [...new Set(review.geometry.pieces.map(p => p.role))];
  const request = spatialRequestSchema.parse({ schema_version: "jpn.frame3d/1", units: "SI", theory: "linear-elastic-euler-bernoulli",
    project: { id: project.id, revision, source: `JPN adaptador geométrico-físico/1; declarações SHA-256 ${revision}; sem aprovação normativa` },
    nodes: mapping.nodes.map(n => ({ id: n.id, x_m: spatialSI.metres(n.x), y_m: spatialSI.metres(n.y), z_m: spatialSI.metres(n.z) })), members,
    materials: roles.map(role => { const p = draft.groups[role]; return { id: `MAT-${role}`, e_pa: spatialSI.modulus(p.eGpa!), g_pa: spatialSI.modulus(p.gGpa!), nu: p.nu!, source: `${p.steelGrade}; ${p.materialSource}`, revision: p.materialRevision }; }),
    sections: roles.map(role => { const p = draft.groups[role]; return { id: `SEC-${role}`, area_m2: spatialSI.area(p.areaCm2!), iy_m4: spatialSI.inertia(p.iyCm4!), iz_m4: spatialSI.inertia(p.izCm4!), j_m4: spatialSI.inertia(p.jCm4!), source: p.sectionSource, revision: p.sectionRevision }; }),
    supports: draft.supports.filter(s => s.dofs.some(d => d === "fixed")).map(s => ({ node: s.nodeId, restrained: s.dofs.map(d => d === "fixed") })),
    cases: draft.cases,
    nodal_loads: draft.loads.map(l => ({ node: l.nodeId, case: l.caseId, fx_n: spatialSI.force(l.fxKn!), fy_n: spatialSI.force(l.fyKn!), fz_n: spatialSI.force(l.fzKn!), mx_nm: spatialSI.moment(l.mxKnm!), my_nm: spatialSI.moment(l.myKnm!), mz_nm: spatialSI.moment(l.mzKnm!) })),
    combinations: draft.combinations,
  });
  return { schema_version: "jpn.spatial-adapter/1" as const, analysis_ready: true, approved_for_fabrication: false, preparation_sha256: revision, input_sha256: await spatialInputHash(request), mapping, request };
}
