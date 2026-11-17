"use client";
import { useMemo, useState } from "react";
import type { Project } from "@/domain/models";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { mixedPreparationReview } from "@/domain/mixed-adapter";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { downloadText } from "@/lib/format";
import { PhysicalLineView } from "./physical-line-view";

export function useDeclaredModel(project: Project) {
  return useMemo(() => {
    const model = resolvePhysicalStructure(project).model!, draft = project.workspace.spatialPreparation ?? newSpatialPreparation(project);
    return { model, draft, review: mixedPreparationReview(project, draft, !!draft.loading) };
  }, [project]);
}
type Declared = ReturnType<typeof useDeclaredModel>;

/** Visualização central do modelo declarado (vistas de linhas). */
export function DeclaredViewport({ project, declared: { model, review } }: { project: Project; declared: Declared }) {
  const [piece, setPiece] = useState(""), [node, setNode] = useState("");
  return <section className="result-workspace" aria-label="Resultado do modelo declarado"><h2>Estrutura física declarada</h2>
    <p>{model.nodes.length} nós · {model.pieces.length} barras · revisão {project.workspace.physicalStructure!.revision} · {review.issues.length ? "Dados físicos pendentes" : "Modelo válido para preparar a análise"}.</p>
    <PhysicalLineView model={model} selected={piece} onSelect={setPiece} selectedNodeId={node} onSelectNode={setNode} />
  </section>;
}

export function DeclaredSafetyWarning() {
  return <p className="result-permanent-warning" data-testid="result-safety-warning">Análise experimental disponível no domínio suportado. Verificações normativas incompletas · fabricação bloqueada.</p>;
}

export function DeclaredMaterials({ declared: { draft } }: { declared: Declared }) {
  return <section className="result-section-panel"><h3>Referências físicas cadastradas</h3><p>Seções de cálculo independentes de perfis visuais. O levantamento abaixo usa comprimentos entre nós; não infere telhas ou plano de corte.</p><ul>{draft.physicalCatalog?.assignments.map(a => <li key={a.pieceId}>{a.pieceId} → material {a.materialId} · seção {a.sectionId}</li>)}</ul></section>;
}

export function DeclaredEngineering() {
  return <section className="result-section-panel"><h3>Preparação, análise e resultados</h3><p>Use a análise mista abaixo para conferir os dados e executar o projeto salvo. Cargas nodais e uniformes explícitas; peso próprio exige densidades rastreáveis. Vento e cobertura por área continuam bloqueados sem transmissão física validada.</p></section>;
}

export function DeclaredFiles({ project }: { project: Project }) {
  const [cadError, setCadError] = useState("");
  async function exportCad() {
    try { const { createStructureDxf } = await import("@/lib/exports/cad"); downloadText(createStructureDxf(project), `jpn-${project.id}-PRELIMINAR.dxf`); setCadError(""); }
    catch (e) { setCadError(e instanceof Error ? e.message : "Não foi possível exportar o DXF."); }
  }
  return <section className="result-section-panel"><div className="actions"><button type="button" className="button secondary" onClick={() => downloadText(JSON.stringify(project, null, 2), "jpn-modelo-estrutural.json")}>Exportar modelo estrutural JSON</button><button type="button" className="button secondary" onClick={() => void exportCad()}>Exportar DXF cotado preliminar</button></div>{cadError && <p role="alert">{cadError}</p>}<p>O arquivo conserva a declaração e suas referências. Relatórios de cálculo são exportados após uma análise válida.</p></section>;
}
