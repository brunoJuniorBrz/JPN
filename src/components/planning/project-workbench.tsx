"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { captureRevision, structureSignature, transferTakeoff } from "@/domain/calculations/project-basis";
import { projectCutting } from "@/domain/calculations/cutting";
import { buildPreproductionDossier } from "@/domain/calculations/preproduction";
import { formatMeasure } from "@/domain/calculations/units";
import { Field, Input, Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { useData } from "@/components/data-provider";
import { downloadBlob, exportFilename } from "@/lib/exports/proposal";
import { AnalysisPanel } from "./analysis-panel";
import { SpatialAnalysisPanel } from "./spatial-analysis-panel";
import { SpatialPreparationPanel } from "./spatial-preparation-panel";
import { SpatialCoordinationPanel } from "./spatial-coordination-panel";
import { MixedAnalysisWorkspace } from "./mixed-analysis-workspace";
import type { ResultSection } from "./takeoff-summary";

export function ProjectWorkbench({ project, onChange, onEditStructure, activeSection = "engineering" }: { project: Project; onChange: (patch: Partial<Project>) => void; onEditStructure?: () => void; activeSection?: ResultSection }) {
  const { data, saveProject, flush } = useData(), [tab, setTab] = useState("overview"), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [preparationStage, setPreparationStage] = useState<"profiles" | "supports" | "loads" | "review">("profiles");
  const [label, setLabel] = useState(""), [author, setAuthor] = useState(""), [pieceId, setPieceId] = useState(""), [lengthMm, setLengthMm] = useState<number | null>(null);
  const declared=project.workspace.physicalStructure!==undefined;
  const [mixedOpened,setMixedOpened]=useState(false);
  const model=resolvePhysicalStructure(project).model,config=project.workspace.cutting;
  const preproduction = !declared && model && activeSection==="materials" ? buildPreproductionDossier(project) : null;
  let plan: ReturnType<typeof projectCutting> | null = null, pending = "";
  if (activeSection === "materials" && !declared) { try { plan = projectCutting(project); } catch (e) { pending = (e as Error).message; } }
  function openPreparation(stage: typeof preparationStage) { setPreparationStage(stage); setTab("prepare"); }
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
  async function downloadDossier(kind:"pdf"|"xlsx") {
    setBusy(true);setError("");setMessage("");
    try {
      saveProject(project);
      if(!flush())throw new Error("Não foi possível salvar esta revisão antes da exportação.");
      const exports=await import("@/lib/exports/preproduction");
      const bytes=kind==="pdf"?await exports.createPreproductionPdf(project):await exports.createPreproductionWorkbook(project);
      const mime=kind==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      downloadBlob(new Blob([bytes],{type:mime}),exportFilename(project,"dossie-pre-fabricacao-preliminar",kind));
      setMessage("Dossiê preliminar exportado. Não é uma ordem de compra ou corte.");
    }catch(e){setError(e instanceof Error?e.message:"Falha na exportação do dossiê.");}
    finally{setBusy(false);}
  }
  return <section className="project-workbench" hidden={activeSection==="model"} aria-label={activeSection==="materials"?"Aproveitamento e orçamento":activeSection==="engineering"?"Ferramentas de engenharia":"Desenhos e revisões"}>
    {!declared && activeSection === "materials" && <div className="result-business-action"><div><h3>Do levantamento ao orçamento</h3><p>Quantitativos geométricos preliminares. Confira preços e custos antes de apresentar uma proposta.</p></div><button type="button" className="button" disabled={!model} onClick={() => action(() => { onChange(transferTakeoff(project, Math.round(data.settings.defaultWastePercent * 100) / 100)); setMessage("Quantitativos vinculados ao orçamento de venda. Confira preços por metro e custos na área comercial."); })}>Atualizar quantitativos no orçamento</button></div>}
    {activeSection === "engineering" && <div className="actions"><button type="button" className="button" onClick={()=>{setTab("mixedlocal");setMixedOpened(true);}}>Preparar e analisar este projeto</button></div>}
    {!declared && activeSection === "engineering" && <div className="spatial-jump"><p>Consulte o roteiro estrutural e os módulos de análise disponíveis nesta revisão. Nenhum resultado libera fabricação.</p><button type="button" className="button secondary" onClick={() => setTab("overview")}>Ver roteiro estrutural</button></div>}
    {!declared && activeSection === "engineering" && <Field label="Ferramenta de engenharia"><Select value={tab} onChange={e=>{setTab(e.target.value);if(e.target.value==="mixedlocal")setMixedOpened(true);}}>{[["overview","Roteiro estrutural"],["prepare","Preparar análise"],["analysis","Análise disponível"],["spatial","Análise 3D experimental"],["mixedlocal","Análise Estrutural Experimental"]].map(([key,title])=><option key={key} value={key}>{title}</option>)}</Select></Field>}
    {!declared && activeSection === "engineering" && tab === "overview" && <SpatialCoordinationPanel project={project} onEdit={openPreparation} onOpenAnalysis={() => setTab("spatial")} onEditStructure={onEditStructure} />}
    {!declared && activeSection === "engineering" && tab === "prepare" && <SpatialPreparationPanel key={preparationStage} initialSection={preparationStage} project={project} onChange={onChange} onOpenSpatial={() => setTab("spatial")} />}
    {!declared && activeSection === "engineering" && tab === "analysis" && <AnalysisPanel project={project} onChange={onChange} />}
    {!declared && activeSection === "engineering" && tab === "spatial" && <SpatialAnalysisPanel project={project} onOpenPreparation={() => openPreparation("review")} />}
    {(declared||mixedOpened)&&<div className="mixed-preserved" hidden={activeSection!=="engineering"||!declared&&tab!=="mixedlocal"}><MixedAnalysisWorkspace project={project} onChange={onChange}/></div>}
    {!declared && activeSection === "materials" && <details className="result-cutting-details technical-details"><summary>Simular aproveitamento de barras</summary><h4>Simulação preliminar de aproveitamento</h4><p>Perfis e aços separados. Comprimento comercial vem de cada perfil. Uma perda de serra por peça, mais duas perdas de extremidade por barra. Heurística First Fit Decreasing; não comprova o mínimo de barras e não libera fabricação.</p>
      <div className="form-grid"><NumberField label="Espessura do corte (mm)" value={config.kerfMm} min={0} max={1000} onChange={kerfMm => changeCutting({ kerfMm })} /><NumberField label="Perda em cada extremidade (mm)" value={config.endTrimMm} min={0} max={100000} onChange={endTrimMm => changeCutting({ endTrimMm })} /><NumberField label="Sobra mínima aproveitável (mm)" value={config.minimumRemnantMm} min={0} max={1000000} onChange={minimumRemnantMm => changeCutting({ minimumRemnantMm })} /></div>
      <label className="checkbox-label"><input type="checkbox" checked={config.useFabrication} onChange={e => changeCutting({ useFabrication: e.target.checked })} />Usar comprimentos finais declarados por peça (ainda sem liberação de fabricação)</label>
      <details className="technical-details"><summary>Comprimentos de fabricação declarados</summary><p>Sem descontos automáticos. Informar comprimento não aprova perfil, ligação ou corte. Alterar geometria/perfil invalida estes registros.</p><Field label="Peça para comprimento final"><Select value={pieceId} onChange={e => { setPieceId(e.target.value); setLengthMm(null); }}><option value="">Selecione</option>{model?.pieces.map(p => <option key={p.id}>{p.id}</option>)}</Select></Field><NumberField key={pieceId} label="Comprimento final declarado (mm)" value={lengthMm} min={.001} max={1000000} onChange={setLengthMm} /><button className="button secondary" disabled={!pieceId || lengthMm === null} onClick={() => action(() => { onChange({ workspace: { ...project.workspace, fabrication: [...project.workspace.fabrication.filter(f => f.pieceId !== pieceId), { pieceId, lengthMm: lengthMm!, signature: structureSignature(project), note: "Comprimento declarado para simulação; sem liberação de corte." }] } }); setMessage("Comprimento final registrado nesta geometria."); })}>Registrar comprimento declarado</button><ul>{project.workspace.fabrication.map(f => <li key={f.pieceId}>{f.pieceId}: {formatMeasure(f.lengthMm)} mm · {f.signature === structureSignature(project) ? "Nesta geometria" : "Desatualizado"}</li>)}</ul></details>
      {pending && <p className="notice" role="status">{pending}</p>}
      {plan && <div data-testid="cutting-results"><p><strong>{plan.groups.reduce((sum, g) => sum + g.bars.length, 0)} barras comerciais estimadas</strong> · simulação, não é ordem de compra ou corte.</p><div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Perfil / barra</th><th>Peças (mm)</th><th>Sobra (mm)</th><th>Desperdício (mm)</th></tr></thead><tbody>{plan.groups.flatMap(g => g.bars.map(b => <tr key={`${g.groupId}-${b.id}`}><td>{g.profile}<br />{g.groupId}-{b.id}</td><td>{b.pieces.map(p => `${p.id}: ${formatMeasure(p.lengthMm)}`).join("; ")}</td><td>{formatMeasure(b.remainderMm)} · aproveitável {formatMeasure(b.reusableMm)}</td><td>{formatMeasure(b.wasteMm)}</td></tr>))}</tbody></table></div><p>Compra estimada por perfil: {plan.groups.map(g => `${g.profile}: ${g.bars.length} barras × ${formatMeasure(g.bars[0].stockMm / 1000)} m; aproveitamento ${formatMeasure(g.utilizationPercent, 2)}%`).join(" · ")}</p><button className="button secondary" disabled={busy} onClick={() => void download("cut")}>Baixar simulação de corte em PDF</button></div>}
    </details>}
    {!declared && activeSection === "materials" && <section data-testid="preproduction-dossier">
      <h4>Dossiê de materiais para conferência — sem liberação para produção</h4>
      <p>Este dossiê separa peças geométricas, medidas finais declaradas, grupos de materiais, simulação de corte e pendências. Não equivale a dimensionamento, detalhamento de ligações ou aprovação do engenheiro.</p>
      {!preproduction ? <p className="notice">Gere a estrutura antes de produzir um levantamento.</p> : <>
        <p className="notice"><strong>NÃO LIBERADO PARA COMPRA OU CORTE.</strong> Projeto e revisão geométrica: {preproduction.roofRevision}. Todos os comprimentos de fabricação são declarações para conferência, não medidas de execução aprovadas.</p>
        <p><strong>{preproduction.totals.pieces} peças</strong> · {preproduction.totals.groups} grupos · {formatMeasure(preproduction.totals.geometricLengthMm / 1000,3)} m geométricos · massa {preproduction.totals.completeMass?"completa declarada":"conhecida parcial"}: {formatMeasure(preproduction.totals.knownMassKg,3)} kg.</p>
        <p>Comprimentos finais por peça: {preproduction.totals.fullyDeclaredFinalLengths?"todos declarados, ainda não verificados":"pendentes ou obsoletos"}. Barras comerciais: {preproduction.totals.simulatedStockBars === null?"simulação indisponível":`${preproduction.totals.simulatedStockBars} barras simuladas`}.</p>
        <div className="takeoff-table-scroll"><table className="takeoff-table">
          <thead><tr><th>Família / perfil</th><th>Peças</th><th>Comprimento geométrico</th><th>Final declarado</th><th>Massa</th></tr></thead>
          <tbody>{preproduction.groups.map((g,i)=><tr key={i}><td>{g.role} · {g.profileName || "Pendente"} · {g.steelGrade || "Aço pendente"}</td><td>{g.quantity}</td><td>{formatMeasure(g.geometricTotalMm/1000,3)} m</td><td>{g.finalDeclaredTotalMm===null?"Pendente":`${formatMeasure(g.finalDeclaredTotalMm/1000,3)} m`}</td><td>{g.massKg===null?"Pendente":`${formatMeasure(g.massKg,3)} kg`}</td></tr>)}</tbody>
        </table></div>
        <details><summary>Conferências pendentes ({preproduction.issues.length})</summary>
          <ul>{preproduction.issues.slice(0,15).map((issue,i)=><li key={i}>{issue.pieceId?`${issue.pieceId}: `:""}{issue.message}</li>)}</ul>
          {preproduction.issues.length>15&&<p>Mais {preproduction.issues.length-15} ocorrências. A planilha Excel inclui todas por peça.</p>}
        </details>
        <div className="actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>void downloadDossier("pdf")}>Baixar dossiê preliminar PDF</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void downloadDossier("xlsx")}>Baixar dossiê preliminar Excel</button></div>
      </>}
    </section>}
    {activeSection === "files" && <><h4>Desenhos e revisões preliminares</h4><p>DXF contém barras 3D em mm, camadas por categoria e IDs. SVG contém vista frontal cotada. Sem furos, soldas, chapas ou detalhes de ligação presumidos.</p><div className="actions"><button className="button secondary" disabled={!model || busy} onClick={() => void download("dxf")}>Baixar desenho em DXF</button><button className="button secondary" disabled={declared || !model || busy} onClick={() => void download("svg")}>Baixar desenho em SVG</button></div><Field label="Identificação da revisão"><Input value={label} maxLength={200} onChange={e => setLabel(e.target.value)} /></Field><Field label="Responsável pelo registro"><Input value={author} maxLength={200} onChange={e => setAuthor(e.target.value)} /></Field><button className="button secondary" disabled={!label.trim() || !author.trim()} onClick={() => action(() => { onChange(captureRevision(project, label, author)); setMessage("Revisão preliminar registrada. Este registro não libera fabricação."); })}>Registrar revisão preliminar</button><ul>{project.revisions.map(r => <li key={r.id}>{r.label} · {r.author} · {new Date(r.createdAt).toLocaleString("pt-BR")} · <button className="button secondary" onClick={() => action(() => { onChange({ roof: structuredClone(r.roof), planning: structuredClone(r.planning), workspace: structuredClone(r.workspace) }); setMessage("Dados da revisão copiados para o rascunho atual; histórico preservado. Confira orçamento e análise."); })}>Copiar revisão para rascunho</button></li>)}</ul><p className="notice">Revisões registradas não podem ser editadas. Exporte backups; o armazenamento local não fornece assinatura digital nem auditoria externa. Nenhum documento desta versão é liberado para fabricação.</p></>}
    {busy && <p role="status">Preparando documento…</p>}{message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
