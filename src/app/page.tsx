"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, FolderOpen, FilePenLine, CircleCheck, Ruler, Boxes } from "lucide-react";
import { useData } from "@/components/data-provider";
import { PageHeading } from "@/components/ui";
import { ProjectCard } from "@/components/projects/project-card";
import { preprojectExample, PREPROJECT_EXAMPLE_ID } from "@/domain/preproject-example";
export default function Dashboard() {
  const { data, installPlanningExample, saveProject, flush } = useData(), router = useRouter();
  const projects = [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), real = projects.filter(p => !p.isExample);
  const stats = [{ label: "Suas obras", value: real.length, icon: FolderOpen, detail: "Sem contar os exemplos" }, { label: "Em elaboração", value: real.filter(p => p.status === "Em elaboração").length, icon: FilePenLine, detail: "Projetos em preparação" }, { label: "Finalizados", value: real.filter(p => p.status === "Finalizado").length, icon: CircleCheck, detail: "Status informado por você" }, { label: "Com configuração de peças", value: real.filter(p => p.planning).length, icon: Boxes, detail: "Configuração iniciada; confira as pendências" }];
  return <><PageHeading eyebrow="JPN PROJETOS" title="Da obra à lista de materiais" description="Organize as medidas, gere a geometria e confira os quantitativos para cotação." action={<Link className="button" href="/projetos/novo"><Plus size={20} />Novo projeto</Link>} />
    <section className="welcome-panel simple-welcome"><div><h2>Seu levantamento, passo a passo.</h2><p>1. Obra · 2. Medidas · 3. Estrutura · 4. Resultado</p><Link href="/projetos/novo" className="welcome-link">Começar uma nova obra <ArrowRight size={20} /></Link></div><Ruler className="welcome-icon" size={64} /></section>
    <section className="example-intro"><div><strong>Veja as peças de uma cobertura de 10 × 20 m</strong><p>Exemplo fictício com tesouras, terças, pilares e lista de materiais.</p></div><button className="button secondary" onClick={() => { const id = installPlanningExample(); if (id) router.push(`/projetos/${id}?fluxo=levantamento&etapa=3`); }}>Abrir exemplo de levantamento<ArrowRight size={18} /></button></section>
    <section className="example-intro"><div><strong>Pré-projeto de duas águas, do 3D à proposta</strong><p>Exemplo fictício com aproveitamento, análise de uma tesoura, orçamento e desenhos preliminares. Sem liberação de fabricação.</p></div><button className="button secondary" onClick={() => { if (!data.projects.some(p => p.id === PREPROJECT_EXAMPLE_ID)) { saveProject(preprojectExample()); if (!flush()) return; } router.push(`/projetos/${PREPROJECT_EXAMPLE_ID}?fluxo=levantamento&etapa=3`); }}>Abrir exemplo completo de pré-projeto<ArrowRight size={18} /></button></section>
    <section className="stats-grid" aria-label="Estatísticas dos projetos">{stats.map(item => <article key={item.label} className="stat-card"><div><span>{item.label}</span><item.icon size={20} /></div><strong>{item.value}</strong><p>{item.detail}</p></article>)}</section>
    <div className="section-title"><div><h2>Projetos recentes</h2><p>Toque no nome para continuar.</p></div><Link href="/projetos" className="text-link">Ver todos<ArrowRight size={18} /></Link></div>
    {projects.length ? <div className={`project-grid ${data.settings.compactView ? "compact" : ""}`}>{projects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} />)}</div> : <section className="empty-state"><h3>Seu primeiro projeto começa aqui</h3><Link href="/projetos/novo" className="button">Criar primeiro projeto</Link></section>}
    <div className="home-shortcuts"><Link className="button secondary" href="/materiais"><Boxes size={20} />Catálogo de materiais e perfis</Link><Link className="button secondary" href="/configuracoes">Configurações e backup</Link></div>
    <p className="notice">Geração geométrica e quantitativos disponíveis. O dimensionamento por resistência e a escolha automática de perfis ainda estão em desenvolvimento. O orçamento de venda permanece dentro de cada projeto.</p>
  </>;
}
