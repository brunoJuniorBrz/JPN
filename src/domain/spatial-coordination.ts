import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { newSpatialPreparation, spatialPreparationReview, type SpatialPreparation } from "./spatial-preparation";

export const spatialStepIds = ["geometry", "properties", "supports", "connections", "loads", "topology"] as const;
export type SpatialStepId = typeof spatialStepIds[number];
export type SpatialStep = {
  id: SpatialStepId;
  label: string;
  status: "pending" | "declared" | "blocked";
  messages: string[];
  action: "profiles" | "supports" | "loads" | "review" | "structure";
};

const stepDefinitions: Record<SpatialStepId, { label: string; action: SpatialStep["action"]; codes: string[] }> = {
  geometry: { label: "Geometria e revisão", action: "structure", codes: ["GEOMETRY", "STALE_GEOMETRY"] },
  properties: { label: "Materiais e seções", action: "profiles", codes: ["PROPERTIES", "ISOTROPY"] },
  supports: { label: "Apoios", action: "supports", codes: ["SUPPORTS", "DOFS", "ORPHAN_SUPPORT"] },
  connections: { label: "Ligações e estabilidade", action: "supports", codes: ["CONNECTION", "AXIAL", "MEMBER_CONNECTION", "DUPLICATE_CONNECTION", "ORPHAN_CONNECTION", "JOINT_REVIEW", "LATERAL"] },
  loads: { label: "Cargas e combinações", action: "loads", codes: ["CASES", "LOADS", "LOAD_VALUES", "DUPLICATE_LOADS", "COMBINATIONS", "LOAD_PATH"] },
  topology: { label: "Conectividade física", action: "review", codes: ["TOPOLOGY"] },
};

export function spatialCoordination(project: Project) {
  const draft = project.workspace.spatialPreparation ?? newSpatialPreparation(project);
  const review = spatialPreparationReview(project, draft);
  const steps = spatialStepIds.map<SpatialStep>(id => {
    const def = stepDefinitions[id];
    const messages = review.issues.filter(i => def.codes.includes(i.code)).map(i => i.message);
    return { id, label: def.label, action: def.action, messages,
      status: id === "topology" ? "blocked" : messages.length ? "pending" : "declared" };
  });
  return {
    draft,
    review,
    steps,
    recorded: steps.filter(step => step.id !== "topology" && step.status === "declared").length,
    totalDeclarative: 5,
    analysisReady: false as const, // No geometry->physical adapter exists yet.
  };
}

export function createSpatialHandoff(project: Project) {
  const coordination = spatialCoordination(project);
  const model = generateStructure(project).model;
  const { review, draft, steps } = coordination;
  // This is deliberately NOT a jpn.frame3d/1 payload: avoid any implied
  // material, release, boundary condition, or connection from visual geometry.
  return {
    schema_version: "jpn.spatial-handoff/1" as const,
    purpose: "engineering_coordination_only" as const,
    technical_status: "preliminary_not_analyzed" as const,
    analysis_ready: false as const,
    approved_for_fabrication: false as const,
    project: { id: project.id, name: project.name, geometry_signature: structureSignature(project),
      preparation_signature: draft.geometrySignature, geometry_stale: review.stale },
    geometry: model ? {
      units: "mm" as const,
      coordinate_system: "X,Y horizontal; Z vertical",
      frame_count: model.frameCount,
      nodes: model.nodes.map(n => ({ id: n.id, x_mm: n.x, y_mm: n.y, z_mm: n.z })),
      members: model.pieces.map(p => ({ id: p.id, role: p.role, start: p.start, end: p.end, axis_length_mm: p.lengthMm })),
    } : null,
    preparation: structuredClone(draft) as SpatialPreparation,
    review: {
      declared_steps: coordination.recorded,
      total_declarative_steps: coordination.totalDeclarative,
      stages: steps.map(step => ({ id: step.id, status: step.status, messages: [...step.messages] })),
      detected_contacts: review.contacts.map(c => ({ code: c.code, message: c.message, pieces: [...c.pieces], nodes: [...c.nodes] })),
      issues: review.issues.map(i => ({ code: i.code, message: i.message })),
      remaining_tasks: [
        "Validar os dados declarados com documentação técnica e responsável habilitado.",
        "Construir um adaptador geométrico-físico que trate encontros, segmentação de barras e conectividade real.",
        "Resolver juntas, liberações e apoios com significado mecânico, inclusive sistemas mistos de treliça e pórtico.",
        "Tratar o limite atual de 100 nós / 200 membros somente após testes de desempenho e estabilidade.",
        "Validar caminho das cargas, contraventamentos, fontes, combinações e hipóteses contra benchmarks independentes.",
      ],
    },
  };
}

export type SpatialHandoff = ReturnType<typeof createSpatialHandoff>;
