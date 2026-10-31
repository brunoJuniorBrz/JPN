"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { captureRevision, structureSignature, transferTakeoff } from "@/domain/calculations/project-basis";
import { projectCutting } from "@/domain/calculations/cutting";
import { formatMeasure } from "@/domain/calculations/units";
import { Field, Input, Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { useData } from "@/components/data-provider";
import { downloadBlob, exportFilename } from "@/lib/exports/proposal";
import { AnalysisPanel } from "./analysis-panel";
import { SpatialAnalysisPanel } from "./spatial-analysis-panel";

export function ProjectWorkbench({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const { data, saveProject, flush } = useData(), [tab, setTab] = useState("cut"), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(""), [author, setAuthor] = useState(""), [pieceId, setPieceId] = useState(""), [lengthMm, setLengthMm] = useState<number | null>(null);
  const model = generateStructure(project).model, config = project.workspace.cutting;
  let plan: ReturnType<typeof projectCutting> | null = null, pending = "";
  try { plan = projectCutting(project); } catch (e) { pending = (e as Error).message; }
  function changeCutting(patch: Partial<typeof config>) { onChange({ workspace: { ...project.workspace, cutting: { ...config, ...patch } } }); }
  function action(run: () => void) { setError(""); setMessage(""); try { run(); } catch (e) { setError((e as Error).message); } }
  async function download(kind: "dxf" | "svg" | "cut") {
    setBusy(true); setError("");
    try {
      saveProject(project); if (!flush()) throw new Error("Não foi possível salvar esta revisão. Confira o aviso de armazenamento.");
      let blob: Blob, extension: string;
      if (kind === "cut") { const { createCuttingSimulationPdf } = await import("@/lib/exports/cutting"); blob = new Blob([await createCuttingSimulationPdf(project)], { type: "application/pdf" }); extension = "pdf"; }
      else { const cad = await import("@/lib/exports/cad"); blob = new Blob([kind === "dxf" ? cad.createStructureDxf(project) : cad.createStructureSvg(project)], { type: kind === "dxf" ? "application/dxf" : "image/svg+xml" }); extension = kind; }
      downloadBlob(blob, exportFilename(project, kind === "cut" ? "simulacao-corte" : "desenho-preliminar", extension)); setMessage("Documento preliminar gerado para conferência.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="project-workbench"><h3>Do levantamento à proposta</h3><p>Quantitativo preliminar · análise experimental separada · dimensionamento normativo pendente · fabricação não liberada.</p>
    <button type="button" className="button" disabled={!model} onClick={() => action(() => { onChange(transferTakeoff(project, Math.round(data.settings.defaultWastePercent * 100) / 100)); setMessage("Quantitativos vinculados ao orçamento de venda. Confira preços por metro e custos na área comercial."); })}>Atualizar quantitativos no orçamento</button>
    <nav className="project-mode" aria-label="Ferramentas do pré-projeto">{[["cut", "Aproveitamento"], ["analysis", "Análise disponível"], ["spatial", "Análise 3D experimental"], ["docs", "Revisões e desenhos"]].map(([key, title]) => <button key={key} type="button" aria-pressed={tab === key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{title}</button>)}</nav>
    {tab === "analysis" && <AnalysisPanel project={project} onChange={onChange} />}
    {tab === "spatial" && <SpatialAnalysisPanel project={project} />}
    {tab === "cut" && <><h4>Simulação preliminar de aproveitamento</h4><p>Perfis e aços separados. Comprimento comercial vem de cada perfil. Uma perda de serra por peça, mais duas perdas de extremidade por barra. Heurística First Fit Decreasing; não comprova o mínimo de barras e não libera fabricação.</p>
      <div className="form-grid"><NumberField label="Espessura do corte (mm)" value={config.kerfMm} min={0} max={1000} onChange={kerfMm => changeCutting({ kerfMm })} /><NumberField label="Perda em cada extremidade (mm)" value={config.endTrimMm} min={0} max={100000} onChange={endTrimMm => changeCutting({ endTrimMm })} /><NumberField label="Sobra mínima aproveitável (mm)" value={config.minimumRemnantMm} min={0} max={1000000} onChange={minimumRemnantMm => changeCutting({ minimumRemnantMm })} /></div>
      <label className="checkbox-label"><input type="checkbox" checked={config.useFabrication} onChange={e => changeCutting({ useFabrication: e.target.checked })} />Usar comprimentos finais declarados por peça (ainda sem liberação de fabricação)</label>
      <details className="technical-details"><summary>Comprimentos de fabricação declarados</summary><p>Sem descontos automáticos. Informar comprimento não aprova perfil, ligação ou corte. Alterar geometria/perfil invalida estes registros.</p><Field label="Peça para comprimento final"><Select value={pieceId} onChange={e => { setPieceId(e.target.value); setLengthMm(null); }}><option value="">Selecione</option>{model?.pieces.map(p => <option key={p.id}>{p.id}</option>)}</Select></Field><NumberField key={pieceId} label="Comprimento final declarado (mm)" value={lengthMm} min={.001} max={1000000} onChange={setLengthMm} /><button className="button secondary" disabled={!pieceId || lengthMm === null} onClick={() => action(() => { onChange({ workspace: { ...project.workspace, fabrication: [...project.workspace.fabrication.filter(f => f.pieceId !== pieceId), { pieceId, lengthMm: lengthMm!, signature: structureSignature(project), note: "Comprimento declarado para simulação; sem liberação de corte." }] } }); setMessage("Comprimento final registrado nesta geometria."); })}>Registrar comprimento declarado</button><ul>{project.workspace.fabrication.map(f => <li key={f.pieceId}>{f.pieceId}: {formatMeasure(f.lengthMm)} mm · {f.signature === structureSignature(project) ? "Nesta geometria" : "Desatualizado"}</li>)}</ul></details>
      {pending && <p className="notice" role="status">{pending}</p>}
      {plan && <div data-testid="cutting-results"><p><strong>{plan.groups.reduce((sum, g) => sum + g.bars.length, 0)} barras comerciais estimadas</strong> · simulação, não é ordem de compra ou corte.</p><div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Perfil / barra</th><th>Peças (mm)</th><th>Sobra (mm)</th><th>Desperdício (mm)</th></tr></thead><tbody>{plan.groups.flatMap(g => g.bars.map(b => <tr key={`${g.groupId}-${b.id}`}><td>{g.profile}<br />{g.groupId}-{b.id}</td><td>{b.pieces.map(p => `${p.id}: ${formatMeasure(p.lengthMm)}`).join("; ")}</td><td>{formatMeasure(b.remainderMm)} · aproveitável {formatMeasure(b.reusableMm)}</td><td>{formatMeasure(b.wasteMm)}</td></tr>))}</tbody></table></div><p>Compra estimada por perfil: {plan.groups.map(g => `${g.profile}: ${g.bars.length} barras × ${formatMeasure(g.bars[0].stockMm / 1000)} m; aproveitamento ${formatMeasure(g.utilizationPercent, 2)}%`).join(" · ")}</p><button className="button secondary" disabled={busy} onClick={() => void download("cut")}>Baixar simulação de corte em PDF</button></div>}
    </>}
    {tab === "docs" && <><h4>Desenhos e revisões preliminares</h4><p>DXF contém barras 3D em mm, camadas por categoria e IDs. SVG contém vista frontal cotada. Sem furos, soldas, chapas ou detalhes de ligação presumidos.</p><div className="actions"><button className="button secondary" disabled={!model || busy} onClick={() => void download("dxf")}>Baixar desenho em DXF</button><button className="button secondary" disabled={!model || busy} onClick={() => void download("svg")}>Baixar desenho em SVG</button></div><Field label="Identificação da revisão"><Input value={label} maxLength={200} onChange={e => setLabel(e.target.value)} /></Field><Field label="Responsável pelo registro"><Input value={author} maxLength={200} onChange={e => setAuthor(e.target.value)} /></Field><button className="button secondary" disabled={!label.trim() || !author.trim()} onClick={() => action(() => { onChange(captureRevision(project, label, author)); setMessage("Revisão preliminar registrada. Este registro não libera fabricação."); })}>Registrar revisão preliminar</button><ul>{project.revisions.map(r => <li key={r.id}>{r.label} · {r.author} · {new Date(r.createdAt).toLocaleString("pt-BR")} · <button className="button secondary" onClick={() => action(() => { onChange({ roof: structuredClone(r.roof), planning: structuredClone(r.planning), workspace: structuredClone(r.workspace) }); setMessage("Dados da revisão copiados para o rascunho atual; histórico preservado. Confira orçamento e análise."); })}>Copiar revisão para rascunho</button></li>)}</ul><p className="notice">Revisões registradas não podem ser editadas. Exporte backups; o armazenamento local não fornece assinatura digital nem auditoria externa. Nenhum documento desta versão é liberado para fabricação.</p></>}
    {busy && <p role="status">Preparando documento…</p>}{message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
