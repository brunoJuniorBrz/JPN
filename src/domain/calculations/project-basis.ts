import type { Project } from "../models";
import { generateStructure } from "./structure";
import { roles, roleLabels } from "../structure";

// Content identity for dependent drafts, not a cryptographic signature or approval.
export function structureSignature(project: Pick<Project, "roof" | "planning"> & Partial<Pick<Project,"workspace">>): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  if(project.workspace?.physicalStructure){
    const d=project.workspace.spatialPreparation,assignments=d?.physicalCatalog?.assignments??[];
    const pieces=project.workspace.physicalStructure.pieces.map(p=>{
      // A display category has no physical effect only when properties, class
      // and both endpoint connections are explicitly independent of its group.
      const ends=d?.memberConnections.find(m=>m.pieceId===p.id);
      const explicit=assignments.some(a=>a.pieceId===p.id)&&d?.memberKinds?.some(m=>m.pieceId===p.id)&&ends&&![ends.start,ends.end].includes("inherit");
      return explicit?{id:p.id,start:p.start,end:p.end}:p;
    });
    return JSON.stringify(canonical({physicalStructure:{...project.workspace.physicalStructure,pieces},assignments}));
  }
  return JSON.stringify(canonical({ roof: project.roof, planning: project.planning }));
}

export function transferTakeoff(project: Project, wastePercent: number): Project {
  if(project.workspace.physicalStructure)throw Error("DECLARED_STRUCTURE_UNSUPPORTED: quantitativos de cobertura não se aplicam à geometria física declarada.");
  const result = generateStructure(project);
  if (!result.model || !project.planning) throw new Error("Gere a geometria antes de transferir os quantitativos.");
  const signature = structureSignature(project);
  const materials = project.estimate.materials.filter(line => line.source !== "takeoff");
  for (const role of roles) {
    const pieces = result.model.pieces.filter(piece => piece.role === role), profile = project.planning.profiles[role];
    if (!pieces.length) continue;
    const old = project.estimate.materials.find(line => line.source === "takeoff" && line.quantityOrigin?.role === role);
    materials.push({ id: old?.id ?? crypto.randomUUID(), materialId: null, name: `${roleLabels[role]} · ${profile.name || "Perfil pendente"}`,
      purchaseUnit: "m", measurementUnit: "m", measurementPerPurchase: null, source: "takeoff", manualQuantity: pieces.reduce((sum, p) => sum + p.lengthMm / 1000, 0), wastePercent,
      unitPriceCents: old?.unitPriceCents ?? profile.pricePerMeterCents ?? null,
      quantityOrigin: { signature, role, pieceIds: pieces.map(p => p.id) } });
  }
  return { ...project, estimate: { ...project.estimate, materials } };
}

export function captureRevision(project: Project, label: string, author: string): Project {
  if (!label.trim() || !author.trim()) throw new Error("Informe identificação da revisão e responsável pelo registro.");
  if (project.revisions.length >= 20) throw new Error("Limite de 20 revisões locais. Exporte o backup antes de continuar em uma cópia.");
  return { ...project, revisions: [...project.revisions, { id: crypto.randomUUID(), label: label.trim(), author: author.trim(), createdAt: new Date().toISOString(), roof: structuredClone(project.roof), planning: structuredClone(project.planning), workspace: structuredClone(project.workspace) }] };
}
