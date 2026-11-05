"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { roleLabels, type PieceRole } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";
import { useData } from "@/components/data-provider";
import { downloadBlob, exportFilename } from "@/lib/exports/proposal";
import { groupMaterialsForDisplay, summarizePending, locatePending, locatePendingGroup, type PendingTarget } from "./result-presentation";
import { StructurePreview } from "./structure-preview";
import { DeclaredModelSummary } from "./declared-model-summary";

export type ResultSection = "model" | "materials" | "engineering" | "files";
const sections: {id: ResultSection; label: string}[] = [
  {id:"model",label:"Modelo 3D"},
  {id:"materials",label:"Materiais"},
  {id:"engineering",label:"Engenharia"},
  {id:"files",label:"Arquivos"},
];

type SummaryProps={project:Project;onConfigureProfile?:(role:PieceRole)=>void;onEditStructure?:()=>void;startIn3D?:boolean;open3DRequest?:number;activeSection?:ResultSection;onSectionChange?:(section:ResultSection)=>void;onResolvePending?:(target:PendingTarget)=>void};
export function TakeoffSummary(props:SummaryProps){
  if(props.project.workspace.physicalStructure)return <DeclaredModelSummary project={props.project} activeSection={props.activeSection??"model"} onSectionChange={props.onSectionChange??(()=>{})}/>;
  return <GeneratedTakeoffSummary {...props}/>;
}
function GeneratedTakeoffSummary({ project, onConfigureProfile, onEditStructure, startIn3D = false,
  open3DRequest = 0, activeSection = "model", onSectionChange = () => {}, onResolvePending }: {
  project: Project; onConfigureProfile?: (role: PieceRole) => void; onEditStructure?: () => void;
  startIn3D?: boolean; open3DRequest?: number;
  activeSection?: ResultSection; onSectionChange?: (section: ResultSection) => void;
  onResolvePending?: (target: PendingTarget) => void;
}) {
  const result = useMemo(() => generateStructure(project), [project]); const { model } = result;
  const grouped = useMemo(() => model ? groupMaterialsForDisplay(model.groups) : [], [model]);
  const pending = useMemo(() => summarizePending(result.pending), [result.pending]);
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

  return <section className="result-workspace" aria-label="Resultado do levantamento">
    <div className="result-workspace-heading">
      <div><h2>Resultado do levantamento</h2><p className="muted">Modelo, materiais, engenharia e documentos da mesma revisão do pré-projeto.</p></div>
      <span className="result-preliminary-tag">PRÉ-PROJETO</span>
    </div>
    {model && <div className="result-metrics" data-testid="takeoff-totals">
      <div><span>Peças</span><strong>{model.pieces.length}</strong></div>
      <div><span>Comprimento dos perfis</span><strong>{formatMeasure(model.totalLengthM, 2)} m</strong></div>
      <div><span>Área do telhado</span><strong>{formatMeasure(model.roofAreaM2, 2)} m²</strong></div>
    </div>}
    <div className="result-permanent-warning" role="note" data-testid="result-safety-warning">
      <strong>SEM DIMENSIONAMENTO CONCLUÍDO</strong> · Modelo e quantitativos preliminares. Não usar para comprar, cortar ou fabricar.
    </div>
    <nav className="result-section-tabs" role="tablist" aria-label="Áreas do resultado">
      {sections.map(({id,label}) => <button key={id} type="button" role="tab"
        id={`result-tab-${id}`} aria-controls={`result-panel-${id}`}
        aria-selected={activeSection===id} tabIndex={activeSection===id?0:-1}
        onKeyDown={event => {
          const index = sections.findIndex(section => section.id === id);
          const next = event.key === "ArrowRight" ? (index+1)%sections.length
            : event.key === "ArrowLeft" ? (index+sections.length-1)%sections.length
            : event.key === "Home" ? 0 : event.key === "End" ? sections.length-1 : -1;
          if (next < 0) return;
          event.preventDefault();
          const target = sections[next].id;
          onSectionChange(target);
          window.requestAnimationFrame(() => document.getElementById(`result-tab-${target}`)?.focus());
        }}
        onClick={() => onSectionChange(id)}>
        <span>{label}</span>{id==="engineering" && <small className="result-pending-count">{result.pending.length>0?`${result.pending.length} pendências`:"Verificação pendente"}</small>}
      </button>)}
    </nav>
    {!model ? <div className="pending-box"><h3>Faltam dados para gerar as peças</h3><ul>{result.pending.map(p=><li key={p}>{p}{onResolvePending && locatePending(p) && <button className="button secondary result-pending-action" type="button" onClick={() => onResolvePending(locatePending(p)!)}>Corrigir dados</button>}</li>)}</ul></div> : <>
      {/* Keep the viewer subtree mounted when switching tabs: Safari should not
          create/destroy WebGL contexts with each result-section change. */}
      <div role="tabpanel" id="result-panel-model" aria-labelledby="result-tab-model"
        hidden={activeSection!=="model"} className="result-section-panel result-model-panel">
        <StructurePreview key={open3DRequest} project={project} result={result}
          onConfigureProfile={onConfigureProfile} onEditStructure={onEditStructure}
          startIn3D={startIn3D}/>
        <p className="result-model-context">Tesouras: {model.frameCount} linhas · Terças: {model.purlinRows} linhas · Espaçamentos entre eixos: {formatMeasure(model.frameSpacingM, 2)} m / {formatMeasure(model.purlinSpacingM, 2)} m.</p>
      </div>
      <div role="tabpanel" id="result-panel-materials" aria-labelledby="result-tab-materials"
        hidden={activeSection!=="materials"} className="result-section-panel">
        <h3>Quantitativos por perfil</h3>
        <p className="field-hint">Agrupados para consulta. Todos os comprimentos geométricos e IDs originais permanecem preservados nos arquivos.</p>
        <div className="takeoff-table-scroll" tabIndex={activeSection==="materials"?0:-1} role="region" aria-label="Lista de materiais">
          <table className="takeoff-table result-materials-table"><thead><tr><th>Categoria / perfil</th><th>Peças</th><th>Total (m)</th><th>Massa (kg)</th></tr></thead>
          <tbody>{grouped.map(group => <tr key={group.key}>
            <td><strong>{roleLabels[group.role]}</strong><div>{group.profileLabel}</div>
              {group.steelGrade && <small>{group.steelGrade}</small>}
              <details className="result-material-lengths"><summary>{group.rows.length} comprimentos · identificar peças</summary>
                <ul>{group.rows.map(row=><li key={row.key}><strong>{formatMeasure(row.lengthMm/1000,2)} m</strong> · {row.quantity} peças · {formatMeasure(row.totalLengthM,2)} m
                  <details><summary>Ver IDs</summary><span>{row.pieceIds.join(", ")}</span></details>
                </li>)}</ul>
              </details>
            </td>
            <td>{group.quantity}</td><td>{formatMeasure(group.totalLengthM, 2)}</td>
            <td>{group.massKg===null?"Não determinada":formatMeasure(group.massKg,2)}</td>
          </tr>)}</tbody></table>
        </div>
        {!model.massComplete && <p className="field-hint">A massa total não está determinada: há perfis sem massa por metro cadastrada.</p>}
      </div>
      <div role="tabpanel" id="result-panel-engineering" aria-labelledby="result-tab-engineering"
        hidden={activeSection!=="engineering"} className="result-section-panel">
        <section className="technical-review">
          <h3>Pendências da revisão técnica</h3>
          <p><strong>{result.pending.length} ocorrências</strong> em {pending.length} grupos de avisos. O levantamento não representa verificação estrutural aprovada.</p>
          {pending.length ? <ul>{pending.map((item,index) => {
            const target = locatePendingGroup(item);
            return <li key={index}>{item.text}
              {target && onResolvePending && <button className="button secondary result-pending-action" type="button" onClick={() => onResolvePending(target)}>
                {target.role ? "Editar perfil" : target.step === 1 ? "Editar medidas" : "Corrigir na estrutura"}
              </button>}
              {item.sources.length>1 && <details><summary>Ver as {item.count} ocorrências originais</summary><ul>{item.sources.map((source,i)=><li key={i}>{source}</li>)}</ul></details>}
            </li>;
          })}</ul> : <p>Não há pendências cadastrais nesta geometria. As verificações normativas ainda não estão completas.</p>}
          <details><summary>Hipóteses e limites desta geração geométrica</summary><ul>{result.notes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>
        </section>
      </div>
      <div role="tabpanel" id="result-panel-files" aria-labelledby="result-tab-files"
        hidden={activeSection!=="files"} className="result-section-panel">
        <section className="proposal-delivery">
          <h3>Arquivos preliminares</h3>
          <p>PDF para consulta e planilha com peças e coordenadas. Os documentos incluem pendências e não autorizam aquisição, corte ou fabricação.</p>
          <div className="actions">
            <button type="button" className="button" disabled={busy} onClick={() => void download("pdf")}><Download size={18}/>{busy?"Gerando…":"Baixar lista em PDF"}</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void download("xlsx")}><Download size={18}/>Baixar lista em Excel</button>
          </div>
          {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>}
  </section>;
}
