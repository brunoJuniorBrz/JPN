"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { catalogDesignations, studioModelFromPhysical } from "@/domain/studio-result-layers";
import type { Viewer3DApi, Viewer3DLabel } from "./structure-3d";
const Structure3D = dynamic(() => import("./structure-3d").then(m => m.Structure3D), { ssr: false, loading: () => <p role="status">Carregando modelo 3D…</p> });
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

/** Visualização real das barras declaradas: a conversão não infere seções ou apoios. */
export function DeclaredViewport({ project, declared: { model, review }, selected, onSelect, nodeId, onSelectNode, analysisColors, deformed, labels, onApi, onHover }: {
  project: Project; declared: Declared; selected?: string; onSelect?: (id: string) => void;
  nodeId?: string; onSelectNode?: (id: string) => void; analysisColors?: Record<string, number>;
  deformed?: { a: [number, number, number]; b: [number, number, number] }[] | null;
  labels?: Viewer3DLabel[]; onApi?: (api: Viewer3DApi | null) => void; onHover?: (id: string) => void;
}) {
  const [localPiece, setLocalPiece] = useState(""), [localNode, setLocalNode] = useState("");
  const [view, setView] = useState<"3d" | "lines">("3d");
  const piece = selected ?? localPiece, setPiece = onSelect ?? setLocalPiece, node = nodeId ?? localNode, setNode = onSelectNode ?? setLocalNode;
  // Uma mudança comercial não deve recriar o canvas/câmera se os nós e barras são os mesmos.
  // A referência física é a fonte do modelo: outros campos podem criar um novo objeto model idêntico.
  // Compara pelo conteúdo: ações comerciais (ex.: atualizar quantitativos no orçamento) podem copiar o
  // workspace e gerar uma referência nova com os mesmos nós e barras, o que recriava a tela WebGL inteira.
  const physicalKey = JSON.stringify(project.workspace.physicalStructure), siteKey = JSON.stringify(project.workspace.trussEditor ?? null);
  const catalogKey = JSON.stringify(project.workspace.spatialPreparation?.physicalCatalog ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visualModel = useMemo(() => studioModelFromPhysical(model, catalogDesignations(project.workspace.spatialPreparation?.physicalCatalog)), [physicalKey, catalogKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const siteContext = useMemo(() => project.workspace.trussEditor, [siteKey]);
  return <section className="result-workspace declared-studio-view" aria-label="Resultado do modelo declarado"><h2>Estrutura física declarada</h2>
    <p>{model.nodes.length} nós · {model.pieces.length} barras · revisão {project.workspace.physicalStructure!.revision} · {review.issues.length ? "Dados físicos pendentes" : "Modelo válido para preparar a análise"}.</p>
    <div className="actions" role="group" aria-label="Visualização declarada">
      <button type="button" className={view === "3d" ? "button" : "button secondary"} aria-pressed={view === "3d"} onClick={() => setView("3d")}>Modelo 3D</button>
      <button type="button" className={view === "lines" ? "button" : "button secondary"} aria-pressed={view === "lines"} onClick={() => setView("lines")}>Vista simples 2D</button>
    </div>
    {view === "3d" ? <>
      <p className="field-hint">Barras e nós declarados em 3D. {project.workspace.trussEditor ? "Muros, calhas, telhas e chapas são representações arquitetônicas esquemáticas, sem capacidade resistente verificada." : "Sem inferência de perfis, ligações ou apoios; dados faltantes continuam pendentes."}</p>
      <Structure3D model={visualModel} roof={project.roof} planning={project.planning} projectName={project.name}
        selected={piece} onSelect={setPiece} selectedNodeId={node} onSelectNode={setNode} inspectNodes
        orientationCube labels={labels} analysisColors={analysisColors} deformed={deformed} onApi={onApi} onHover={onHover} allowPresentation={false} siteContext={siteContext} />
    </> : <PhysicalLineView model={model} selected={piece} onSelect={setPiece} selectedNodeId={node} onSelectNode={setNode} analysisColors={analysisColors} />}
  </section>;
}

export function DeclaredSafetyWarning({ trussEditor = false }: { trussEditor?: boolean }) {
  // Obra do editor de tesoura: um aviso só; os detalhes ficam no selo de pendências.
  if (trussEditor) return <p className="result-permanent-warning" data-testid="result-safety-warning">Necessária conferência por engenheiro para validação · fabricação bloqueada.</p>;
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
