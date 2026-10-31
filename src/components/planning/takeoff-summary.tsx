"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { roleLabels } from "@/domain/structure";
import type { PieceRole } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";
import { useData } from "@/components/data-provider";
import { downloadBlob, exportFilename } from "@/lib/exports/proposal";
import { StructurePreview } from "./structure-preview";

export function TakeoffSummary({ project, onConfigureProfile, startIn3D = false, open3DRequest = 0 }: { project: Project; onConfigureProfile?: (role: PieceRole) => void; startIn3D?: boolean; open3DRequest?: number }) {
  const result = useMemo(() => generateStructure(project), [project]); const { model } = result;
  const { data, saveProject, flush } = useData(); const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function download(kind: "pdf" | "xlsx") {
    setBusy(true); setMessage(""); setError("");
    try {
      saveProject(project); if (!flush()) throw new Error("Não foi possível salvar. Confira o aviso de armazenamento.");
      const { takeoffData, createTakeoffPdf, createTakeoffWorkbook } = await import("@/lib/exports/takeoff");
      const input = takeoffData(project, data.settings);
      const bytes = kind === "pdf" ? await createTakeoffPdf(input) : await createTakeoffWorkbook(input);
      downloadBlob(new Blob([bytes], { type: kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), exportFilename(project, "levantamento", kind));
      setMessage("Arquivo gerado com os quantitativos e as pendências de conferência. Abra o download para conferir.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível gerar o arquivo."); }
    finally { setBusy(false); }
  }
  return <section><h2>Resultado do levantamento</h2><p className="muted">As peças e os totais abaixo vêm da mesma geometria do desenho. A conferência está ao final.</p>
    {!model ? <div className="pending-box"><h3>Faltam dados para gerar as peças</h3><ul>{result.pending.map(p => <li key={p}>{p}</li>)}</ul></div> : <>
      <div className="measurement-grid" data-testid="takeoff-totals">{[["Peças geradas", model.pieces.length], ["Linhas de tesouras", model.frameCount], ["Linhas de terças", model.purlinRows], ["Comprimento total", `${formatMeasure(model.totalLengthM)} m`], ["Área de telhamento", `${formatMeasure(model.roofAreaM2)} m²`], [model.massComplete ? "Massa total" : "Massa conhecida (parcial)", `${formatMeasure(model.knownMassKg)} kg`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="notice">Vãos entre tesouras: {formatMeasure(model.frameSpacingM)} m. Espaçamento de terças na água: {formatMeasure(model.purlinSpacingM)} m. Terças contadas por trecho entre tesouras.</p>
      <StructurePreview key={open3DRequest} project={project} result={result} onConfigureProfile={onConfigureProfile} startIn3D={startIn3D} />
      <h3>Lista de materiais por tipo e comprimento</h3><p className="field-hint">Comprimentos geométricos entre eixos. Quantidade de barras comerciais depende do plano de corte.</p>
      <div className="takeoff-table-scroll" tabIndex={0} role="region" aria-label="Lista de materiais"><table className="takeoff-table"><thead><tr><th>Tipo / perfil</th><th>Peças</th><th>Comprimento (m)</th><th>Total (m)</th><th>Massa (kg)</th></tr></thead><tbody>{model.groups.map(g => <tr key={g.key}><td><strong>{roleLabels[g.role]}</strong><br />{g.profile.name || "Perfil a definir"}<details><summary>Identificar peças</summary><p>{g.pieceIds.join(", ")}</p></details></td><td>{g.pieceIds.length}</td><td>{formatMeasure(g.lengthMm / 1000, 6)}</td><td>{formatMeasure(g.totalLengthM, 6)}</td><td>{g.massKg === null ? "Pendente" : formatMeasure(g.massKg)}</td></tr>)}</tbody></table></div>
      <section className="proposal-delivery"><h3>Baixar levantamento para cotação</h3><p>PDF para consulta e planilha com lista, peças e coordenadas. Não precisa preencher preços. As pendências acompanham os arquivos.</p><div className="actions"><button type="button" className="button" disabled={busy} onClick={() => void download("pdf")}><Download size={18} />{busy ? "Gerando…" : "Baixar lista em PDF"}</button><button type="button" className="button secondary" disabled={busy} onClick={() => void download("xlsx")}><Download size={18} />Baixar lista em Excel</button></div>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section>
    </>}
    <section className="technical-review"><h3>Conferência final do engenheiro</h3><p>Confira hipóteses, perfis e detalhes antes de usar o levantamento. Esta conferência não bloqueia os resultados nem os downloads disponíveis.</p>{model && result.pending.length > 0 && <><h4>Dados ainda pendentes</h4><ul>{result.pending.map(p => <li key={p}>{p}</li>)}</ul></>}<h4>O que este cálculo abrange</h4><ul>{result.notes.map(n => <li key={n}>{n}</li>)}</ul></section>
  </section>;
}
