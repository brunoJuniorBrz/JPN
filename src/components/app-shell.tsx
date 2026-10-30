"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderOpen, Boxes, Settings2, HardDrive, ArrowUpRight, Check, LoaderCircle, AlertCircle, Download, RotateCcw } from "lucide-react";
import { useData } from "./data-provider";
import { downloadText } from "@/lib/format";
import { serializeBackup } from "@/infrastructure/persistence/local";
import { Fragment, type ReactNode } from "react";

const navigation = [{ href: "/", label: "Visão geral", mobile: "Início", icon: LayoutDashboard }, { href: "/projetos", label: "Projetos", mobile: "Projetos", icon: FolderOpen }, { href: "/materiais", label: "Materiais", mobile: "Materiais", icon: Boxes }, { href: "/configuracoes", label: "Configurações", mobile: "Ajustes", icon: Settings2 }];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, ready, fatal, error, saveState, flush, reload, recover, invalidDraft, setInvalidDraft, loadEpoch } = useData();
  const nav = (mobile = false) => navigation.map(item => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "nav-item active" : "nav-item"}><item.icon size={20} /><span>{mobile ? item.mobile : item.label}</span>{!mobile && active && <span className="nav-dot" />}</Link>;
  });
  return <div className="app" onClickCapture={event => {
    const target = event.target as HTMLElement;
    if (target.closest("a[href]") && invalidDraft) {
      if (!window.confirm("Há campos inválidos ou um cadastro ainda não salvo. Sair e descartar essas alterações?")) { event.preventDefault(); event.stopPropagation(); }
      else setInvalidDraft(false);
    }
  }}>
    <a href="#conteudo" className="skip-link">Ir ao conteúdo</a>
    <aside className="sidebar"><Link href="/" className="brand"><span className="brand-word">{data.settings.companyName}</span><span className="brand-caption">GESTÃO DE ESTRUTURAS</span></Link><p className="nav-caption">ÁREA DE TRABALHO</p><nav aria-label="Navegação principal">{nav()}</nav><div className="sidebar-bottom"><div className="workspace-note"><HardDrive size={20} /><strong>Seu espaço de trabalho</strong><p>Dados salvos neste navegador.<br />Faça backups regularmente.</p><Link href="/configuracoes">Gerenciar backups <ArrowUpRight size={15} /></Link></div><span className="version">LEVANTAMENTO <span>v0.6.0</span></span></div></aside>
    <div className="main-shell"><header className="topbar"><span className="topbar-label">{data.settings.companyName} <span className="desktop-inline">/ Área de trabalho</span></span><span className={`save-indicator ${saveState === "error" ? "text-error" : ""}`} aria-live="polite">{saveState === "pending" ? <LoaderCircle size={15} className="spin" /> : saveState === "error" ? <AlertCircle size={15} /> : <Check size={15} />}<span>{!ready ? "Carregando" : fatal ? "Dados indisponíveis" : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Não salvo" : "Salvo neste navegador"}</span></span></header>
      <main id="conteudo" className="main-content">
        {!ready ? <div className="loading" role="status"><LoaderCircle className="spin" /> Carregando seus projetos…</div> : fatal ? <div className="panel error-panel" role="alert"><AlertCircle /><h1>Não foi possível abrir os dados</h1><p>{fatal}</p><div className="actions"><button className="button" onClick={recover}><Download size={18} />Baixar dados originais</button><button className="button secondary" onClick={reload}><RotateCcw size={18} />Tentar novamente</button></div></div> : <>
          {error && <div className="alert error-alert" role="alert"><strong>Verifique o armazenamento</strong><p>{error}</p><div className="actions"><button className="button secondary" onClick={() => downloadText(serializeBackup(data), "jpn-backup-pendente.json")}>Exportar backup pendente</button><button className="button secondary" onClick={flush}>Tentar salvar</button><button className="button secondary" onClick={() => { if (window.confirm("Recarregar os dados salvos? Alterações não salvas serão descartadas. Exporte um backup antes de continuar.")) reload(); }}>Recarregar dados</button></div></div>}
          <Fragment key={loadEpoch}>{children}</Fragment><footer className="page-footer"><HardDrive size={14} /> Armazenamento local · Sem sincronização entre dispositivos</footer>
        </>}
      </main>
    </div><nav className="mobile-nav" aria-label="Navegação móvel">{nav(true)}</nav>
  </div>;
}
