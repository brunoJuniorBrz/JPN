"use client";
import { useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Search } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Input, PageHeading, Select } from "@/components/ui";
import { ProjectCard } from "@/components/projects/project-card";
import { statuses } from "@/domain/models";
export default function ProjectsPage() {
  const { data } = useData(); const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const projects = data.projects.filter(p => (!status || p.status === status) && normalize(`${p.name} ${p.client}`).includes(normalize(search))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <><PageHeading eyebrow="ÁREA DE TRABALHO" title="Projetos" description="Seus clientes, obras e informações em um só lugar." action={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/tercas" className="button secondary">Calcular terças</Link><Link href="/projetos/novo" className="button"><Plus size={18} />Novo projeto</Link></div>} /><div className="filter-bar"><label className="search-field"><Search size={18} /><Input aria-label="Pesquisar por nome ou cliente" placeholder="Pesquisar por nome ou cliente" value={search} onChange={e => setSearch(e.target.value)} /></label><Select aria-label="Filtrar por status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{statuses.map(s => <option key={s}>{s}</option>)}</Select></div><p className="result-count">{projects.length} {projects.length === 1 ? "projeto encontrado" : "projetos encontrados"}</p>{projects.length ? <div className={`project-grid ${data.settings.compactView ? "compact" : ""}`}>{projects.map(p => <ProjectCard key={p.id} project={p} />)}</div> : <div className="empty-state"><FolderOpen size={32} /><h2>{data.projects.length ? "Nenhum resultado" : "Organize sua próxima obra"}</h2><p>{data.projects.length ? "Tente outro nome ou ajuste o filtro de status." : "Crie um projeto com os dados reais do seu cliente."}</p>{data.projects.length ? <button className="button secondary" onClick={() => { setSearch(""); setStatus(""); }}>Limpar filtros</button> : <Link href="/projetos/novo" className="button">Criar primeiro projeto</Link>}</div>}</>;
}
