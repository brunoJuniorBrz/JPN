"use client";
import { useMemo } from "react";
import type { Project } from "@/domain/models";
import { spatialCoordination, createSpatialHandoff, type SpatialStep } from "@/domain/spatial-coordination";
import { downloadText } from "@/lib/format";

export function SpatialCoordinationPanel({ project, onEdit, onOpenAnalysis, onEditStructure }: {
  project: Project;
  onEdit: (section: "profiles" | "supports" | "loads" | "review") => void;
  onOpenAnalysis: () => void;
  onEditStructure?: () => void;
}) {
  const status = useMemo(() => spatialCoordination(project), [project]);
  const { review, steps, recorded } = status;
  function navigate(step: SpatialStep) {
    if (step.action === "structure") {
      if (onEditStructure) onEditStructure();
      else onEdit("review");
    } else onEdit(step.action);
  }
  function exportHandoff() {
    const handoff = createSpatialHandoff(project);
    downloadText(JSON.stringify(handoff, null, 2), "jpn-pacote-preparacao-estrutural.json");
  }
  return <section className="spatial-overview" aria-label="Roteiro de análise estrutural">
    <h3>Da cobertura 3D à preparação da análise</h3>
    <p>O JPN já gera a geometria e permite declarar dados físicos. A ligação entre essas duas partes ainda precisa ser validada: este painel não faz dimensionamento nem envia automaticamente a obra para o solver.</p>
    <div className="notice" data-testid="coordination-status">
      <strong>{review.stale ? "Geometria alterada · declarações exigem nova revisão" : review.geometry ? "Modelo visual disponível · análise da obra ainda bloqueada" : "Geometria visual pendente"}</strong>
      <p>{review.geometry ? `${review.geometry.pieces.length} peças · ${review.geometry.nodes.length} nós` : "Nenhum modelo 3D calculável para exibição."} · {recorded} de 5 etapas de declaração sem pendências automáticas.</p>
      <p>Existem {review.contacts.length} contatos/ocorrências de topologia detectados; sua resolução deve ser feita pelo futuro adaptador físico.</p>
    </div>
    <div className="spatial-overview-grid" data-testid="coordination-stages">
      {steps.map(step => <section className="spatial-overview-step" key={step.id}>
        <div className="spatial-overview-step-head"><strong>{step.label}</strong><span>{step.status === "blocked" ? "Depende do motor" : step.status === "pending" ? "A preencher/revisar" : "Declarações registradas"}</span></div>
        <p>{step.messages.length ? step.messages[0] : step.status === "blocked" ? "O adaptador de topologia e as verificações físicas ainda são pendentes." : "Campos preenchidos; hipóteses ainda precisam de revisão técnica."}</p>
        {step.messages.length > 1 && <details><summary>Ver mais {step.messages.length - 1} pendências</summary><ul>{step.messages.slice(1).map((message, i) => <li key={i}>{message}</li>)}</ul></details>}
        <button type="button" className="button secondary" onClick={() => navigate(step)}>{step.action === "structure" && onEditStructure ? "Revisar geometria" : step.id === "topology" ? "Conferir contatos" : "Abrir esta etapa"}</button>
      </section>)}
    </div>
    <div className="spatial-overview-actions">
      <button type="button" className="button" onClick={() => onEdit("profiles")}>Continuar preparação estrutural</button>
      <button type="button" className="button secondary" onClick={onOpenAnalysis}>Abrir análise 3D experimental</button>
      <button type="button" className="button secondary" onClick={exportHandoff} disabled={!review.geometry}>Exportar pacote técnico para revisão</button>
    </div>
    <p className="field-hint">O pacote contém IDs e coordenadas geométricas em mm, declarações, fontes e pendências. Ele é `jpn.spatial-handoff/1`, <strong>não é entrada para o solver</strong> nem autoriza fabricação.</p>
  </section>;
}
