"use client";
import type { ReactNode } from "react";
import { BarChart3, Box, ClipboardCheck, FileText, HardHat, Layers, Package, Ruler, Weight } from "lucide-react";
import { cx } from "@/components/ui/cx";

/** Etapas do estúdio do projeto (F1). A ordem é a do fluxo de trabalho. */
export const studioSteps = [
  { id: "obra", label: "Obra", icon: HardHat },
  { id: "geometria", label: "Geometria", icon: Ruler },
  { id: "estrutura", label: "Estrutura", icon: Layers },
  { id: "cargas", label: "Cargas", icon: Weight },
  { id: "analise", label: "Análise", icon: BarChart3 },
  { id: "verificacao", label: "Verificação", icon: ClipboardCheck },
  { id: "materiais", label: "Materiais", icon: Package },
  { id: "arquivos", label: "Arquivos", icon: FileText },
] as const;
export type StudioStepId = (typeof studioSteps)[number]["id"];

/** Ferramentas da etapa Análise (antes no select "Ferramenta de engenharia"). */
export const analysisTools = [
  { id: "overview", label: "Roteiro estrutural" },
  { id: "analysis", label: "Análise disponível" },
  { id: "spatial", label: "Análise 3D experimental" },
  { id: "mixedlocal", label: "Análise Estrutural Experimental" },
] as const;
export type AnalysisTool = (typeof analysisTools)[number]["id"];

const stepIds = studioSteps.map(step => step.id) as readonly string[];
export function isStudioStep(value: string | undefined): value is StudioStepId {
  return value !== undefined && stepIds.includes(value);
}

/**
 * URLs antigas: ?etapa=0..3 eram Obra, Medidas, Estrutura e Resultado.
 * O Resultado abria o modelo e os quantitativos; no estúdio o modelo fica sempre
 * no centro, então o equivalente é a etapa Materiais.
 */
export function studioStepFromLegacy(step: number): StudioStepId {
  return (["obra", "geometria", "estrutura", "materiais"] as const)[Math.min(Math.max(step, 0), 3)];
}

export function studioStepIndex(id: StudioStepId) { return stepIds.indexOf(id); }

/** Valor de ?etapa ao criar o projeto: número antigo quando existe (0..2), senão o nome. */
export function studioStepUrl(id: StudioStepId): string {
  const legacy = (["obra", "geometria", "estrutura"] as const).indexOf(id as "obra");
  return legacy >= 0 ? String(legacy) : id;
}

export function StudioRail({ step, onStep, tool, onTool, showTools, pendingCount }: {
  step: StudioStepId; onStep: (id: StudioStepId) => void;
  tool: AnalysisTool; onTool: (tool: AnalysisTool) => void; showTools: boolean;
  /** Pendências da revisão técnica (modelo gerado), mostradas na etapa Verificação. */
  pendingCount?: number;
}) {
  return <div className="studio-rail">
    <nav className="studio-steps" aria-label="Etapas do levantamento">
      <ol>{studioSteps.map(({ id, label, icon: Icon }, index) =>
        <li key={id}><button type="button" className={cx("studio-step", step === id && "current")} aria-current={step === id ? "step" : undefined} onClick={() => onStep(id)}>
          <span className="studio-step-index" aria-hidden="true">{index + 1}</span><Icon size={16} aria-hidden="true" /><span className="studio-step-label">{label}</span>
          {id === "verificacao" && pendingCount !== undefined && <small className="studio-step-count">{pendingCount > 0 ? `${pendingCount} pendências` : "verificação pendente"}</small>}
        </button></li>)}</ol>
    </nav>
    {showTools && <nav className="studio-tools" aria-label="Ferramentas de análise">
      <p className="studio-tools-caption" aria-hidden="true">Ferramentas de análise</p>
      <ul>{analysisTools.map(({ id, label }) =>
        <li key={id}><button type="button" className={cx("studio-tool", step === "analise" && tool === id && "current")} aria-current={step === "analise" && tool === id ? "page" : undefined} onClick={() => onTool(id)}>{label}</button></li>)}</ul>
    </nav>}
  </div>;
}

export function StudioLayout({ rail, viewportToolbar, viewport, inspectorTitle, inspector, status }: {
  rail: ReactNode; viewportToolbar?: ReactNode; viewport: ReactNode; inspectorTitle: string; inspector: ReactNode; status: ReactNode;
}) {
  return <div className="project-studio" data-testid="project-studio">
    {rail}
    <section className="studio-viewport" aria-label="Visualização do modelo">
      {viewportToolbar}
      <div className="studio-viewport-body">{viewport}</div>
    </section>
    <section className="studio-inspector" aria-labelledby="studio-inspector-title">
      <h2 id="studio-inspector-title" className="studio-inspector-title">{inspectorTitle}</h2>
      {inspector}
    </section>
    <footer className="studio-status" aria-label="Estado do projeto">{status}</footer>
  </div>;
}

export function StudioViewportEmpty({ children }: { children: ReactNode }) {
  return <div className="studio-viewport-empty"><Box size={28} aria-hidden="true" />{children}</div>;
}
