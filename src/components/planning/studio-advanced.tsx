"use client";
import { useState, useSyncExternalStore } from "react";
import { BookOpen, ChevronDown, FlaskConical, FileJson, GraduationCap, Network, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { AnalysisTool, StudioStepId } from "./project-studio";

/** Abre e mostra um painel recolhido (<details>) pelo texto do resumo, depois que a etapa renderizar. */
function reveal(summaryStart: string) {
  const attempt = (left: number) => {
    const summary = [...document.querySelectorAll("summary")].find(s => s.textContent?.trim().startsWith(summaryStart));
    if (!summary) { if (left > 0) requestAnimationFrame(() => attempt(left - 1)); return; }
    const details = summary.closest("details"); if (details) details.open = true;
    summary.scrollIntoView({ behavior: "smooth", block: "center" }); (summary as HTMLElement).focus();
  };
  requestAnimationFrame(() => attempt(10));
}

/**
 * "Ferramentas avançadas" (F6): exemplos, referência do Tom e módulos experimentais num só menu.
 * Os painéis continuam onde estavam (etapa Obra / ferramentas de análise); o menu só leva até eles.
 */
export function AdvancedToolsMenu({ goStep, openTool }: { goStep: (id: StudioStepId) => void; openTool: (tool: AnalysisTool) => void }) {
  const toObra = (summary: string) => { goStep("obra"); reveal(summary); };
  return <Menu>
    <MenuTrigger asChild><Button variant="secondary" size="sm">Ferramentas avançadas<ChevronDown size={14} aria-hidden="true" /></Button></MenuTrigger>
    <MenuContent align="end">
      <MenuLabel>Referências e modelos</MenuLabel>
      <MenuItem icon={<Receipt />} onSelect={() => toObra("Referência comercial auditada")}>Referência comercial do Tom</MenuItem>
      <MenuItem icon={<FileJson />} onSelect={() => toObra("Importar modelo estrutural declarado")}>Importar modelo estrutural (JSON)</MenuItem>
      <MenuItem icon={<Network />} onSelect={() => goStep("tesoura")}>Editor de tesoura — uma ou duas águas</MenuItem>
      <MenuItem icon={<Network />} onSelect={() => toObra("Criar ou editar estrutura irregular")}>Estrutura irregular por nós e barras</MenuItem>
      <MenuSeparator />
      <MenuLabel>Experimentais</MenuLabel>
      <MenuItem icon={<FlaskConical />} onSelect={() => openTool("mixedlocal")}>Análise Estrutural Experimental e exemplos</MenuItem>
      <MenuItem icon={<FlaskConical />} onSelect={() => openTool("spatial")}>Análise 3D experimental</MenuItem>
      <MenuItem icon={<FlaskConical />} onSelect={() => openTool("analysis")}>Análise disponível (tesoura 2D)</MenuItem>
      <MenuItem icon={<BookOpen />} onSelect={() => openTool("overview")}>Roteiro estrutural</MenuItem>
    </MenuContent>
  </Menu>;
}

const tourKey = "jpn-studio-tour:v1";
const tourSteps = [
  { title: "Etapas à esquerda", body: "Obra, Geometria, Estrutura, Tesoura, Cargas, Análise, Verificação, Materiais e Arquivos. No celular elas ficam na barra de baixo." },
  { title: "Modelo sempre no centro", body: "Clique numa peça para ver perfil, comprimento e, com análise atual, N, V e M no inspetor. Clique direito (ou Shift+F10) abre as ações do 3D." },
  { title: "Resultados e pendências", body: "A barra sobre o 3D escolhe combinação e camada, com legenda. O selo vermelho “Bloqueado para fabricação” abre todas as pendências: nada é liberado sem revisão do engenheiro." },
  { title: "Atalhos", body: "Ctrl+K (⌘K no Mac) abre os comandos: etapas, ferramentas, recalcular e busca de peças." },
];

/** Tour curto (F6): só abre quando o usuário pede; um selo "Novo" aparece até ser visto uma vez. */
const tourListeners = new Set<() => void>();
function subscribeTour(onChange: () => void) { tourListeners.add(onChange); return () => { tourListeners.delete(onChange); }; }
function tourSeen() { try { return localStorage.getItem(tourKey) === "seen"; } catch { return true; } }

export function StudioTour() {
  const [open, setOpen] = useState(false), [index, setIndex] = useState(0);
  const seen = useSyncExternalStore(subscribeTour, tourSeen, () => true);
  const close = (value: boolean) => {
    setOpen(value); if (value) return;
    setIndex(0);
    try { localStorage.setItem(tourKey, "seen"); } catch { /* preferência de interface; ignorar */ }
    tourListeners.forEach(listener => listener());
  };
  const step = tourSteps[index], last = index === tourSteps.length - 1;
  return <Dialog open={open} onOpenChange={close}>
    <DialogTrigger asChild><Button variant="ghost" size="sm"><GraduationCap size={14} aria-hidden="true" />Tour do estúdio{!seen && <span className="studio-tour-new">novo</span>}</Button></DialogTrigger>
    <DialogContent title={`${index + 1} de ${tourSteps.length} · ${step.title}`} description="Tour rápido do estúdio do projeto"
      footer={<>{index > 0 && <Button variant="secondary" onClick={() => setIndex(i => i - 1)}>Voltar</Button>}
        {last ? <Button onClick={() => close(false)}>Concluir</Button> : <Button onClick={() => setIndex(i => i + 1)}>Próximo</Button>}</>}>
      <p className="studio-tour-body">{step.body}</p>
      {last && <p className="studio-tour-body"><Kbd keys={["Ctrl", "K"]} /></p>}
    </DialogContent>
  </Dialog>;
}
