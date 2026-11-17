"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { Crosshair, EyeOff, Focus, Maximize2, Pencil, Ruler, Scan, Search } from "lucide-react";
import { roleLabels, type PieceRole, type StructureModel } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { findPieces } from "./piece-search";
import { analysisTools, studioSteps, type AnalysisTool, type StudioStepId } from "./project-studio";
import type { Viewer3DApi } from "./structure-3d";

/**
 * Menu de contexto do 3D (F5): clique direito, toque longo, Shift+F10 ou tecla Menu.
 * O clique direito já seleciona a peça sob o cursor (o raycaster do viewer trata qualquer botão).
 * Todas as ações também existem em lugar visível (ferramentas do 3D, inspetor, etapa Estrutura).
 */
export function StudioViewportMenu({ children, model, selected, api, onShowForces, onEditProfile }: {
  children: ReactNode; model: StructureModel | null; selected: string; api: Viewer3DApi | null;
  onShowForces: (pieceId: string) => void; onEditProfile: (role: PieceRole) => void;
}) {
  const piece = model?.pieces.find(p => p.id === selected) ?? null;
  const viewer = !!api;
  return <ContextMenu>
    <ContextMenuTrigger asChild>
      <div className="studio-canvas-zone" tabIndex={0} aria-label="Modelo do projeto. Shift+F10 ou tecla Menu abre as ações do 3D." data-testid="studio-canvas-zone">{children}</div>
    </ContextMenuTrigger>
    <ContextMenuContent aria-label="Ações do modelo 3D">
      <ContextMenuLabel>{piece ? `${piece.id} · ${roleLabels[piece.role]}` : "Nenhuma peça selecionada"}</ContextMenuLabel>
      <ContextMenuItem icon={<Crosshair />} disabled={!piece} onSelect={() => piece && onShowForces(piece.id)}>Ver esforços</ContextMenuItem>
      <ContextMenuItem icon={<Focus />} disabled={!piece || !viewer} onSelect={() => piece && api?.isolate(piece.id)}>Isolar peça</ContextMenuItem>
      <ContextMenuItem icon={<EyeOff />} disabled={!piece || !viewer} onSelect={() => piece && api?.hideRole(piece.role)}>{piece ? `Ocultar família: ${roleLabels[piece.role]}` : "Ocultar família"}</ContextMenuItem>
      <ContextMenuItem icon={<Ruler />} disabled={!piece || !viewer} onSelect={() => piece && api?.measureFrom(piece.start)}>Medir a partir daqui</ContextMenuItem>
      <ContextMenuItem icon={<Scan />} disabled={!piece || !viewer} onSelect={() => piece && api?.focus(piece.id)}>Aproximar peça</ContextMenuItem>
      <ContextMenuItem icon={<Pencil />} disabled={!piece} onSelect={() => piece && onEditProfile(piece.role)}>Editar perfil</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem icon={<Maximize2 />} disabled={!viewer} onSelect={() => api?.showAll()}>Mostrar tudo</ContextMenuItem>
      <ContextMenuItem disabled={!viewer} onSelect={() => api?.reset()}>Vista isométrica</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

export type PaletteActions = {
  goStep: (id: StudioStepId) => void; openTool: (tool: AnalysisTool) => void; open3D: () => void;
  recalculate: () => void; save: () => void; selectPiece: (id: string) => void; showAll: () => void;
};

/** Paleta de comandos (F5): Ctrl+K / ⌘K. Etapas, ferramentas, ações e busca de peças. */
export function StudioCommandPalette({ model, actions }: { model: StructureModel | null; actions: PaletteActions }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pieces = useMemo(() => model && query.trim() ? findPieces(model.pieces, query).matches.slice(0, 20) : [], [model, query]);
  const run = (action: () => void) => { setOpen(false); setQuery(""); action(); };
  return <>
    <button type="button" className="studio-command-trigger" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
      <Search size={14} aria-hidden="true" />Comandos<Kbd keys={["Ctrl", "K"]} />
    </button>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setQuery(""); }}>
      <DialogContent title="Comandos do projeto" hideTitle className="studio-command-dialog">
        <Command label="Comandos do projeto" shouldFilter={true}>
          <Command.Input value={query} onValueChange={setQuery} placeholder="Etapa, ferramenta, ação ou ID de peça…" className="input studio-command-input" />
          <Command.List className="studio-command-list">
            <Command.Empty>Nada encontrado.</Command.Empty>
            <Command.Group heading="Etapas">
              {studioSteps.map(s => <Command.Item key={s.id} value={`etapa ${s.label}`} onSelect={() => run(() => actions.goStep(s.id))}><s.icon size={14} aria-hidden="true" />{s.label}</Command.Item>)}
            </Command.Group>
            <Command.Group heading="Ferramentas de análise">
              {analysisTools.map(t => <Command.Item key={t.id} value={`ferramenta ${t.label}`} onSelect={() => run(() => actions.openTool(t.id))}>{t.label}</Command.Item>)}
            </Command.Group>
            <Command.Group heading="Ações">
              <Command.Item value="abrir modelo 3d" onSelect={() => run(actions.open3D)}>Abrir modelo 3D</Command.Item>
              <Command.Item value="recalcular análise" onSelect={() => run(actions.recalculate)}>Recalcular análise</Command.Item>
              <Command.Item value="mostrar tudo no 3d" onSelect={() => run(actions.showAll)}>Mostrar tudo no 3D</Command.Item>
              <Command.Item value="salvar levantamento" onSelect={() => run(actions.save)}>Salvar levantamento</Command.Item>
            </Command.Group>
            {pieces.length > 0 && <Command.Group heading="Peças">
              {pieces.map(p => <Command.Item key={p.id} value={`peça ${p.id} ${roleLabels[p.role]} ${query}`} onSelect={() => run(() => actions.selectPiece(p.id))}>{p.id} · {roleLabels[p.role]} · {formatMeasure(p.lengthMm / 1000)} m</Command.Item>)}
            </Command.Group>}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  </>;
}
