"use client";
import { use } from "react";
import Link from "next/link";
import { useData } from "@/components/data-provider";
import { ProjectEditor } from "@/components/projects/project-editor";
import { isStudioStep } from "@/components/planning/project-studio";
export default function EditProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ etapa?: string; fluxo?: string; vista?: string }> }) {
  const { id } = use(params); const query = use(searchParams); const { data } = useData(); const project = data.projects.find(p => p.id === id);
  if (!project) return <section className="empty-state"><h1>Projeto não encontrado</h1><p>O projeto pode ter sido excluído ou estar salvo em outro navegador.</p><Link href="/projetos" className="button">Voltar aos projetos</Link></section>;
  // ?etapa aceita o número antigo (0..3 no levantamento, 0..4 no orçamento) ou o nome de uma etapa do estúdio.
  const studioStep = isStudioStep(query.etapa) ? query.etapa : undefined;
  const step = Number(query.etapa ?? 0);
  return <ProjectEditor key={`${project.id}-${query.fluxo ?? ""}-${query.etapa ?? "0"}`} initial={project} initialMode={query.fluxo === "levantamento" || query.etapa === undefined || studioStep ? "planning" : "commercial"} initialStep={Number.isInteger(step) && step >= 0 && step <= 4 ? step : 0} initialStudioStep={studioStep} initialOpen3D={query.vista === "3d"} />;
}
