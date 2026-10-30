"use client";
import Link from "next/link";
import { ArrowUpRight, Copy, MapPin, Trash2, UserRound } from "lucide-react";
import type { Project } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { Status } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { generateStructure } from "@/domain/calculations/structure";
export function ProjectCard({ project }: { project: Project }) {
  const { removeProject, duplicateProject } = useData();
  const structure = generateStructure(project);
  return <article className="project-card"><div className="flex items-center justify-between gap-2"><span className="category-label">{project.category}</span><Status value={project.status} /></div><Link href={`/projetos/${project.id}`} className="project-title">{project.name}<ArrowUpRight size={20} /></Link><p className="project-meta"><UserRound size={15} />{project.client}</p><p className="project-meta"><MapPin size={15} />{project.location || "Localização não informada"}</p><p className="card-price">{structure.model ? `${structure.model.pieces.length} peças no levantamento` : "Configurar levantamento"}</p>{project.isExample && <span className="example-tag">Exemplo fictício</span>}<div className="project-card-footer"><span>Atualizado em<br /><strong>{formatDate(project.updatedAt)}</strong></span><div className="flex"><button className="icon-button" aria-label={`Duplicar ${project.name}`} title="Duplicar projeto" onClick={() => duplicateProject(project.id)}><Copy size={18} /></button><button className="icon-button danger" aria-label={`Excluir ${project.name}`} title="Excluir projeto" onClick={() => { if (window.confirm(`Excluir o projeto “${project.name}”? Esta ação não pode ser desfeita.`)) removeProject(project.id); }}><Trash2 size={18} /></button></div></div></article>;
}
