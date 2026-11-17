"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import type { Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { roleLabels, type PieceRole, type StructureResult } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";
import { useData } from "@/components/data-provider";
import { downloadBlob, exportFilename } from "@/lib/exports/proposal";
import { groupMaterialsForDisplay, summarizePending, locatePending, locatePendingGroup, type PendingTarget } from "./result-presentation";
import { StructurePreview } from "./structure-preview";
import type { Viewer3DLabel } from "./structure-3d";

/** Seção da antiga etapa Resultado; o ProjectWorkbench ainda a usa para decidir o que mostrar. */
export type ResultSection = "model" | "materials" | "engineering" | "files";

/**
 * Peças geradas do projeto. generateStructure lê só categoria, cobertura, planejamento e
 * guidedSupport: edições da preparação não devem recriar o modelo nem a cena WebGL.
 */
export function useGeneratedResult(project: Project) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => generateStructure(project), [project.category, project.roof, project.planning, project.workspace.guidedSupport]);
  const grouped = useMemo(() => result.model ? groupMaterialsForDisplay(result.model.groups) : [], [result.model]);
  const pending = useMemo(() => summarizePending(result.pending), [result.pending]);
  return { result, grouped, pending };
}
type Generated = ReturnType<typeof useGeneratedResult>;

/** Visualização central: desenho 2D / 3D ou o que falta para gerar as peças. */
export function GeneratedViewport({ project, result, startIn3D, open3DRequest, onConfigureProfile, onEditStructure, onResolvePending, selected, onSelect, analysisColors, deformed, overlay, orientationCube, labels }: {
  project: Project; result: StructureResult; startIn3D: boolean; open3DRequest: number;
  onConfigureProfile?: (role: PieceRole) => void; onEditStructure?: () => void; onResolvePending?: (target: PendingTarget) => void;
  selected?: string; onSelect?: (id: string) => void;
  analysisColors?: Record<string, number>; deformed?: { a: [number, number, number]; b: [number, number, number] }[] | null;
  /** Elementos do estúdio sobre a visualização (legenda, combinação, apoios). */
  overlay?: ReactNode;
  orientationCube?: boolean; labels?: Viewer3DLabel[];
}) {
  const model = result.model;
  if (!model) return <div className="pending-box"><h3>Faltam dados para gerar as peças</h3><ul>{result.pending.map(p => <li key={p}>{p}{onResolvePending && locatePending(p) && <button className="button secondary result-pending-action" type="button" onClick={() => onResolvePending(locatePending(p)!)}>Corrigir dados</button>}</li>)}</ul></div>;
  return <div className="result-model-panel">
    {overlay}
    <StructurePreview key={open3DRequest} project={project} result={result} onConfigureProfile={onConfigureProfile} onEditStructure={onEditStructure} startIn3D={startIn3D} selected={selected} onSelect={onSelect} analysisColors={analysisColors} deformed={deformed} orientationCube={orientationCube} labels={labels} />
    <p className="result-model-context">Tesouras: {model.frameCount} linhas · Terças: {model.purlinRows} linhas · Espaçamentos entre eixos: {formatMeasure(model.frameSpacingM, 2)} m / {formatMeasure(model.purlinSpacingM, 2)} m.</p>
  </div>;
}

export function GeneratedTotals({ result }: { result: StructureResult }) {
  const model = result.model;
  if (!model) return null;
  return <div className="result-metrics" data-testid="takeoff-totals">
    <div><span>Peças</span><strong>{model.pieces.length}</strong></div>
    <div><span>Comprimento dos perfis</span><strong>{formatMeasure(model.totalLengthM, 2)} m</strong></div>
    <div><span>Área do telhado</span><strong>{formatMeasure(model.roofAreaM2, 2)} m²</strong></div>
  </div>;
}

export function GeneratedSafetyWarning() {
  return <div className="result-permanent-warning" role="note" data-testid="result-safety-warning">
    <strong>SEM DIMENSIONAMENTO CONCLUÍDO</strong> · Modelo e quantitativos preliminares. Não usar para comprar, cortar ou fabricar.
  </div>;
}

export function GeneratedMaterials({ result, grouped }: Pick<Generated, "result" | "grouped">) {
  const model = result.model;
  if (!model) return <p className="notice">Complete a geometria e a estrutura para gerar os quantitativos.</p>;
  return <section className="result-section-panel">
    <h3>Quantitativos por perfil</h3>
    <p className="field-hint">Agrupados para consulta. Todos os comprimentos geométricos e IDs originais permanecem preservados nos arquivos.</p>
    <div className="takeoff-table-scroll" tabIndex={0} role="region" aria-label="Lista de materiais">
      <table className="takeoff-table result-materials-table"><thead><tr><th>Categoria / perfil</th><th>Peças</th><th>Total (m)</th><th>Massa (kg)</th></tr></thead>
      <tbody>{grouped.map(group => <tr key={group.key}>
        <td><strong>{roleLabels[group.role]}</strong><div>{group.profileLabel}</div>
          {group.steelGrade && <small>{group.steelGrade}</small>}
          <details className="result-material-lengths"><summary>{group.rows.length} comprimentos · identificar peças</summary>
            <ul>{group.rows.map(row => <li key={row.key}><strong>{formatMeasure(row.lengthMm / 1000, 2)} m</strong> · {row.quantity} peças · {formatMeasure(row.totalLengthM, 2)} m
              <details><summary>Ver IDs</summary><span>{row.pieceIds.join(", ")}</span></details>
            </li>)}</ul>
          </details>
        </td>
        <td>{group.quantity}</td><td>{formatMeasure(group.totalLengthM, 2)}</td>
        <td>{group.massKg === null ? "Não determinada" : formatMeasure(group.massKg, 2)}</td>
      </tr>)}</tbody></table>
    </div>
    {!model.massComplete && <p className="field-hint">A massa total não está determinada: há perfis sem massa por metro cadastrada.</p>}
  </section>;
}

export function GeneratedReview({ result, pending, onResolvePending }: Pick<Generated, "result" | "pending"> & { onResolvePending?: (target: PendingTarget) => void }) {
  return <section className="technical-review" id="result-panel-engineering">
    <h3>Pendências da revisão técnica</h3>
    <p><strong>{result.pending.length} ocorrências</strong> em {pending.length} grupos de avisos. O levantamento não representa verificação estrutural aprovada.</p>
    {pending.length ? <ul>{pending.map((item, index) => {
      const target = locatePendingGroup(item);
      return <li key={index}>{item.text}
        {target && onResolvePending && <button className="button secondary result-pending-action" type="button" onClick={() => onResolvePending(target)}>
          {target.role ? "Editar perfil" : target.step === 1 ? "Editar medidas" : "Corrigir na estrutura"}
        </button>}
        {item.sources.length > 1 && <details><summary>Ver as {item.count} ocorrências originais</summary><ul>{item.sources.map((source, i) => <li key={i}>{source}</li>)}</ul></details>}
      </li>;
    })}</ul> : <p>Não há pendências cadastrais nesta geometria. As verificações normativas ainda não estão completas.</p>}
    <details><summary>Hipóteses e limites desta geração geométrica</summary><ul>{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>
  </section>;
}

export function GeneratedFiles({ project, hasModel }: { project: Project; hasModel: boolean }) {
  const { data, saveProject, flush } = useData();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function download(kind: "pdf" | "xlsx") {
    setBusy(true); setMessage(""); setError("");
    try {
      saveProject(project); if (!flush()) throw new Error("Não foi possível salvar. Confira o aviso de armazenamento.");
      const { takeoffData, createTakeoffPdf, createTakeoffWorkbook } = await import("@/lib/exports/takeoff");
      const input = takeoffData(project, data.settings);
      const bytes = kind === "pdf" ? await createTakeoffPdf(input) : await createTakeoffWorkbook(input);
      downloadBlob(new Blob([bytes], { type: kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        exportFilename(project, "levantamento-PRELIMINAR", kind));
      setMessage("Documento PRELIMINAR gerado com quantitativos e pendências. Não é ordem de compra ou fabricação.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível gerar o arquivo."); }
    finally { setBusy(false); }
  }
  if (!hasModel) return null;
  return <section className="proposal-delivery">
    <h3>Arquivos preliminares</h3>
    <p>PDF para consulta e planilha com peças e coordenadas. Os documentos incluem pendências e não autorizam aquisição, corte ou fabricação.</p>
    <div className="actions">
      <button type="button" className="button" disabled={busy} onClick={() => void download("pdf")}><Download size={18} />{busy ? "Gerando…" : "Baixar lista em PDF"}</button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void download("xlsx")}><Download size={18} />Baixar lista em Excel</button>
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
