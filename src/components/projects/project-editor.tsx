"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { CommercialProjectEditor } from "./commercial-project-editor";
import { PlanningEditor } from "@/components/planning/planning-editor";

export function ProjectEditor({ initial, initialStep = 0, initialMode = "planning" }: { initial?: Project; initialStep?: number; initialMode?: "planning" | "commercial" }) {
  const [mode, setMode] = useState(initialMode); const { data, invalidDraft, setInvalidDraft, flush } = useData();
  const project = initial ? data.projects.find(p => p.id === initial.id) ?? initial : undefined;
  function change(next: typeof mode) {
    if (next === mode) return;
    if (invalidDraft && !window.confirm("Há dados ainda não salvos. Deseja trocar de área e descartar esse preenchimento?")) return;
    if (!flush()) return; setInvalidDraft(false); setMode(next);
  }
  return <><nav className="project-mode" aria-label="Área do projeto"><button type="button" className={mode === "planning" ? "selected" : ""} aria-pressed={mode === "planning"} onClick={() => change("planning")}>Estrutura e materiais</button><button type="button" className={mode === "commercial" ? "selected" : ""} aria-pressed={mode === "commercial"} onClick={() => change("commercial")}>Orçamento de venda</button></nav>
    {mode === "planning" ? <PlanningEditor initial={project} initialStep={mode === initialMode ? Math.min(initialStep, 3) : 0} /> : <CommercialProjectEditor initial={project} initialStep={mode === initialMode ? initialStep : 0} />}
  </>;
}
